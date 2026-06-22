import type { CaptureStore } from '../content/capture-controller.js';
import { requestEncryptedImageExport, requestEncryptedImageImport, requestImageDownload } from '../content/download-controller.js';
import type { RecallStore } from '../content/recall-store.js';
import type { RecentHistoryStore } from '../content/recent-history-store.js';
import { KeyboardRouter } from '../content/keyboard.js';
import { RequestGovernor } from '../content/request-governor.js';
import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import {
  createDisplayRecord,
  encryptedBlobIdForRecord,
  isDurableImageSourceUrl,
  validateImageRecordUrl,
  type ImageRecordUrlValidation,
} from '../core/display-records.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { applyFieldLoadFailureToState, applyFieldSplitSpecToState, reducePanelAction } from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type {
  BookmarkStore,
  ImportedEncryptedImageFile,
  ImportedImageFile,
  PanelAction,
  PanelPosition,
  PanelPositionStore,
  PanelState,
  TargetState,
  UrlTemplateStore,
} from '../core/types.js';
import { isCapturedResult } from '../core/image/capture-result.js';
import { filenameFromUrl, selectImageDownloadUrls } from '../core/image/downloads.js';
import { pushVisibleUrlWhenSameOrigin } from '../core/image/image-navigation.js';
import { VISIBLE_BOOKMARK_SOFT_MAX_LIMITS } from '../core/settings.js';
import { applyFieldSplitSpecs, createFieldSplitSpec } from '../core/url/field-splits.js';
import { parseUrl } from '../core/url/parse-url.js';
import { bumpUrlField, rebuildUrl, setUrlFieldValue } from '../core/url/rebuild-url.js';
import { collectUrlFields, selectDefaultField } from '../core/url/tokenize-fields.js';
import {
  createUrlTemplateRecord,
  findBestMatchingTemplate,
  updateTemplateSettings,
  updateTemplateFields,
  type UrlTemplateRecord,
} from '../core/url/templates.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';
import {
  createThumbnailDataUrlFromDataUrl,
  createThumbnailDataUrlFromImage,
  createThumbnailDataUrlFromUrl,
  fetchThumbnailSource,
  isTransientBlobUrl,
} from '../content/thumbnail-generator.js';
import {
  DEFAULT_LOCAL_SETTINGS,
  exportEncryptedBookmarks,
  exportEncryptedHistory,
  exportPlainBookmarks,
  exportPlainHistory,
  importBookmarkletJson,
  importBookmarks as importBookmarkRecords,
  importEncryptedHistory,
  type LocalSettingsStore,
  type PlaintextLocalSettings,
  type DurableBookmarkPayloadV1,
  type DurableHistoryPayloadV1,
} from '../content/panel-services.js';
import { renderPanel, renderRecallDrawer, type PanelLayoutState } from './render.js';
import { clampPanelPosition, hostnameFromLocation } from './panel-position.js';

const ROOT_ID = 'image-trail-panel-root';
const STYLE_PATH = 'src/ui/styles/panel.css';
const RECALL_DRAWER_OPEN_ANIMATION_MS = 190;
const RECALL_SUCCESS_MESSAGE_MS = 1800;

interface ValidatedRecordUrl extends ImageRecordUrlValidation {
  readonly preloadDataUrl?: string;
}

interface RecordAddOptions {
  readonly trustLoadedImage?: boolean;
  readonly width?: number;
  readonly height?: number;
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
  private recallRoot: HTMLElement | null = null;
  private state: PanelState = createInitialPanelState();
  private unsubscribeFromTarget: (() => void) | null = null;
  private unsubscribeFromLoads: (() => void) | null = null;
  private unsubscribeFromBookmarkRequests: (() => void) | null = null;

  private readonly governor = new RequestGovernor();
  private readonly keyboard: KeyboardRouter;
  private readonly slideshow: Slideshow;
  private readonly retry: Retry404;
  private localSettings: PlaintextLocalSettings = DEFAULT_LOCAL_SETTINGS;
  private previewScrollAnchorId: string | null = null;
  private projectionRevision = 0;
  private bookmarkMutationQueue: Promise<void> = Promise.resolve();
  private panelPositionRestored = false;
  private panelPositionRestorePromise: Promise<void> | null = null;
  private panelPositionRestoreAttempt = 0;
  private restoredPanelPosition: PanelPosition | null = null;
  private recallOpeningUntil = 0;
  private recallMessageClearTimer: number | null = null;
  private readonly layoutState: PanelLayoutState = {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
  };

