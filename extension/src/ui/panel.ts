import type { CaptureStore } from '../content/capture-controller.js';
import type { RecentHistoryStore } from '../content/recent-history-store.js';
import { KeyboardRouter } from '../content/keyboard.js';
import { RequestGovernor } from '../content/request-governor.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import {
  createDisplayRecord,
  isDurableImageSourceUrl,
  validateImageRecordUrl,
  type ImageRecordUrlValidation,
} from '../core/display-records.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { applyFieldLoadFailureToState, applyFieldSplitSpecToState, reducePanelAction } from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type { BookmarkStore, ImportedImageFile, PanelAction, PanelState, TargetState } from '../core/types.js';
import { isCapturedResult } from '../core/image/capture-result.js';
import { filenameFromUrl } from '../core/image/downloads.js';
import { pushVisibleUrlWhenSameOrigin } from '../core/image/image-navigation.js';
import { applyFieldSplitSpecs, createFieldSplitSpec } from '../core/url/field-splits.js';
import { parseUrl } from '../core/url/parse-url.js';
import { bumpUrlField, rebuildUrl, setUrlFieldValue } from '../core/url/rebuild-url.js';
import { collectUrlFields, selectDefaultField } from '../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';
import {
  createThumbnailDataUrlFromDataUrl,
  createThumbnailDataUrlFromImage,
  createThumbnailDataUrlFromUrl,
  fetchThumbnailSource,
} from '../content/thumbnail-generator.js';
import {
  DEFAULT_LOCAL_SETTINGS,
  LocalSettingsRepository,
  exportEncryptedBookmarks,
  exportEncryptedHistory,
  exportPlainBookmarks,
  exportPlainHistory,
  importBookmarkletJson,
  importBookmarks as importBookmarkRecords,
  importEncryptedHistory,
  type DurableBookmarkPayloadV1,
  type DurableHistoryPayloadV1,
} from '../content/panel-services.js';
import { renderPanel } from './render.js';

const ROOT_ID = 'image-trail-panel-root';
const STYLE_PATH = 'src/ui/styles/panel.css';

interface ValidatedRecordUrl extends ImageRecordUrlValidation {
  readonly preloadDataUrl?: string;
}

interface RecordAddOptions {
  readonly trustLoadedImage?: boolean;
}

function addItems(items: readonly string[], nextItems: readonly string[]): readonly string[] {
  return [...items, ...nextItems.filter((item) => !items.includes(item))];
}

function removeItems(items: readonly string[], removedItems: readonly string[]): readonly string[] {
  if (removedItems.length === 0) return items;
  const removed = new Set(removedItems);
  return items.filter((item) => !removed.has(item));
}

function toTargetState(snapshot: TargetSelectionSnapshot): TargetState {
  const selectedUrl = snapshot.selected?.url ?? null;
  return {
    mode: snapshot.mode,
    picking: snapshot.picking,
    candidateCount: snapshot.candidateCount,
    selectedUrl: selectedUrl?.startsWith('data:') ? 'data:' : selectedUrl,
    selectedHandleId: snapshot.selected?.handleId ?? null,
    selectedDimensions: snapshot.selected ? `${snapshot.selected.width}×${snapshot.selected.height}` : null,
    message: snapshot.message,
  };
}

export class ImageTrailPanel {
  private root: HTMLElement | null = null;
  private state: PanelState = createInitialPanelState();
  private unsubscribeFromTarget: (() => void) | null = null;
  private unsubscribeFromLoads: (() => void) | null = null;
  private unsubscribeFromBookmarkRequests: (() => void) | null = null;

