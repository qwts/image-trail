import type { CaptureStore } from '../content/capture-controller.js';
import type { RecentHistoryStore } from '../content/recent-history-store.js';
import { KeyboardRouter } from '../content/keyboard.js';
import { RequestGovernor } from '../content/request-governor.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import { createDisplayRecord, isDurableImageSourceUrl, sourceImageUrlFrom, validateImageRecordUrl } from '../core/display-records.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { reducePanelAction } from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type { BookmarkStore, ImportedImageFile, PanelAction, PanelState, TargetState } from '../core/types.js';
import { isCapturedResult } from '../core/image/capture-result.js';
import { filenameFromUrl } from '../core/image/downloads.js';
import { DEFAULT_LOCAL_SETTINGS, LocalSettingsRepository } from '../data/local-settings.js';
import { applyImageUrl, pushVisibleUrlWhenSameOrigin } from '../core/image/image-navigation.js';
import { parseUrl } from '../core/url/parse-url.js';
import { bumpUrlField, rebuildUrl, setUrlFieldValue } from '../core/url/rebuild-url.js';
import { collectUrlFields, selectDefaultField } from '../core/url/tokenize-fields.js';
import { createThumbnailDataUrlFromImage, createThumbnailDataUrlFromUrl } from '../content/thumbnail-generator.js';
import { importBookmarkletJson } from '../data/import-export/bookmarklet-import.js';
import { exportEncryptedBookmarks, exportPlainBookmarks } from '../data/import-export/bookmarks-export.js';
import { importBookmarks as importBookmarkRecords } from '../data/import-export/bookmarks-import.js';
import { exportEncryptedHistory, exportPlainHistory } from '../data/import-export/history-export.js';
import { importEncryptedHistory } from '../data/import-export/history-import.js';
import type { DurableBookmarkPayloadV1, DurableHistoryPayloadV1 } from '../data/types.js';
import { renderPanel } from './render.js';

const ROOT_ID = 'image-trail-panel-root';
const STYLE_PATH = 'src/ui/styles/panel.css';

function sourceUrlForBookmark(url: string): string {
  try {
    return sourceImageUrlFrom(url).href;
  } catch {
    return url;
  }
}