  constructor(
    private readonly pageAdapter: PageAdapter,
    private readonly bookmarkStore: BookmarkStore | null = null,
    private readonly captureStore: CaptureStore | null = null,
    private readonly recentHistoryStore: RecentHistoryStore | null = null,
    private readonly recallStore: RecallStore | null = null,
    private readonly panelPositionStore: PanelPositionStore | null = null,
    private readonly localSettingsStore: LocalSettingsStore | null = null,
    private readonly urlTemplateStore: UrlTemplateStore | null = null,
  ) {
    this.unsubscribeFromTarget = this.pageAdapter.subscribe((snapshot) => {
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
      void this.loadUrlTemplates();
    });
    this.unsubscribeFromLoads = this.pageAdapter.subscribeToSuccessfulLoads((target) => {
      void this.addRecentHistory(target.url, target.thumbnail, {
        trustLoadedImage: target.trustedLoadedImage,
        width: target.width,
        height: target.height,
      });
    });
    this.unsubscribeFromBookmarkRequests = this.pageAdapter.subscribeToBookmarkRequests((target) => {
      this.enqueueBookmarkMutation(async () => {
        const options = { trustLoadedImage: target.trustedLoadedImage, width: target.width, height: target.height };
        const bookmarked = await this.bookmarkUrl(target.url, target.thumbnail, options);
        if (bookmarked) {
          await this.addRecentHistory(target.url, target.thumbnail, options);
        }
      });
    });
    void this.loadSettingsAndBookmarks();
    void this.loadRecentHistory();
    void this.loadUrlTemplates();
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
    this.recallRoot = null;
    this.panelPositionRestoreAttempt += 1;
    this.panelPositionRestored = false;
    this.panelPositionRestorePromise = null;
    this.restoredPanelPosition = null;
    this.clearRecallMessageTimer();
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

  private loadSettingsAndBookmarks = async (): Promise<void> => {
    await this.loadLocalSettings();
    await this.loadBookmarks();
  };

  private async loadLocalSettings(): Promise<void> {
    this.localSettings = this.localSettingsStore ? await this.localSettingsStore.load() : DEFAULT_LOCAL_SETTINGS;
    this.state = {
      ...this.state,
      bookmarkVisibilityScope: this.localSettings.bookmarkVisibilityScope,
      bookmarkLimit: this.localSettings.visibleBookmarkSoftMax,
      pinSaveStoragePreference: this.localSettings.pinSaveStoragePreference,
      privacyModeEnabled: this.localSettings.privacyModeEnabled,
      lastUpdatedAt: Date.now(),
    };
    this.render();
  }

  private saveLocalSettings(settings: PlaintextLocalSettings): void {
    this.localSettings = settings;
    void this.localSettingsStore?.save(settings);
  }

  private async loadUrlTemplates(options: { readonly render?: boolean } = {}): Promise<void> {
    if (!this.urlTemplateStore) return;
    const hostname = this.currentUrlTemplateHostname();
    if (!hostname) return;
    const templates = await this.urlTemplateStore.load(hostname);
    this.state = reducePanelAction(this.state, {
      name: 'url-templates/load',
      templates,
      activeTemplateId: this.activeTemplateIdForCurrentUrl(templates),
    });
    if (options.render !== false) this.render();
  }

  private async saveUrlTemplateFromCurrentFields(): Promise<void> {
    if (!this.urlTemplateStore) return;
    let model: ParsedUrlModel;
    try {
      model = this.currentUrlModel();
    } catch {
      return;
    }
    const fields = collectUrlFields(model);
    const existing = findBestMatchingTemplate(this.state.urlTemplates, model) ?? undefined;
    if (this.state.unlockedFieldIds.length === 0) {
      if (existing) {
        await this.urlTemplateStore.remove(existing.hostname, existing.id);
        await this.loadUrlTemplates({ render: false });
      }
      if (this.state.settingsOpen) this.render();
      return;
    }
    const template = createUrlTemplateRecord({
      model,
      fields,
      includedFieldIds: this.state.unlockedFieldIds,
      existing,
    });
    if (!template) return;
    await this.urlTemplateStore.save(template);
    await this.loadUrlTemplates({ render: false });
    if (this.state.settingsOpen) this.render();
  }

  private async removeUrlTemplate(id: string): Promise<void> {
    if (!this.urlTemplateStore) return;
    const hostname = this.state.urlTemplates.find((candidate) => candidate.id === id)?.hostname ?? this.currentUrlTemplateHostname();
    if (!hostname) return;
    await this.urlTemplateStore.remove(hostname, id);
    this.state = reducePanelAction(this.state, { name: 'url-template/remove', id });
    this.render();
  }

  private async updateUrlTemplateSettings(
    id: string,
    changes: Extract<PanelAction, { readonly name: 'url-template/update-settings' }>,
  ): Promise<void> {
    const template = this.state.urlTemplates.find((candidate) => candidate.id === id);
    if (!template || !this.urlTemplateStore) return;
    const updated = updateTemplateSettings(template, { matchMode: changes.matchMode, hideExcludedFields: changes.hideExcludedFields });
    await this.urlTemplateStore.save(updated);
    this.state = reducePanelAction(this.state, changes);
    this.render();
  }

  private async updateUrlTemplateFields(
    id: string,
    changes: Extract<PanelAction, { readonly name: 'url-template/update-fields' }>,
  ): Promise<void> {
    const template = this.state.urlTemplates.find((candidate) => candidate.id === id);
    if (!template || !this.urlTemplateStore) return;
    let model: ParsedUrlModel;
    try {
      model = this.currentUrlModel();
    } catch {
      return;
    }
    const fields = collectUrlFields(model);
    const updated = updateTemplateFields({
      template,
      model,
      fields,
      includedFieldIds: changes.includedFieldIds,
    });
    if (!updated) {
      await this.urlTemplateStore.remove(template.hostname, template.id);
      this.state = reducePanelAction(this.state, { name: 'url-template/remove', id: template.id });
      this.render();
      return;
    }
    await this.urlTemplateStore.save(updated);
    this.state = reducePanelAction(
      {
        ...this.state,
        urlTemplates: this.state.urlTemplates.map((candidate) => (candidate.id === id ? updated : candidate)),
      },
      changes,
    );
    this.render();
  }

  private activeTemplateIdForCurrentUrl(templates: readonly UrlTemplateRecord[]): string | null {
    try {
      return findBestMatchingTemplate(templates, this.currentUrlModel())?.id ?? null;
    } catch {
      return null;
    }
  }

  private currentUrlTemplateHostname(): string | null {
    try {
      return new URL(rebuildUrl(this.currentUrlModel())).hostname.toLowerCase();
    } catch {
      return hostnameFromLocation();
    }
  }

  private async updateVisibleBookmarkSoftMax(value: number): Promise<void> {
    if (
      !Number.isInteger(value) ||
      value < VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.min ||
      value > VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.max ||
      value === this.state.bookmarkLimit
    ) {
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'settings/update-visible-bookmark-soft-max', value });
    this.saveLocalSettings({ ...this.localSettings, visibleBookmarkSoftMax: value });
    await this.loadBookmarkPage(0, { render: false });
    this.renderPanelAndRefreshRecall();
  }