  private readonly governor = new RequestGovernor();
  private readonly keyboard: KeyboardRouter;
  private readonly slideshow: Slideshow;
  private readonly retry: Retry404;
  private readonly settingsRepository = new LocalSettingsRepository();
  private readonly localSettings = this.settingsRepository.load();
  private readonly bookmarkLimit = this.localSettings.visibleBookmarkSoftMax;
  private bookmarkMutationQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly pageAdapter: PageAdapter,
    private readonly bookmarkStore: BookmarkStore | null = null,
    private readonly captureStore: CaptureStore | null = null,
    private readonly recentHistoryStore: RecentHistoryStore | null = null,
  ) {
    this.state = { ...this.state, bookmarkVisibilityScope: this.localSettings.bookmarkVisibilityScope };
    this.unsubscribeFromTarget = this.pageAdapter.subscribe((snapshot) => {
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
    });
    this.unsubscribeFromLoads = this.pageAdapter.subscribeToSuccessfulLoads((target) => {
      void this.addRecentHistory(target.url, target.thumbnail, { trustLoadedImage: target.trustedLoadedImage });
    });
    this.unsubscribeFromBookmarkRequests = this.pageAdapter.subscribeToBookmarkRequests((target) => {
      this.enqueueBookmarkMutation(async () => {
        const options = { trustLoadedImage: target.trustedLoadedImage };
        const bookmarked = await this.bookmarkUrl(target.url, target.thumbnail, options);
        if (bookmarked) {
          await this.addRecentHistory(target.url, target.thumbnail, options);
        }
      });
    });
    void this.loadBookmarks();
    void this.loadRecentHistory();
    void this.refreshStorageUsage();
    void this.refreshBlobKeyStatus();

    this.keyboard = new KeyboardRouter((action) => this.handleKeyAction(action));

    this.slideshow = new Slideshow(
      (direction) => this.navigateBy(direction),
      (phase, count) => {
        this.state = setAutomationState(this.state, { slideshowPhase: phase, slideshowCount: count });
        this.render();
      },
    );

    this.retry = new Retry404(
      () => this.tryReloadCurrent(),
      (direction) => this.navigateBy(direction),
      (phase, attempt, max) => {
        this.state = setAutomationState(this.state, { retryPhase: phase, retriesUsed: attempt, retriesMax: max });
        this.render();
      },
    );
  }

  get visible(): boolean {
    return this.state.visible;
  }

  get statusMessage(): string {
    return this.state.message;
  }

  toggle(): PanelState {
    this.dispatch({ name: 'toggle-panel' });
    return this.state;
  }

  destroy(): void {
    this.state = reducePanelAction(this.state, { name: 'close-panel' });
    this.slideshow.destroy();
    this.retry.destroy();
    this.keyboard.disable();
    this.cleanupMountedElements();
  }

  private cleanupMountedElements(): void {
    this.pageAdapter.cleanup();
    document.getElementById(ROOT_ID)?.remove();
    this.root = null;
  }

  disconnect(): void {
    this.destroy();
    this.unsubscribeFromTarget?.();
    this.unsubscribeFromTarget = null;
    this.unsubscribeFromLoads?.();
    this.unsubscribeFromLoads = null;
    this.unsubscribeFromBookmarkRequests?.();
    this.unsubscribeFromBookmarkRequests = null;
  }

  private loadBookmarks = async (): Promise<void> => {
    if (!this.bookmarkStore) return;
    await this.loadBookmarkPage(0);
  };

  private loadRecentHistory = async (): Promise<void> => {
    if (!this.recentHistoryStore) return;
    const history = await this.recentHistoryStore.load(window.location.href);
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  };

  private loadBookmarkPage = async (offset: number): Promise<void> => {
    if (!this.bookmarkStore) return;
    const page = await this.bookmarkStore.loadPage({
      offset,
      limit: this.bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      scope: this.state.bookmarkVisibilityScope,
      currentPageUrl: window.location.href,
    });
    this.state = reducePanelAction(this.state, {
      name: 'bookmarks/page-loaded',
      bookmarks: page.items,
      offset: page.offset,
      limit: page.limit,
      total: page.total,
      hasOlder: page.hasOlder,
      hasNewer: page.hasNewer,
    });
    this.render();
  };

  private dispatch = (action: PanelAction): void => {
    if (action.name === 'start-target-picker') {
      this.state = reducePanelAction(this.state, action);
      this.pageAdapter.startPickMode();
      return;
    }

    if (action.name === 'stop-target-picker') {
      this.state = reducePanelAction(this.state, action);
      this.pageAdapter.stopPickMode();
      return;
    }

    if (action.name === 'target/release') {
      const snapshot = this.pageAdapter.releaseSelectedTarget();
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
      return;
    }

    if (action.name === 'bookmark/current') {
      void this.bookmarkCurrentImage();
      return;
    }

    if (action.name === 'history/remove') {
      void this.removeRecentHistory(action.id);
      return;
    }

    if (action.name === 'bookmark/load') {
      void this.loadBookmark(action.id);
      return;
    }

    if (action.name === 'bookmark/remove') {
      void this.removeBookmark(action.id);
      return;
    }

    if (action.name === 'bookmarks/older') {
      void this.loadBookmarkPage(this.state.bookmarkOffset + this.state.bookmarkLimit);
      return;
    }

    if (action.name === 'bookmarks/newer') {
      void this.loadBookmarkPage(Math.max(0, this.state.bookmarkOffset - this.state.bookmarkLimit));
      return;
    }

    if (action.name === 'bookmarks/toggle-scope') {
      this.state = reducePanelAction(this.state, action);
      this.settingsRepository.save({ ...this.localSettings, bookmarkVisibilityScope: this.state.bookmarkVisibilityScope });
      void this.loadBookmarkPage(0);
      return;
    }

    if (action.name === 'bookmarks/reload') {
      void this.loadBookmarkPage(0);
      return;
    }

    if (action.name === 'bookmarks/refresh-thumbnails') {
      void this.refreshBookmarkThumbnails();
      return;
    }

    if (action.name === 'field-value-change') {
      void this.updateFieldValue(action.id, action.value);
      return;
    }

    if (action.name === 'field-value-bump') {
      void this.bumpFieldValue(action.id, action.delta);
      return;
    }

    if (action.name === 'field-split/apply') {
      this.applyFieldSplitPattern(action.id, action.pattern);
      return;
    }

    if (action.name === 'field-split/clear') {
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'active-field/set') {
      this.state = reducePanelAction(this.state, action);
      return;
    }

    if (action.name === 'field-unlock/toggle') {
      this.state = reducePanelAction(this.state, action);
      return;
    }

    if (action.name === 'selected-url/apply') {
      void this.applySelectedUrl(action.url);
      return;
    }

    if (action.name === 'capture/request') {
      void this.captureImage(action.url, action.sourceType, action.sourceRecordId);
      return;
    }

    if (action.name === 'capture/delete') {
      void this.deleteCapturedBlob(action.id, action.blobId);
      return;
    }

    if (action.name === 'capture/cleanup-orphans') {
      void this.cleanupOrphanedBlobs();
      return;
    }

    if (action.name === 'capture/preview') {
      void this.previewRecord(action.url, action.blobId);
      return;
    }

    if (action.name === 'blob-key/setup') {
      void this.setupBlobKey(action.password);
      return;
    }

    if (action.name === 'blob-key/unlock') {
      void this.unlockBlobKey(action.password);
      return;
    }

    if (action.name === 'export/history') {
      void this.exportHistory(action.password, action.plaintext);
      return;
    }

    if (action.name === 'export/bookmarks') {
      void this.exportBookmarks(action.password, action.plaintext);
      return;
    }

    if (action.name === 'export/image') {
      this.exportImage();
      return;
    }

    if (action.name === 'import/history') {
      void this.importHistory(action.fileContent, action.password);
      return;
    }

    if (action.name === 'import/bookmarks') {
      void this.importBookmarks(action.fileContent, action.password);
      return;
    }

    if (action.name === 'import/bookmarklet') {
      void this.importBookmarklet(action.fileContent);
      return;
    }

    if (action.name === 'import/image') {
      void this.importImages(action.files);
      return;
    }

    if (action.name === 'slideshow-start') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.start();
      this.render();
      return;
    }

    if (action.name === 'slideshow-stop') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.stop();
      this.render();
      return;
    }

    if (action.name === 'slideshow-pause') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.pause();
      this.render();
      return;
    }

    if (action.name === 'slideshow-resume') {
      this.state = reducePanelAction(this.state, action);
      this.slideshow.resume();
      this.render();
      return;
    }

    if (action.name === 'retry-start') {
      this.state = reducePanelAction(this.state, action);
      this.retry.start();
      this.render();
      return;
    }

    if (action.name === 'retry-stop') {
      this.state = reducePanelAction(this.state, action);
      this.retry.stop();
      this.render();
      return;
    }

    if (action.name === 'stop-all') {
      this.slideshow.stop();
      this.retry.stop();
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'navigate-next') {
      this.navigateBy(1);
      return;
    }

    if (action.name === 'navigate-previous') {
      this.navigateBy(-1);
      return;
    }

    this.state = reducePanelAction(this.state, action);
    if (!this.state.visible) {
      this.slideshow.destroy();
      this.retry.destroy();
      this.keyboard.disable();
      this.cleanupMountedElements();
      return;
    }
    this.mount();
    this.keyboard.enable();
    this.pageAdapter.enableBookmarkShortcut();
    this.pageAdapter.autoSelectSingleImage();
    this.render();
  };

  private handleKeyAction(action: string): void {
    switch (action) {
      case 'next':
        this.dispatch({ name: 'navigate-next' });
        break;
      case 'previous':
        this.dispatch({ name: 'navigate-previous' });
        break;
      case 'slideshow-toggle':
        if (this.slideshow.currentPhase === 'running') {
          this.dispatch({ name: 'slideshow-pause' });
        } else if (this.slideshow.currentPhase === 'paused') {
          this.dispatch({ name: 'slideshow-resume' });
        } else {
          this.dispatch({ name: 'slideshow-start' });
        }
        break;
      case 'stop':
        this.dispatch({ name: 'stop-all' });
        break;
      case 'panel-toggle':
        this.dispatch({ name: 'toggle-panel' });
        break;
      case 'retry':
        this.dispatch({ name: 'retry-start' });
        break;
      default:
        break;
    }
  }

  private currentUrlModel(): ParsedUrlModel {
    const snapshot = this.pageAdapter.getSnapshot();
    const currentUrl = this.state.draftUrl ?? snapshot.selected?.url ?? window.location.href;
    return applyFieldSplitSpecs(parseUrl(currentUrl), this.state.fieldSplitSpecs);
  }

  private applyFieldSplitPattern(fieldId: string, pattern: string): void {
    let model: ParsedUrlModel;
    try {
      model = this.currentUrlModel();
    } catch {
      this.state = { ...this.state, status: 'error', message: 'Current URL could not be parsed for splitting.', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }

    const field = collectUrlFields(model).find((item) => item.id === fieldId);
    if (!field) return;

    const splitSpec = createFieldSplitSpec(field, pattern);
    if ('ok' in splitSpec) {
      this.state = { ...this.state, status: 'error', message: splitSpec.message, lastUpdatedAt: Date.now() };
      this.render();
      return;
    }

    this.state = applyFieldSplitSpecToState(this.state, splitSpec);
    this.render();
  }

  private navigateBy(delta: 1 | -1): void {
    const result = this.governor.request(() => {
      const snapshot = this.pageAdapter.getSnapshot();
      if (!snapshot.selected) return false;
      const currentUrl = snapshot.selected.url;
      if (!currentUrl) return false;
      const model = this.currentUrlModel();
      const fields = collectUrlFields(model);
      const unlockedFields = fields.filter((field) => this.isUnlockedNavigableField(field));
      const fallback = selectDefaultField(fields);
      const navigableFields = unlockedFields.length ? unlockedFields : fallback ? [fallback] : [];
      if (navigableFields.length === 0) return false;
      const bumped = navigableFields.reduce<ParsedUrlModel>((nextModel, field) => bumpUrlField(nextModel, field, delta), model);
      const nextUrl = rebuildUrl(bumped);
      void this.applySelectedUrl(
        nextUrl,
        navigableFields.filter((field) => field.location === 'query').map((field) => field.id),
      );
      return true;
    });

    this.state = setAutomationState(this.state, {
      governorStatus: result.status === 'ok' ? 'ready' : result.status,
      requestsInLastMinute: this.governor.requestsInLastMinute(),
    });
    this.render();
  }

  private async updateFieldValue(fieldId: string, nextValue: string): Promise<void> {
    const model = this.currentUrlModel();
    const fields = collectUrlFields(model);
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;

    const nextModel = setUrlFieldValue(model, field, nextValue);
    const nextUrl = rebuildUrl(nextModel);
    await this.applySelectedUrl(nextUrl, field.location === 'query' ? [fieldId] : []);
  }

  private async bumpFieldValue(fieldId: string, delta: 1 | -1): Promise<void> {
    const model = this.currentUrlModel();
    const fields = collectUrlFields(model);
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;

    const nextModel = bumpUrlField(model, field, delta);
    const nextUrl = rebuildUrl(nextModel);
    this.state = reducePanelAction(this.state, { name: 'active-field/set', id: fieldId });
    await this.applySelectedUrl(nextUrl, field.location === 'query' ? [fieldId] : []);
  }

  private async applySelectedUrl(nextUrl: string, attemptedFieldIds: readonly string[] = []): Promise<boolean> {
    const baselineFingerprint = await this.currentImageFingerprint();
    const preload = await this.preloadImageUrl(nextUrl);
    if (!preload.ok) {
      this.state = applyFieldLoadFailureToState(this.state, { draftUrl: nextUrl, attemptedFieldIds, message: preload.message });
      this.render();
      return false;
    }

    if (attemptedFieldIds.length > 0 && baselineFingerprint && preload.sha256 === baselineFingerprint) {
      this.state = this.applyFieldLoadResult(
        { ...this.state, draftUrl: nextUrl, message: 'Image loaded but did not change.', status: 'ready', lastUpdatedAt: Date.now() },
        attemptedFieldIds,
        preload.sha256,
        baselineFingerprint,
      );
      this.render();
      return false;
    }

    const snapshot = this.pageAdapter.getSnapshot();
    if (snapshot.selected) {
      const nextSnapshot = this.pageAdapter.applyUrlToSelected(nextUrl, preload.displayUrl);
      this.state = setTargetState(this.state, toTargetState(nextSnapshot));
    }
    this.state = this.applyFieldLoadResult(this.state, attemptedFieldIds, preload.sha256, baselineFingerprint);
    pushVisibleUrlWhenSameOrigin(nextUrl);
    this.render();
    return true;
  }

  private async preloadImageUrl(
    url: string,
  ): Promise<
    { readonly ok: true; readonly displayUrl: string; readonly sha256: string | null } | { readonly ok: false; readonly message: string }
  > {
    if (url.startsWith('data:image/')) return { ok: true, displayUrl: url, sha256: null };
    const result = await fetchThumbnailSource(url);
    return result.ok
      ? { ok: true, displayUrl: result.dataUrl, sha256: result.sha256 ?? null }
      : { ok: false, message: `Image failed to load: ${result.message}` };
  }

  private async currentImageFingerprint(): Promise<string | null> {
    if (this.state.currentImageFingerprint) return this.state.currentImageFingerprint;
    const currentUrl = this.state.target.selectedUrl;
    if (!currentUrl || currentUrl.startsWith('data:image/')) return null;
    const preload = await this.preloadImageUrl(currentUrl);
    if (!preload.ok || !preload.sha256) return null;
    this.state = { ...this.state, currentImageFingerprint: preload.sha256 };
    return preload.sha256;
  }

  private applyFieldLoadResult(
    state: PanelState,
    attemptedFieldIds: readonly string[],
    nextFingerprint: string | null,
    previousFingerprint: string | null,
  ): PanelState {
    const changed = Boolean(nextFingerprint && previousFingerprint && nextFingerprint !== previousFingerprint);
    const unchanged = Boolean(nextFingerprint && previousFingerprint && nextFingerprint === previousFingerprint);
    const autoUnlocked = changed
      ? attemptedFieldIds.filter((fieldId) => this.isAutoUnlockableField(fieldId) && !state.manuallyExcludedFieldIds.includes(fieldId))
      : [];

    return {
      ...state,
      failedFieldId: null,
      successfulFieldIds: changed
        ? addItems(removeItems(state.successfulFieldIds, attemptedFieldIds), attemptedFieldIds)
        : removeItems(state.successfulFieldIds, attemptedFieldIds),
      unchangedFieldIds: unchanged
        ? addItems(removeItems(state.unchangedFieldIds, attemptedFieldIds), attemptedFieldIds)
        : removeItems(state.unchangedFieldIds, attemptedFieldIds),
      unlockedFieldIds: changed
        ? addItems(removeItems(state.unlockedFieldIds, attemptedFieldIds), autoUnlocked)
        : removeItems(state.unlockedFieldIds, attemptedFieldIds),
      currentImageFingerprint: nextFingerprint ?? state.currentImageFingerprint,
    };
  }

  private isUnlockedNavigableField(field: UrlField): boolean {
    return this.state.unlockedFieldIds.includes(field.id) && this.isNavigableQueryField(field);
  }

  private isAutoUnlockableField(fieldId: string): boolean {
    const model = this.currentUrlModel();
    const field = collectUrlFields(model).find((candidate) => candidate.id === fieldId);
    return field ? this.isNavigableQueryField(field) : false;
  }

  private isNavigableQueryField(field: UrlField): boolean {
    return field.location === 'query' && (field.tokenKind === 'int' || field.tokenKind === 'hex');
  }

  private async tryReloadCurrent(): Promise<boolean> {
    const snapshot = this.pageAdapter.getSnapshot();
    if (!snapshot.selected) return false;
    const image = this.findSelectedImage(snapshot.selected.handleId);
    if (!image) return false;
    return new Promise<boolean>((resolve) => {
      const onLoad = () => {
        cleanup();
        resolve(true);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
      };
      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      const currentSrc = image.src;
      image.src = currentSrc;
    });
  }

  private findSelectedImage(handleId: string): HTMLImageElement | null {
    return document.querySelector<HTMLImageElement>(`[data-image-trail-handle="${handleId}"]`);
  }

  private async bookmarkCurrentImage(): Promise<void> {
    const url = this.state.target.selectedUrl;
    if (!url) return;
    const image = this.state.target.selectedHandleId ? this.findSelectedImage(this.state.target.selectedHandleId) : null;
    const trustLoadedImage = image ? image.complete && image.naturalWidth > 0 && image.naturalHeight > 0 : false;
    await this.bookmarkUrl(url, image ? ((await createThumbnailDataUrlFromImage(image)) ?? undefined) : undefined, { trustLoadedImage });
  }

  private enqueueBookmarkMutation(work: () => Promise<void>): void {
    this.bookmarkMutationQueue = this.bookmarkMutationQueue.then(work, work);
    void this.bookmarkMutationQueue;
  }

  private async bookmarkUrl(url: string, thumbnail?: string, options: RecordAddOptions = {}): Promise<boolean> {
    const validation = await this.validateRecordUrlForAdd(url, options);
    if (!validation.ok || !validation.sourceUrl) {
      return false;
    }
    const sourceUrl = validation.sourceUrl;
    const resolvedThumbnail = await this.resolveRecordThumbnail(sourceUrl, thumbnail, validation, options);
    const draft = createDisplayRecord({ id: sourceUrl, url: sourceUrl, thumbnail: resolvedThumbnail, source: 'bookmark' });
    const bookmark = this.bookmarkStore ? await this.bookmarkStore.save(draft) : draft;
    this.state = { ...this.state, message: `Added to Image Trail: ${bookmark.url}`, lastUpdatedAt: Date.now() };
    await this.loadBookmarkPage(0);
    this.render();
    return true;
  }

  private async addImportedImage(file: ImportedImageFile): Promise<boolean> {
    if (!file.dataUrl.startsWith('data:image/')) return false;
    const timestamp = new Date().toISOString();
    const draft = createDisplayRecord({
      id: `${timestamp}:${file.name}`,
      url: file.dataUrl,
      title: file.name,
      label: file.name,
      thumbnail: file.dataUrl,
      timestamp,
      source: 'bookmark',
    });
    const bookmark = this.bookmarkStore ? await this.bookmarkStore.save(draft) : draft;
    const historyItem = createDisplayRecord({ ...draft, id: `${timestamp}:history:${file.name}`, source: 'history' });
    const history = this.recentHistoryStore
      ? await this.recentHistoryStore.add(historyItem, window.location.href)
      : [historyItem, ...this.state.history];
    this.state = {
      ...this.state,
      history: history.slice(0, 30),
      message: `Added imported image to Image Trail: ${bookmark.label ?? file.name}`,
      lastUpdatedAt: Date.now(),
    };
    await this.loadBookmarkPage(0);
    this.render();
    return true;
  }

  private async addRecentHistory(url: string, thumbnail?: string, options: RecordAddOptions = {}): Promise<void> {
    const validation = await this.validateRecordUrlForAdd(url, options);
    if (!validation.ok || !validation.sourceUrl) return;
    const resolvedThumbnail = await this.resolveRecordThumbnail(validation.sourceUrl, thumbnail, validation, options);
    const next = reducePanelAction(this.state, {
      name: 'history/add-loaded',
      url: validation.sourceUrl,
      thumbnail: resolvedThumbnail,
    }).history;
    const item = next[0];
    if (!item) return;
    const history = this.recentHistoryStore ? await this.recentHistoryStore.add(item, window.location.href) : next;
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  }

  private async resolveRecordThumbnail(
    sourceUrl: string,
    thumbnail: string | undefined,
    validation: ValidatedRecordUrl,
    options: RecordAddOptions,
  ): Promise<string | undefined> {
    if (thumbnail) return thumbnail;
    if (validation.preloadDataUrl) return (await createThumbnailDataUrlFromDataUrl(validation.preloadDataUrl)) ?? undefined;
    if (!options.trustLoadedImage) return undefined;
    return (await createThumbnailDataUrlFromUrl(sourceUrl)) ?? sourceUrl;
  }

  private async validateRecordUrlForAdd(url: string, options: RecordAddOptions = {}): Promise<ValidatedRecordUrl> {
    const validation = options.trustLoadedImage ? this.validateLoadedImageUrl(url) : this.validateRecordUrl(url);
    if (!validation.ok || !validation.sourceUrl) return validation;
    if (validation.sourceUrl.startsWith('data:image/')) return validation;
    if (options.trustLoadedImage) return validation;
    const fetchResult = await fetchThumbnailSource(validation.sourceUrl);
    if (fetchResult.ok) return { ...validation, preloadDataUrl: fetchResult.dataUrl };

    this.state = {
      ...this.state,
      message: `Image Trail could not save this URL because the image failed to load: ${fetchResult.message}`,
      status: 'error',
      lastUpdatedAt: Date.now(),
    };
    this.render();
    return { ok: false, message: this.state.message };
  }

  private validateRecordUrl(url: string): ReturnType<typeof validateImageRecordUrl> {
    const validation = validateImageRecordUrl(url);
    if (!validation.ok) {
      this.state = {
        ...this.state,
        message: validation.message ?? 'Image Trail could not save this URL.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
      this.render();
    }
    return validation;
  }

  private validateLoadedImageUrl(url: string): ImageRecordUrlValidation {
    let sourceUrl: URL;
    try {
      sourceUrl = new URL(url, document.baseURI);
    } catch {
      return { ok: false, message: 'Image Trail could not save this URL because it is not a valid URL.' };
    }

    if (sourceUrl.protocol !== 'http:' && sourceUrl.protocol !== 'https:') {
      return { ok: false, message: 'Only http(s) image URLs can be saved to Image Trail.' };
    }

    return { ok: true, sourceUrl: sourceUrl.href };
  }

  private async removeRecentHistory(id: string): Promise<void> {
    const existing = this.state.history.find((item) => item.id === id);
    if (existing?.blobId) await this.removeCapturedBlobReference(existing.blobId);
    const history = this.recentHistoryStore
      ? await this.recentHistoryStore.remove(id, window.location.href)
      : reducePanelAction(this.state, { name: 'history/remove', id }).history;
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  }

  private async loadBookmark(id: string): Promise<void> {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    await this.applySelectedUrl(bookmark.url);
  }

  private async removeBookmark(id: string): Promise<void> {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    if (bookmark.blobId) await this.removeCapturedBlobReference(bookmark.blobId);
    await this.bookmarkStore?.remove(bookmark);
    this.state = reducePanelAction(this.state, { name: 'bookmark/remove', id });
    await this.loadBookmarkPage(this.state.bookmarkOffset);
    this.render();
  }

  private async removeCapturedBlobReference(blobId: string): Promise<void> {
    if (!this.captureStore) return;
    const { usage } = await this.captureStore.requestDeleteBlob(blobId);
    this.state = reducePanelAction(this.state, { name: 'storage/update', usage });
  }

  private async cleanupOrphanedBlobs(): Promise<void> {
    if (!this.captureStore) return;
    const { deletedCount, usage } = await this.captureStore.requestCleanupOrphanedBlobs();
    this.state = reducePanelAction(
      {
        ...this.state,
        message: `Cleaned up ${deletedCount} unused original${deletedCount === 1 ? '' : 's'}.`,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      },
      { name: 'storage/update', usage },
    );
    this.render();
  }

  private async refreshBookmarkThumbnails(): Promise<void> {
    if (!this.bookmarkStore) return;
    const bookmarks = this.state.bookmarks;
    if (bookmarks.length === 0) return;

    this.state = { ...this.state, message: `Refreshing ${bookmarks.length} visible bookmark thumbnail(s)...`, lastUpdatedAt: Date.now() };
    this.render();

    let refreshed = 0;
    let unavailable = 0;
    for (const bookmark of bookmarks) {
      const thumbnail = await createThumbnailDataUrlFromUrl(bookmark.url);
      if (!thumbnail) {
        unavailable += 1;
        continue;
      }
      await this.bookmarkStore.save({ ...bookmark, thumbnail });
      refreshed += 1;
    }

    await this.loadBookmarkPage(this.state.bookmarkOffset);
    this.state = {
      ...this.state,
      message: `Refreshed ${refreshed} thumbnail${refreshed === 1 ? '' : 's'}${unavailable ? `; ${unavailable} unavailable` : ''}.`,
      lastUpdatedAt: Date.now(),
    };
    this.render();
  }

  private async captureImage(url: string, sourceType: 'target' | 'history' | 'bookmark', sourceRecordId?: string): Promise<void> {
    if (!this.captureStore) return;
    const isImportedImage = url.startsWith('data:image/');
    if (!isImportedImage && !isDurableImageSourceUrl(url)) {
      this.state = {
        ...this.state,
        message: 'Only http(s) image URLs can be captured as encrypted originals.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
      this.render();
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'capture/start' });
    this.render();
    const result = await this.captureStore.requestCapture(url, sourceType, sourceRecordId);
    this.state = reducePanelAction(this.state, { name: 'capture/complete', result, sourceRecordId });
    if (isCapturedResult(result) && sourceType === 'history' && sourceRecordId && this.recentHistoryStore) {
      const updatedHistory = this.state.history.find((item) => item.id === sourceRecordId);
      if (updatedHistory) {
        const history = await this.recentHistoryStore.add(updatedHistory, window.location.href);
        this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
      }
    }
    if (isCapturedResult(result) && sourceType === 'bookmark' && sourceRecordId && this.bookmarkStore) {
      const updatedBookmark = this.state.bookmarks.find((b) => b.id === sourceRecordId);
      if (updatedBookmark) {
        await this.bookmarkStore.save(updatedBookmark);
        await this.loadBookmarkPage(this.state.bookmarkOffset);
      }
    }
    await this.refreshStorageUsage();
    this.render();
  }

  private async deleteCapturedBlob(recordId: string, blobId: string): Promise<void> {
    if (!this.captureStore) return;
    this.state = reducePanelAction(this.state, { name: 'capture/delete', id: recordId, blobId });
    const { usage } = await this.captureStore.requestDeleteBlob(blobId);
    this.state = reducePanelAction(this.state, { name: 'storage/update', usage });
    const updatedHistory = this.state.history.find((b) => b.id === recordId);
    if (updatedHistory && this.recentHistoryStore) {
      const history = await this.recentHistoryStore.add(updatedHistory, window.location.href);
      this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    }
    const updatedBookmark = this.state.bookmarks.find((b) => b.id === recordId);
    if (updatedBookmark && this.bookmarkStore) {
      await this.bookmarkStore.save(updatedBookmark);
      await this.loadBookmarkPage(this.state.bookmarkOffset);
    }
    this.render();
  }

  private async previewRecord(url: string, blobId?: string): Promise<void> {
    if (!blobId) {
      await this.previewUrl(url);
      return;
    }

    if (!this.captureStore) {
      await this.previewUrl(url);
      return;
    }
    const retrieved = await this.captureStore.requestRetrieveBlob(blobId);
    if (!retrieved.ok) {
      this.state = { ...this.state, message: retrieved.message, status: 'error', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }

    if (await this.projectUrlToSelectedImage(retrieved.dataUrl)) {
      this.state = {
        ...this.state,
        message: `Projected encrypted original (${(retrieved.byteLength / 1024).toFixed(1)} KB).`,
        lastUpdatedAt: Date.now(),
      };
      this.render();
      return;
    }

    this.state = {
      ...this.state,
      message: 'Select a host image before previewing encrypted originals.',
      status: 'error',
      lastUpdatedAt: Date.now(),
    };
    this.render();
  }

  private async previewUrl(url: string): Promise<void> {
    if (!this.canProjectToSelectedImage()) {
      this.state = {
        ...this.state,
        message: 'Select a host image before previewing an image.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
      this.render();
      return;
    }

    if (await this.projectUrlToSelectedImage(url)) {
      this.state = { ...this.state, message: 'Projected image into selected host element.', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }
  }

  private canProjectToSelectedImage(): boolean {
    const handleId = this.state.target.selectedHandleId;
    return !!handleId && !!this.findSelectedImage(handleId);
  }

  private async projectUrlToSelectedImage(url: string): Promise<boolean> {
    const handleId = this.state.target.selectedHandleId;
    if (!handleId) return false;
    const image = this.findSelectedImage(handleId);
    if (!image) return false;

    const preload = await this.preloadImageUrl(url);
    if (!preload.ok) {
      this.state = { ...this.state, message: preload.message, status: 'error', lastUpdatedAt: Date.now() };
      this.render();
      return false;
    }

    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timeout = window.setTimeout(() => finish(false), 4_000);
      const finish = (ok: boolean): void => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        image.removeEventListener('load', onLoad);
        image.removeEventListener('error', onError);
        if (ok) {
          this.state = setTargetState(this.state, toTargetState(this.pageAdapter.getSnapshot()));
          this.render();
        } else {
          this.state = {
            ...this.state,
            message: 'Image failed to load after preload succeeded.',
            status: 'error',
            lastUpdatedAt: Date.now(),
          };
          this.render();
        }
        resolve(ok);
      };
      const isProjectedUrlLoaded = (): boolean =>
        image.naturalWidth > 0 && image.naturalHeight > 0 && (image.currentSrc === preload.displayUrl || image.src === preload.displayUrl);
      const onLoad = (): void => finish(isProjectedUrlLoaded());
      const onError = (): void => finish(false);

      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      const snapshot = this.pageAdapter.applyUrlToSelected(url, preload.displayUrl);
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
      if (image.complete && isProjectedUrlLoaded()) {
        queueMicrotask(() => finish(true));
      }
    });
  }

  private async setupBlobKey(password: string): Promise<void> {
    if (!this.captureStore) return;
    const result = await this.captureStore.setupBlobKey(password);
    this.state = reducePanelAction(
      { ...this.state, message: result.message, status: result.ok ? 'ready' : 'error', lastUpdatedAt: Date.now() },
      { name: 'blob-key/status', unlocked: result.ok, keyReference: result.ok ? result.keyReference : null, hasKey: result.ok },
    );
    this.render();
  }

  private async unlockBlobKey(password: string): Promise<void> {
    if (!this.captureStore) return;
    const result = await this.captureStore.unlockBlobKey(password);
    this.state = reducePanelAction(
      { ...this.state, message: result.message, status: result.ok ? 'ready' : 'error', lastUpdatedAt: Date.now() },
      {
        name: 'blob-key/status',
        unlocked: result.ok,
        keyReference: result.ok ? result.keyReference : null,
        hasKey: this.state.blobKeyAvailable,
      },
    );
    this.render();
  }

  private async refreshBlobKeyStatus(): Promise<void> {
    if (!this.captureStore) return;
    const result = await this.captureStore.requestBlobKeyStatus();
    this.state = reducePanelAction(this.state, {
      name: 'blob-key/status',
      unlocked: result.unlocked,
      keyReference: result.keyReference,
      hasKey: result.hasKey,
    });
    this.render();
  }

  private async exportHistory(password: string, plaintext: boolean): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const entries = this.state.history.map(historyRecordToExportEntry);
    const result = plaintext ? exportPlainHistory({ entries }) : await exportEncryptedHistory({ entries, password });
    this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
  }

  private async exportBookmarks(password: string, plaintext: boolean): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const bookmarks = await this.loadAllBookmarksForExport();
    const entries = bookmarks.map(bookmarkRecordToExportEntry);
    const result = plaintext ? exportPlainBookmarks({ entries }) : await exportEncryptedBookmarks({ entries, password });
    this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
  }

  private finishExport(fileContent: string | undefined, fileName: string | undefined, message: string, ok: boolean): void {
    if (!ok || !fileContent || !fileName) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message });
      this.render();
      return;
    }
    downloadTextFile(fileContent, fileName);
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message });
    this.render();
  }

  private exportImage(): void {
    const url = this.selectedImageExportUrl();
    if (!url) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: 'Select an image before exporting.' });
      this.render();
      return;
    }
    downloadUrl(url, filenameForExportedImage(url));
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message: 'Image export started.' });
    this.render();
  }

  private selectedImageExportUrl(): string | null {
    const selectedUrl = this.state.target.selectedUrl;
    if (selectedUrl && selectedUrl !== 'data:') return selectedUrl;
    const image = this.state.target.selectedHandleId ? this.findSelectedImage(this.state.target.selectedHandleId) : null;
    return image?.currentSrc || image?.src || null;
  }

  private async importImages(files: readonly ImportedImageFile[]): Promise<void> {
    if (files.length === 0) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: 'Choose one or more image files to import.' });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    let imported = 0;
    for (const file of files) {
      if (await this.addImportedImage(file)) imported += 1;
    }

    if (imported === 0) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: 'No selected image files could be imported.' });
    } else {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/complete',
        message: `Imported ${imported} image${imported === 1 ? '' : 's'} into bookmarks and recent history.`,
      });
    }
    this.render();
  }

  private async importHistory(fileContent: string, password: string): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await importEncryptedHistory(fileContent, password);
    if (!result.status.ok) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.status.message });
      this.render();
      return;
    }
    for (const entry of result.entries) {
      const record = historyPayloadToDisplayRecord(entry.uuid, entry.payload);
      await this.recentHistoryStore?.add(record, window.location.href);
    }
    await this.loadRecentHistory();
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `${result.status.message}${result.plaintext ? ' Plaintext import was reloaded into extension state.' : ''}`,
    });
    this.render();
  }

  private async importBookmarks(fileContent: string, password: string): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await importBookmarkRecords(fileContent, password);
    if (!result.status.ok) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.status.message });
      this.render();
      return;
    }
    for (const entry of result.entries) {
      await this.bookmarkStore?.save(bookmarkPayloadToDisplayRecord(entry.uuid, entry.payload));
    }
    await this.loadBookmarkPage(0);
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `${result.status.message}${result.plaintext ? ' Plaintext import was encrypted into bookmark storage.' : ''}`,
    });
    this.render();
  }

  private async importBookmarklet(fileContent: string): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = importBookmarkletJson(fileContent);
    if (!result.status.ok) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.status.message });
      this.render();
      return;
    }
    for (const entry of result.bookmarks) {
      await this.bookmarkStore?.save(bookmarkPayloadToDisplayRecord(entry.uuid, entry.payload));
    }
    await this.loadBookmarkPage(0);
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message: result.status.message });
    this.render();
  }

  private async loadAllBookmarksForExport(): Promise<readonly ImageDisplayRecord[]> {
    if (!this.bookmarkStore) return this.state.bookmarks;
    const all: ImageDisplayRecord[] = [];
    let offset = 0;
    const limit = 100;
    for (;;) {
      const page = await this.bookmarkStore.loadPage({ offset, limit, scope: 'global', currentPageUrl: window.location.href });
      all.push(...page.items);
      if (!page.hasOlder) return all;
      offset = page.offset + page.limit;
    }
  }

  private async refreshStorageUsage(): Promise<void> {
    if (!this.captureStore) return;
    const usage = await this.captureStore.requestStorageUsage();
    this.state = reducePanelAction(this.state, { name: 'storage/update', usage });
  }

  private mount(): void {
    if (!this.root) {
      const host = document.getElementById(ROOT_ID) ?? document.createElement('div');
      host.id = ROOT_ID;
      const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = chrome.runtime.getURL(STYLE_PATH);
      this.root = document.createElement('aside');
      this.root.className = 'image-trail-panel-root image-trail-panel';
      this.root.setAttribute('role', 'dialog');
      this.root.setAttribute('aria-label', 'Image Trail panel');
      shadow.replaceChildren(link, this.root);
      (document.body ?? document.documentElement).append(host);
    }
  }

  private render(): void {
    if (this.root) {
      renderPanel({ root: this.root, dispatch: this.dispatch }, this.state);
    }
  }
}