function imageUrlLoads(url: string, timeoutMs = 8_000): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (ok: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      image.onload = null;
      image.onerror = null;
      resolve(ok);
    };
    const timeout = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0);
    image.onerror = () => finish(false);
    image.src = url;
  });
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
      void this.addRecentHistory(target.url, target.thumbnail);
    });
    this.unsubscribeFromBookmarkRequests = this.pageAdapter.subscribeToBookmarkRequests((target) => {
      this.enqueueBookmarkMutation(async () => {
        const bookmarked = await this.bookmarkUrl(target.url, target.thumbnail);
        if (bookmarked) await this.addRecentHistory(sourceUrlForBookmark(target.url), target.thumbnail);
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
      this.loadBookmark(action.id);
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
      this.updateFieldValue(action.id, action.value);
      return;
    }

    if (action.name === 'active-field/set') {
      this.state = reducePanelAction(this.state, action);
      return;
    }

    if (action.name === 'selected-url/apply') {
      this.applySelectedUrl(action.url);
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
      this.exportImage(action.url);
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

  private navigateBy(delta: 1 | -1): void {
    const result = this.governor.request(() => {
      const snapshot = this.pageAdapter.getSnapshot();
      if (!snapshot.selected) return false;
      const image = this.findSelectedImage(snapshot.selected.handleId);
      if (!image) return false;
      const currentUrl = snapshot.selected.url;
      if (!currentUrl) return false;
      const model = parseUrl(currentUrl);
      const fields = collectUrlFields(model);
      const field = selectDefaultField(fields);
      if (!field) return false;
      const bumped = bumpUrlField(model, field, delta);
      const nextUrl = rebuildUrl(bumped);
      applyImageUrl(image, nextUrl);
      return true;
    });

    this.state = setAutomationState(this.state, {
      governorStatus: result.status === 'ok' ? 'ready' : result.status,
      requestsInLastMinute: this.governor.requestsInLastMinute(),
    });
    this.render();
  }

  private updateFieldValue(fieldId: string, nextValue: string): void {
    const snapshot = this.pageAdapter.getSnapshot();

    const model = parseUrl(snapshot.selected?.url ?? window.location.href);
    const fields = collectUrlFields(model);
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;

    const nextModel = setUrlFieldValue(model, field, nextValue);
    const nextUrl = rebuildUrl(nextModel);
    if (snapshot.selected) {
      const nextSnapshot = this.pageAdapter.applyUrlToSelected(nextUrl);
      this.state = setTargetState(this.state, toTargetState(nextSnapshot));
    }
    pushVisibleUrlWhenSameOrigin(nextUrl);
    this.render();
  }

  private applySelectedUrl(nextUrl: string): void {
    const snapshot = this.pageAdapter.getSnapshot();
    if (snapshot.selected) {
      const nextSnapshot = this.pageAdapter.applyUrlToSelected(nextUrl);
      this.state = setTargetState(this.state, toTargetState(nextSnapshot));
    }
    pushVisibleUrlWhenSameOrigin(nextUrl);
    this.render();
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
    await this.bookmarkUrl(url, image ? (await createThumbnailDataUrlFromImage(image)) ?? undefined : undefined);
  }

  private enqueueBookmarkMutation(work: () => Promise<void>): void {
    this.bookmarkMutationQueue = this.bookmarkMutationQueue.then(work, work);
    void this.bookmarkMutationQueue;
  }

  private async bookmarkUrl(url: string, thumbnail?: string): Promise<boolean> {
    const validation = await this.validateRecordUrlForAdd(url);
    if (!validation.ok || !validation.sourceUrl) {
      return false;
    }
    const sourceUrl = validation.sourceUrl;
    const draft = createDisplayRecord({ id: sourceUrl, url: sourceUrl, thumbnail, source: 'bookmark' });
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
    const history = this.recentHistoryStore ? await this.recentHistoryStore.add(historyItem, window.location.href) : [historyItem, ...this.state.history];
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

  private async addRecentHistory(url: string, thumbnail?: string): Promise<void> {
    const validation = await this.validateRecordUrlForAdd(url);
    if (!validation.ok || !validation.sourceUrl) return;
    const next = reducePanelAction(this.state, { name: 'history/add-loaded', url: validation.sourceUrl, thumbnail }).history;
    const item = next[0];
    if (!item) return;
    const history = this.recentHistoryStore ? await this.recentHistoryStore.add(item, window.location.href) : next;
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  }

  private async validateRecordUrlForAdd(url: string): Promise<ReturnType<typeof validateImageRecordUrl>> {
    const validation = this.validateRecordUrl(url);
    if (!validation.ok || !validation.sourceUrl) return validation;
    if (await imageUrlLoads(validation.sourceUrl)) return validation;

    this.state = {
      ...this.state,
      message: 'Image Trail could not save this URL because the image failed to load.',
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

  private async removeRecentHistory(id: string): Promise<void> {
    const existing = this.state.history.find((item) => item.id === id);
    if (existing?.blobId) await this.removeCapturedBlobReference(existing.blobId);
    const history = this.recentHistoryStore
      ? await this.recentHistoryStore.remove(id, window.location.href)
      : reducePanelAction(this.state, { name: 'history/remove', id }).history;
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  }

  private loadBookmark(id: string): void {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    const snapshot = this.pageAdapter.applyUrlToSelected(bookmark.url);
    this.state = setTargetState(this.state, toTargetState(snapshot));
    this.render();
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
    if (!isDurableImageSourceUrl(url)) {
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
    const result = await this.captureStore.requestCapture(sourceUrlForBookmark(url), sourceType, sourceRecordId);
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

    const result = await this.captureStore.requestBlobPreview(blobId);
    if (!result.ok) {
      this.state = { ...this.state, message: result.message, status: 'error', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }
    this.state = { ...this.state, message: `Opened encrypted original preview (${(result.byteLength / 1024).toFixed(1)} KB).`, lastUpdatedAt: Date.now() };
    this.render();
  }

  private async previewUrl(url: string): Promise<void> {
    if (await this.projectUrlToSelectedImage(url)) {
      this.state = { ...this.state, message: 'Projected image into selected host element.', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }

    window.open(url, '_blank', 'noopener');
    this.state = { ...this.state, message: 'Opened image preview in a new tab.', lastUpdatedAt: Date.now() };
    this.render();
  }

  private async projectUrlToSelectedImage(url: string): Promise<boolean> {
    const handleId = this.state.target.selectedHandleId;
    const previousUrl = this.state.target.selectedUrl;
    if (!handleId) return false;
    const image = this.findSelectedImage(handleId);
    if (!image) return false;

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
        } else if (previousUrl) {
          const snapshot = this.pageAdapter.applyUrlToSelected(previousUrl);
          this.state = setTargetState(this.state, toTargetState(snapshot));
          this.render();
        }
        resolve(ok);
      };
      const isProjectedUrlLoaded = (): boolean =>
        image.naturalWidth > 0 &&
        image.naturalHeight > 0 &&
        (image.currentSrc === url || image.src === url);
      const onLoad = (): void => finish(isProjectedUrlLoaded());
      const onError = (): void => finish(false);

      image.addEventListener('load', onLoad, { once: true });
      image.addEventListener('error', onError, { once: true });
      const snapshot = this.pageAdapter.applyUrlToSelected(url);
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
      { name: 'blob-key/status', unlocked: result.ok, keyReference: result.ok ? result.keyReference : null, hasKey: this.state.blobKeyAvailable },
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

  private exportImage(url: string): void {
    downloadUrl(url, filenameFromUrl(url));
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message: 'Image export started.' });
    this.render();
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

function downloadUrl(url: string, fileName: string): void {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