  private updatePinSaveStoragePreference(value: PlaintextLocalSettings['pinSaveStoragePreference']): void {
    if (value === this.state.pinSaveStoragePreference) return;
    this.state = reducePanelAction(this.state, { name: 'settings/update-pin-save-storage-preference', value });
    this.saveLocalSettings({ ...this.localSettings, pinSaveStoragePreference: value });
    this.render();
  }

  private loadRecentHistory = async (): Promise<void> => {
    if (!this.recentHistoryStore) return;
    const history = await this.recentHistoryStore.load(window.location.href);
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  };

  private loadBookmarkPage = async (offset: number, options: { readonly render?: boolean } = {}): Promise<void> => {
    if (!this.bookmarkStore) return;
    const page = await this.bookmarkStore.loadPage({
      offset,
      limit: this.state.bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
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
    if (options.render !== false) this.render();
  };

  private async openRecallDrawer(): Promise<void> {
    await this.ensurePanelPositionRestored();
    this.state = reducePanelAction(this.state, { name: 'recall/open', side: this.recallDrawerSide() });
    this.recallOpeningUntil = Date.now() + RECALL_DRAWER_OPEN_ANIMATION_MS;
    this.render();
    if (!this.recallStore) {
      return;
    }
    void this.loadRecallCandidates({ offset: this.state.bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax, append: false });
  }

  private recallDrawerSide(): 'left' | 'right' {
    if (!this.root) return 'right';
    const rect = this.root.getBoundingClientRect();
    const leftSpace = rect.left;
    const rightSpace = window.innerWidth - rect.right;
    return rightSpace >= 360 || rightSpace >= leftSpace ? 'right' : 'left';
  }

  private async loadRecallCandidates(input: {
    readonly offset: number;
    readonly append: boolean;
    readonly renderScope?: 'panel' | 'recall';
    readonly showBusy?: boolean;
  }): Promise<void> {
    if (!this.recallStore) return;
    const renderUpdatedRecall = input.renderScope === 'panel' ? () => this.render() : () => this.renderRecallOnly();
    let pending = true;
    if (input.showBusy !== false) {
      this.clearRecallMessageTimer();
      this.state = reducePanelAction(this.state, { name: 'recall/load-start' });
      if (this.isRecallOpening()) {
        void this.waitForRecallOpening().then(() => {
          if (pending && this.state.recall.busy) renderUpdatedRecall();
        });
      } else {
        renderUpdatedRecall();
      }
    }
    const result = await this.recallStore.loadCandidates({
      offset: input.offset,
      limit: 100,
      scope: this.state.bookmarkVisibilityScope,
      currentPageUrl: window.location.href,
    });
    pending = false;
    await this.waitForRecallOpening();
    if (!result.ok) {
      this.clearRecallMessageTimer();
      if (result.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
      this.state = reducePanelAction(this.state, { name: 'recall/error', message: result.message });
      renderUpdatedRecall();
      return;
    }
    this.state = reducePanelAction(this.state, {
      name: 'recall/load-complete',
      candidates: result.candidates,
      append: input.append,
      offset: input.offset,
      nextOffset: result.nextOffset,
      hasMore: result.hasMore,
      total: result.total,
      failedCount: result.failedCount,
      message: result.message,
    });
    this.scheduleRecallMessageClear(result.message);
    renderUpdatedRecall();
  }

  private isRecallOpening(): boolean {
    return Date.now() < this.recallOpeningUntil;
  }

  private async waitForRecallOpening(): Promise<void> {
    const remaining = this.recallOpeningUntil - Date.now();
    if (remaining <= 0) return;
    await new Promise((resolve) => window.setTimeout(resolve, remaining));
  }

  private refreshRecallIfOpen(): void {
    if (!this.state.recall.open) return;
    void this.loadRecallCandidates({
      offset: this.state.bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      append: false,
      showBusy: false,
    });
  }

  private scheduleRecallMessageClear(message: string): void {
    this.clearRecallMessageTimer();
    this.recallMessageClearTimer = window.setTimeout(() => {
      this.recallMessageClearTimer = null;
      this.state = reducePanelAction(this.state, { name: 'recall/message-clear', message });
      this.renderRecallOnly();
    }, RECALL_SUCCESS_MESSAGE_MS);
  }

  private clearRecallMessageTimer(): void {
    if (this.recallMessageClearTimer === null) return;
    window.clearTimeout(this.recallMessageClearTimer);
    this.recallMessageClearTimer = null;
  }

  private renderPanelAndRefreshRecall(): void {
    this.render({ includeRecall: false });
    this.refreshRecallIfOpen();
  }

  private async recallSelectedRecords(): Promise<void> {
    if (!this.recallStore || this.state.recall.selectedIds.length === 0) return;
    this.state = reducePanelAction(this.state, { name: 'recall/load-start' });
    this.renderRecallOnly();
    const result = await this.recallStore.recall(this.state.recall.selectedIds);
    if (!result.ok) {
      if (result.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
      this.state = reducePanelAction(this.state, { name: 'recall/error', message: result.message });
      this.renderRecallOnly();
      return;
    }
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'recall/complete',
      records: result.records,
      failedCount: result.failedCount,
      message: result.message,
    });
    this.renderPanelAndRefreshRecall();
  }

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

    if (action.name === 'bookmark/clear' || action.name === 'bookmarks/clear-visible') {
      this.state = reducePanelAction(this.state, action);
      this.renderPanelAndRefreshRecall();
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
      this.saveLocalSettings({ ...this.localSettings, bookmarkVisibilityScope: this.state.bookmarkVisibilityScope });
      void this.loadBookmarkPage(0, { render: false }).then(() => this.renderPanelAndRefreshRecall());
      return;
    }

    if (action.name === 'settings/update-visible-bookmark-soft-max') {
      void this.updateVisibleBookmarkSoftMax(action.value);
      return;
    }

    if (action.name === 'settings/update-pin-save-storage-preference') {
      this.updatePinSaveStoragePreference(action.value);
      return;
    }

    if (action.name === 'settings/update-privacy-mode') {
      this.state = reducePanelAction(this.state, action);
      this.saveLocalSettings({ ...this.localSettings, privacyModeEnabled: action.enabled });
      this.render();
      this.refreshRecallIfOpen();
      return;
    }

    if (action.name === 'settings/toggle') {
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'url-template/remove') {
      void this.removeUrlTemplate(action.id);
      return;
    }

    if (action.name === 'url-template/update-settings') {
      void this.updateUrlTemplateSettings(action.id, action);
      return;
    }

    if (action.name === 'url-template/update-fields') {
      void this.updateUrlTemplateFields(action.id, action);
      return;
    }

    if (action.name === 'bookmarks/reload') {
      void this.loadBookmarkPage(0, { render: false }).then(() => this.renderPanelAndRefreshRecall());
      return;
    }

    if (action.name === 'bookmarks/refresh-thumbnails') {
      void this.refreshBookmarkThumbnails();
      return;
    }

    if (action.name === 'bookmarks/delete-visible') {
      void this.deleteVisibleBookmarks();
      return;
    }

    if (action.name === 'recall/delete-all') {
      void this.deleteRecallBookmarks();
      return;
    }

    if (
      action.name === 'history-selection/toggle' ||
      action.name === 'history-selection/clear' ||
      action.name === 'bookmark-selection/toggle' ||
      action.name === 'bookmark-selection/single' ||
      action.name === 'bookmark-selection/clear'
    ) {
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'recall/open') {
      if (this.state.recall.open) {
        this.clearRecallMessageTimer();
        this.state = reducePanelAction(this.state, { name: 'recall/close' });
        this.render();
        return;
      }
      void this.openRecallDrawer();
      return;
    }

    if (action.name === 'recall/close') {
      this.clearRecallMessageTimer();
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'recall-selection/toggle' || action.name === 'recall-selection/clear' || action.name === 'recall/clear-results') {
      this.state = reducePanelAction(this.state, action);
      this.render();
      return;
    }

    if (action.name === 'recall/load-more') {
      if (!this.state.recall.busy && this.state.recall.hasMore) {
        void this.loadRecallCandidates({ offset: this.state.recall.nextOffset, append: true });
      }
      return;
    }

    if (action.name === 'recall/selected') {
      void this.recallSelectedRecords();
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
      void this.saveUrlTemplateFromCurrentFields().then(() => this.render());
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
      void this.previewRecord(action.url, action.blobId, action.scrollAnchorId);
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

    if (action.name === 'blob-key/clear') {
      void this.clearBlobKey();
      return;
    }

    if (action.name === 'blob-key/export') {
      void this.exportBlobKeyBackup(action.password);
      return;
    }

    if (action.name === 'blob-key/import') {
      void this.importBlobKeyBackup(action.fileContent, action.password);
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
      void this.exportImage(action.saveAs === true);
      return;
    }

    if (action.name === 'export/encrypted-image') {
      void this.exportEncryptedImages();
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

    if (action.name === 'import/encrypted-image') {
      void this.importEncryptedImages(action.files);
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
      case 'download':
        if (this.state.importExportBusy) return;
        this.dispatch({ name: 'export/image', saveAs: false });
        break;
      case 'download-save-as':
        if (this.state.importExportBusy) return;
        this.dispatch({ name: 'export/image', saveAs: true });
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
      ).then((loaded) => {
        if (loaded) void this.saveUrlTemplateFromCurrentFields();
      });
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
    const loaded = await this.applySelectedUrl(nextUrl, field.location === 'query' ? [fieldId] : []);
    if (loaded && this.state.unlockedFieldIds.length > 0) await this.saveUrlTemplateFromCurrentFields();
  }

  private async bumpFieldValue(fieldId: string, delta: 1 | -1): Promise<void> {
    const model = this.currentUrlModel();
    const fields = collectUrlFields(model);
    const field = fields.find((item) => item.id === fieldId);
    if (!field) return;

    const nextModel = bumpUrlField(model, field, delta);
    const nextUrl = rebuildUrl(nextModel);
    this.state = reducePanelAction(this.state, { name: 'active-field/set', id: fieldId });
    const loaded = await this.applySelectedUrl(nextUrl, field.location === 'query' ? [fieldId] : []);
    if (loaded) await this.saveUrlTemplateFromCurrentFields();
  }

  private async applySelectedUrl(nextUrl: string, attemptedFieldIds: readonly string[] = []): Promise<boolean> {
    const revision = ++this.projectionRevision;
    const baselineFingerprint = await this.currentImageFingerprint();
    if (revision !== this.projectionRevision) return false;
    const preload = await this.preloadImageUrl(nextUrl);
    if (revision !== this.projectionRevision) return false;
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
      if (revision !== this.projectionRevision) return false;
      this.state = setTargetState(this.state, toTargetState(nextSnapshot));
    }
    this.state = this.applyFieldLoadResult(this.state, attemptedFieldIds, preload.sha256, baselineFingerprint);
    pushVisibleUrlWhenSameOrigin(nextUrl);
    this.render();
    void this.loadUrlTemplates();
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
    await this.bookmarkUrl(url, image ? ((await createThumbnailDataUrlFromImage(image)) ?? undefined) : undefined, {
      trustLoadedImage,
      width: image?.naturalWidth || undefined,
      height: image?.naturalHeight || undefined,
    });
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
    const draft = createDisplayRecord({
      id: sourceUrl,
      url: sourceUrl,
      thumbnail: resolvedThumbnail,
      width: options.width,
      height: options.height,
      source: 'bookmark',
    });
    const bookmark = this.bookmarkStore ? await this.bookmarkStore.save(draft) : draft;
    this.state = { ...this.state, message: bookmarkSaveMessage(bookmark), lastUpdatedAt: Date.now() };
    await this.loadBookmarkPage(0, { render: false });
    this.renderPanelAndRefreshRecall();
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
      message: bookmarkSaveMessage(bookmark, bookmark.label ?? file.name),
      lastUpdatedAt: Date.now(),
    };
    await this.loadBookmarkPage(0, { render: false });
    this.renderPanelAndRefreshRecall();
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
      width: options.width,
      height: options.height,
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
    if (thumbnail && !isTransientBlobUrl(thumbnail)) return thumbnail;
    if (thumbnail && isTransientBlobUrl(thumbnail)) {
      const durableThumbnail = await createThumbnailDataUrlFromUrl(thumbnail);
      if (durableThumbnail) return durableThumbnail;
    }
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
    await this.bookmarkStore?.remove(bookmark);
    await this.refreshStorageUsage();
    this.state = reducePanelAction(this.state, { name: 'bookmark/remove', id });
    await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
    this.renderPanelAndRefreshRecall();
  }

  private async deleteVisibleBookmarks(): Promise<void> {
    if (!this.bookmarkStore || this.state.bookmarks.length === 0) return;
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await this.bookmarkStore.removeMany(this.state.bookmarks.map((bookmark) => bookmark.id));
    await this.refreshStorageUsage();
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `Deleted ${result.removedCount} queue item${result.removedCount === 1 ? '' : 's'}.`,
    });
    this.renderPanelAndRefreshRecall();
  }

  private async deleteRecallBookmarks(): Promise<void> {
    if (!this.bookmarkStore) return;
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await this.bookmarkStore.removeRecallPage({
      offset: this.state.bookmarkLimit || DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax,
      scope: this.state.bookmarkVisibilityScope,
      currentPageUrl: window.location.href,
    });
    await this.refreshStorageUsage();
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `Deleted ${result.removedCount} Recall item${result.removedCount === 1 ? '' : 's'}.`,
    });
    this.renderPanelAndRefreshRecall();
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
    this.render({ includeRecall: false });
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

    await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
    this.state = {
      ...this.state,
      message: `Refreshed ${refreshed} thumbnail${refreshed === 1 ? '' : 's'}${unavailable ? `; ${unavailable} unavailable` : ''}.`,
      lastUpdatedAt: Date.now(),
    };
    this.renderPanelAndRefreshRecall();
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
    let queueChanged = false;
    if ((result.status === 'failed' || result.status === 'remote-only') && result.reason === 'encryption-locked') {
      await this.refreshBlobKeyStatus();
    }
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
        await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
        queueChanged = true;
      }
    }
    await this.refreshStorageUsage();
    if (queueChanged) {
      this.renderPanelAndRefreshRecall();
    } else {
      this.render();
    }
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
    let queueChanged = false;
    if (updatedBookmark && this.bookmarkStore) {
      await this.bookmarkStore.save(updatedBookmark);
      await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
      queueChanged = true;
    }
    if (queueChanged) {
      this.renderPanelAndRefreshRecall();
    } else {
      this.render();
    }
  }

  private async previewRecord(url: string, blobId?: string, scrollAnchorId?: string): Promise<void> {
    this.projectionRevision++;
    this.previewScrollAnchorId = scrollAnchorId ?? null;
    try {
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
        if (retrieved.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
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
    } finally {
      this.previewScrollAnchorId = null;
    }
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
      void this.loadUrlTemplates();
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
    if (result.ok) {
      await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
      this.renderPanelAndRefreshRecall();
      return;
    }
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
    if (result.ok) {
      await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
      this.renderPanelAndRefreshRecall();
      return;
    }
    this.render();
  }

  private async clearBlobKey(): Promise<void> {
    if (!this.captureStore) return;
    const result = await this.captureStore.clearBlobKey();
    this.state = reducePanelAction(
      { ...this.state, message: result.message, status: result.ok ? 'ready' : 'error', lastUpdatedAt: Date.now() },
      { name: 'blob-key/status', unlocked: false, keyReference: null, hasKey: false },
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
    const history = selectedRecords(this.state.history, this.state.selectedHistoryIds);
    const entries = history.map(historyRecordToExportEntry);
    const result = plaintext ? exportPlainHistory({ entries }) : await exportEncryptedHistory({ entries, password });
    this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
  }

  private async exportBookmarks(password: string, plaintext: boolean): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const bookmarks =
      this.state.selectedBookmarkIds.length > 0
        ? selectedRecords(this.state.bookmarks, this.state.selectedBookmarkIds)
        : this.state.recall.selectedIds.length > 0
          ? this.selectedRecallRecords()
          : await this.loadAllBookmarksForExport();
    if (bookmarks.some(isLockedPrivatePin)) {
      this.finishExport(
        undefined,
        undefined,
        'Unlock encrypted storage before exporting private pins so the backup includes their metadata and thumbnails.',
        false,
      );
      return;
    }
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

  private async exportBlobKeyBackup(password: string): Promise<void> {
    if (!this.captureStore || this.state.importExportBusy) return;
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await this.captureStore.exportBlobKeyBackup(password, this.state.blobKeyReference ?? undefined);
    this.finishExport(result.ok ? result.fileContent : undefined, result.ok ? result.fileName : undefined, result.message, result.ok);
  }

  private async importBlobKeyBackup(fileContent: string, password: string): Promise<void> {
    if (!this.captureStore || this.state.importExportBusy) return;
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await this.captureStore.importBlobKeyBackup(fileContent, password);
    if (!result.ok) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.message });
      this.render();
      return;
    }
    await this.refreshBlobKeyStatus();
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message: result.message });
    await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
    this.renderPanelAndRefreshRecall();
  }

  private async exportImage(saveAs: boolean): Promise<void> {
    if (this.state.importExportBusy) return;
    const selectedRecordsForDownload = this.selectedImageDownloadRecords();
    if (selectedRecordsForDownload.some(isLockedPrivatePin)) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
      });
      this.render();
      return;
    }
    const urls =
      selectedRecordsForDownload.length > 0
        ? []
        : selectImageDownloadUrls({
            history: this.state.history,
            bookmarks: this.state.bookmarks,
            selectedHistoryIds: this.state.selectedHistoryIds,
            selectedBookmarkIds: this.state.selectedBookmarkIds,
            currentImageUrl: this.selectedImageExportUrl(),
          });
    if (selectedRecordsForDownload.length === 0 && urls.length === 0) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: 'Select an image before exporting.' });
      this.render();
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const downloads =
      selectedRecordsForDownload.length > 0
        ? await this.selectedRecordImageDownloads(selectedRecordsForDownload)
        : urls.map((url) => ({ url, fileName: filenameForExportedImage(url) }));
    const result = await downloadUrlsInSeries(downloads, saveAs);
    const message = imageDownloadResultMessage(result);
    if (result.started === 0) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message });
      this.render();
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message });
    this.render();
  }

  private selectedImageDownloadRecords(): readonly ImageDisplayRecord[] {
    if (this.state.selectedHistoryIds.length > 0) {
      return selectedRecords(this.state.history, this.state.selectedHistoryIds);
    }
    if (this.state.selectedBookmarkIds.length > 0) {
      return selectedRecords(this.state.bookmarks, this.state.selectedBookmarkIds);
    }
    if (this.state.recall.selectedIds.length > 0) {
      return this.selectedRecallRecords();
    }
    return [];
  }

  private selectedRecallRecords(): readonly ImageDisplayRecord[] {
    return selectedRecords(this.state.recall.candidates, this.state.recall.selectedIds);
  }

  private async selectedRecordImageDownloads(
    records: readonly ImageDisplayRecord[],
  ): Promise<readonly { readonly url: string; readonly fileName: string }[]> {
    const downloads: { readonly url: string; readonly fileName: string }[] = [];
    for (const record of records) {
      downloads.push({
        url: await this.recordImageDownloadUrl(record),
        fileName: filenameForExportedImage(record.url),
      });
    }
    return downloads;
  }

  private async recordImageDownloadUrl(record: ImageDisplayRecord): Promise<string> {
    const blobId = encryptedBlobIdForRecord(record);
    if (!blobId || !this.captureStore || !this.state.blobKeyUnlocked) return record.url;
    const retrieved = await this.captureStore.requestRetrieveBlob(blobId);
    if (!retrieved.ok && retrieved.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
    return retrieved.ok ? retrieved.dataUrl : record.url;
  }

  private async exportEncryptedImages(): Promise<void> {
    if (this.state.importExportBusy) return;
    if (!this.state.blobKeyUnlocked) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Unlock encrypted originals before exporting encrypted images.',
      });
      this.render();
      return;
    }
    if (this.selectedImageDownloadRecords().some(isLockedPrivatePin)) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
      });
      this.render();
      return;
    }
    const targets = this.encryptedImageExportTargets();
    if (targets.length === 0) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Select an image before exporting encrypted images.',
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await exportEncryptedImagesInSeries(targets);
    if (result.encryptionLocked) await this.refreshBlobKeyStatus();
    const message = encryptedImageExportResultMessage(result);
    if (result.started === 0) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message });
      this.render();
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message });
    this.render();
  }

  private encryptedImageExportTargets(): readonly { readonly url: string; readonly fileName: string; readonly blobId?: string }[] {
    const selected = this.selectedImageDownloadRecords();
    if (selected.length > 0) {
      return selected.map((record) => ({
        url: record.url,
        fileName: filenameForExportedImage(record.url),
        blobId: encryptedBlobIdForRecord(record),
      }));
    }
    const urls = selectImageDownloadUrls({
      history: this.state.history,
      bookmarks: this.state.bookmarks,
      selectedHistoryIds: this.state.selectedHistoryIds,
      selectedBookmarkIds: this.state.selectedBookmarkIds,
      currentImageUrl: this.selectedImageExportUrl(),
    });
    return urls.map((url) => ({ url, fileName: filenameForExportedImage(url) }));
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

  private async importEncryptedImages(files: readonly ImportedEncryptedImageFile[]): Promise<void> {
    if (files.length === 0) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Choose one or more encrypted image files to import.',
      });
      this.render();
      return;
    }
    if (!this.state.blobKeyUnlocked) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Unlock encrypted originals before importing encrypted images.',
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    let imported = 0;
    let failed = 0;
    let firstFailureMessage: string | null = null;
    for (const file of files) {
      const result = await requestEncryptedImageImport(file.fileContent);
      if (!result.ok) {
        if (result.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
        firstFailureMessage ??= result.message;
        failed += 1;
        continue;
      }
      if (await this.addImportedImage({ name: result.fileName || file.name, dataUrl: result.dataUrl })) imported += 1;
    }

    if (imported === 0) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: firstFailureMessage ?? 'No encrypted image files could be imported.',
      });
    } else if (failed > 0) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/complete',
        message: `Imported ${imported} encrypted image${imported === 1 ? '' : 's'}. ${failed} failed.`,
      });
    } else {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/complete',
        message: `Imported ${imported} encrypted image${imported === 1 ? '' : 's'} into bookmarks and recent history.`,
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
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `${result.status.message}${result.plaintext ? ' Plaintext import was encrypted into bookmark storage.' : ''}`,
    });
    this.renderPanelAndRefreshRecall();
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
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message: result.status.message });
    this.renderPanelAndRefreshRecall();
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
      this.recallRoot = document.createElement('div');
      this.recallRoot.className = 'image-trail-panel-recall-root';
      shadow.replaceChildren(link, this.root, this.recallRoot);
      (document.body ?? document.documentElement).append(host);
    }
  }

  private render(options: { readonly includeRecall?: boolean } = {}): void {
    if (this.root) {
      renderPanel(
        {
          root: this.root,
          recallRoot: this.recallRoot,
          dispatch: this.dispatch,
          layoutState: this.layoutState,
          scrollAnchorId: this.previewScrollAnchorId,
          onPanelDragStart: this.handlePanelDragStart,
        },
        this.state,
        { renderRecall: options.includeRecall !== false },
      );
      this.queuePanelPositionRestore();
      this.applyRestoredPanelPosition();
    }
  }

  private renderRecallOnly(): void {
    if (!this.root || !this.recallRoot) return;
    renderRecallDrawer(
      {
        root: this.root,
        recallRoot: this.recallRoot,
        dispatch: this.dispatch,
        layoutState: this.layoutState,
        scrollAnchorId: this.previewScrollAnchorId,
        onPanelDragStart: this.handlePanelDragStart,
      },
      this.state,
    );
  }

  private async ensurePanelPositionRestored(): Promise<void> {
    if (!this.root) return;
    this.panelPositionRestorePromise ??= this.beginPanelPositionRestore();
    await this.panelPositionRestorePromise;
  }

  private queuePanelPositionRestore(): void {
    if (!this.root || this.panelPositionRestored || this.panelPositionRestorePromise) return;
    this.panelPositionRestorePromise = this.beginPanelPositionRestore();
  }

  private beginPanelPositionRestore(): Promise<void> {
    const attempt = (this.panelPositionRestoreAttempt += 1);
    return this.restorePanelPosition(attempt);
  }

  private async restorePanelPosition(attempt: number): Promise<void> {
    if (!this.root || !this.panelPositionStore || this.panelPositionRestored) return;
    try {
      const hostname = hostnameFromLocation();
      if (!hostname) return;
      const saved = await this.panelPositionStore.load(hostname);
      if (!saved || !this.root) return;
      await this.waitForPanelLayout();
      if (!this.root) return;
      this.restoredPanelPosition = this.clampPanelPosition(saved);
      this.applyRestoredPanelPosition();
      this.renderRecallOnly();
    } finally {
      if (this.root && this.panelPositionRestoreAttempt === attempt) {
        this.panelPositionRestored = true;
      }
    }
  }

  private async waitForPanelLayout(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  private handlePanelDragStart = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.root) return;
    event.preventDefault();
    const root = this.root;
    const startRect = root.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    let latest = this.clampPanelPosition({ left: startRect.left, top: startRect.top });

    const onMove = (moveEvent: PointerEvent): void => {
      latest = this.clampPanelPosition({
        left: startRect.left + moveEvent.clientX - startX,
        top: startRect.top + moveEvent.clientY - startY,
      });
      this.applyPanelPosition(latest);
      this.restoredPanelPosition = latest;
      this.renderRecallOnly();
    };

    const onUp = (): void => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', onUp, true);
      void this.savePanelPosition(latest);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onUp, true);
  };

  private clampPanelPosition(position: PanelPosition): PanelPosition {
    if (!this.root) return position;
    const rect = this.root.getBoundingClientRect();
    return clampPanelPosition(
      position,
      { width: rect.width, height: rect.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
  }

  private applyPanelPosition(position: PanelPosition): void {
    if (!this.root) return;
    this.root.style.left = `${Math.round(position.left)}px`;
    this.root.style.top = `${Math.round(position.top)}px`;
    this.root.style.right = 'auto';
  }

  private applyRestoredPanelPosition(): void {
    if (!this.restoredPanelPosition) return;
    this.applyPanelPosition(this.restoredPanelPosition);
  }

  private async savePanelPosition(position: PanelPosition): Promise<void> {
    if (!this.panelPositionStore) return;
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    await this.panelPositionStore.save(hostname, position);
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
      width: record.width,
      height: record.height,
      bookmarkedAt: record.timestamp,
      downloadedAt: record.downloadedAt,
      capturedAt: record.capturedAt,
      sourceCompatibility: record.source === 'favorites' ? 'favorites' : undefined,
      storedOriginal: record.storedOriginal,
    },
  };
}