function historyRecordToExportEntry(record: ImageDisplayRecord): { readonly uuid: string; readonly payload: DurableHistoryPayloadV1 } {
  return {
    uuid: record.id,
    payload: {
      url: record.url,
      title: record.title,
      label: record.label,
      thumbnail: record.thumbnail,
      capturedAt: record.timestamp,
      captureStatus: record.storedOriginal ? 'downloaded' : 'remote-only',
      storedOriginal: record.storedOriginal,
    },
  };
}

function bookmarkRecordToExportEntry(record: ImageDisplayRecord): { readonly uuid: string; readonly payload: DurableBookmarkPayloadV1 } {
  return {
    uuid: record.id,
    payload: {
      url: record.url,
      title: record.title,
      label: record.label,
      thumbnail: record.thumbnail,
      bookmarkedAt: record.timestamp,
      downloadedAt: record.downloadedAt,
      capturedAt: record.capturedAt,
      sourceCompatibility: record.source === 'favorites' ? 'favorites' : undefined,
      storedOriginal: record.storedOriginal,
    },
  };
}

function historyPayloadToDisplayRecord(uuid: string, payload: DurableHistoryPayloadV1): ImageDisplayRecord {
  return createDisplayRecord({
    id: uuid,
    url: payload.url,
    title: payload.title,
    label: payload.label,
    thumbnail: payload.thumbnail,
    timestamp: payload.capturedAt,
    captureStatus: payload.storedOriginal ? 'captured' : undefined,
    blobId: payload.storedOriginal?.blobId,
    storedOriginal: payload.storedOriginal,
    source: 'history',
  });
}