function selectedRecords(records: readonly ImageDisplayRecord[], selectedIds: readonly string[]): readonly ImageDisplayRecord[] {
  if (selectedIds.length === 0) return records;
  const selected = new Set(selectedIds);
  return records.filter((record) => selected.has(record.id));
}

export function isLockedPrivatePin(record: ImageDisplayRecord): boolean {
  return record.privacyStatus === 'locked' || record.url.startsWith('image-trail-private:');
}

function bookmarkSaveMessage(record: ImageDisplayRecord, label = record.url): string {
  if (record.pinSaveStorage?.destination !== 'plaintext') return `Added to Image Trail: ${label}`;
  switch (record.pinSaveStorage.reason) {
    case 'setting':
      return `Saved plaintext pin by current storage setting: ${label}`;
    case 'failed':
      return `Saved plaintext pin because encrypted storage failed: ${label}`;
    case 'unavailable':
      return `Saved plaintext pin because encrypted storage is not set up: ${label}`;
    case 'locked':
    default:
      return `Saved plaintext pin because encrypted storage is locked: ${label}`;
  }
}

const PRIVATE_PIN_EXPORT_LOCKED_MESSAGE =
  'Unlock encrypted storage before exporting private pins so their image metadata and originals are available.';

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
    width: payload.width,
    height: payload.height,
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

async function downloadUrlsInSeries(
  downloads: readonly { readonly url: string; readonly fileName: string }[],
  saveAs: boolean,
): Promise<{
  readonly requested: number;
  readonly started: number;
  readonly failed: number;
  readonly saveAsFallbacks: number;
  readonly failedFileNames: readonly string[];
}> {
  let started = 0;
  let failed = 0;
  let saveAsFallbacks = 0;
  const failedFileNames: string[] = [];
  for (const [index, download] of downloads.entries()) {
    const result = await downloadImageFile(download.url, download.fileName, saveAs);
    if (result.ok) {
      started += 1;
      if (result.saveAsFallback) saveAsFallbacks += 1;
    } else {
      failed += 1;
      failedFileNames.push(download.fileName);
    }
    if (index < downloads.length - 1) await delay(120);
  }
  return { requested: downloads.length, started, failed, saveAsFallbacks, failedFileNames };
}

async function exportEncryptedImagesInSeries(
  downloads: readonly { readonly url: string; readonly fileName: string; readonly blobId?: string }[],
): Promise<{
  readonly requested: number;
  readonly started: number;
  readonly failed: number;
  readonly encryptionLocked: boolean;
  readonly failedFileNames: readonly string[];
}> {
  let started = 0;
  let failed = 0;
  let encryptionLocked = false;
  const failedFileNames: string[] = [];
  for (const [index, download] of downloads.entries()) {
    const result = await requestEncryptedImageExport(download);
    if (result.ok) {
      downloadTextFile(result.fileContent, result.fileName);
      started += 1;
    } else {
      failed += 1;
      if (result.reason === 'encryption-locked') encryptionLocked = true;
      failedFileNames.push(download.fileName);
    }
    if (index < downloads.length - 1) await delay(120);
  }
  return { requested: downloads.length, started, failed, encryptionLocked, failedFileNames };
}