function bookmarkPayloadToDisplayRecord(uuid: string, payload: DurableBookmarkPayloadV1): ImageDisplayRecord {
  return createDisplayRecord({
    id: uuid,
    url: payload.url,
    title: payload.title,
    label: payload.label,
    thumbnail: payload.thumbnail,
    timestamp: payload.bookmarkedAt,
    downloadedAt: payload.downloadedAt,
    capturedAt: payload.capturedAt ?? payload.storedOriginal?.capturedAt,
    captureStatus: payload.storedOriginal ? 'captured' : undefined,
    blobId: payload.storedOriginal?.blobId,
    storedOriginal: payload.storedOriginal,
    source: payload.sourceCompatibility ?? 'bookmark',
  });
}

function downloadTextFile(fileContent: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([fileContent], { type: 'application/json' }));
  downloadUrl(url, fileName);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function filenameForExportedImage(url: string): string {
  if (!url.startsWith('data:image/')) return filenameFromUrl(url);
  const extension = /^data:image\/([a-z0-9.+-]+);/iu.exec(url)?.[1]?.toLowerCase();
  const normalized = extension === 'jpeg' ? 'jpg' : extension;
  return `image-trail-image.${normalized && /^[a-z0-9]+$/u.test(normalized) ? normalized : 'png'}`;
}

function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