function encryptedImageExportResultMessage(result: {
  readonly requested: number;
  readonly started: number;
  readonly failed: number;
  readonly encryptionLocked: boolean;
  readonly failedFileNames: readonly string[];
}): string {
  if (result.started === 0) {
    const failedName = result.failedFileNames[0];
    return failedName ? `Encrypted image export failed for ${failedName}.` : 'Encrypted image export could not be started.';
  }
  if (result.failed > 0) {
    return `Started ${result.started} of ${result.requested} encrypted image exports. ${result.failed} failed.`;
  }
  return result.started === 1 ? 'Encrypted image export started.' : `Started ${result.started} encrypted image exports.`;
}

async function downloadImageFile(
  url: string,
  fileName: string,
  saveAs: boolean,
): Promise<{ readonly ok: true; readonly saveAsFallback?: boolean } | { readonly ok: false; readonly message: string }> {
  const result = await requestImageDownload({ url, fileName, saveAs });
  if (result.ok) return result;
  downloadUrl(url, fileName);
  return { ok: true, saveAsFallback: saveAs };
}

function imageDownloadResultMessage(result: {
  readonly requested: number;
  readonly started: number;
  readonly failed: number;
  readonly saveAsFallbacks: number;
  readonly failedFileNames: readonly string[];
}): string {
  if (result.started === 0) {
    const failedName = result.failedFileNames[0];
    return failedName ? `Image export failed for ${failedName}.` : 'Image export could not be started.';
  }
  if (result.failed > 0) {
    return `Started ${result.started} of ${result.requested} image downloads. ${result.failed} failed.`;
  }
  if (result.saveAsFallbacks > 0) {
    return `Save As unavailable; started ${result.started === 1 ? '1 image download normally' : `${result.started} image downloads normally`}.`;
  }
  return result.started === 1 ? 'Image export started.' : `Started ${result.started} image downloads.`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
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
