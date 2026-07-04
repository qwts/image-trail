import type { CaptureStore } from '../content/capture-controller.js';
import type { RecallStore } from '../content/recall-store.js';
import type { RecentHistoryStore } from '../content/recent-history-store.js';
import {
  connectPCloudProvider,
  disconnectPCloudProvider,
  downloadPCloudBackup,
  listPCloudBackups,
  loadPCloudProviderStatus,
  uploadPCloudBackup,
} from '../content/pcloud-provider-client.js';
import { KeyboardRouter } from '../content/keyboard.js';
import { RequestGovernor } from '../content/request-governor.js';
import type { PageAdapter } from '../content/page-adapter.js';
import { pruneInvalidFieldSplitSpecsFromState, reducePanelAction } from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import type { BuildIdentity } from '../core/build-info.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type {
  BookmarkStore,
  PanelAction,
  PanelPositionStore,
  PanelState,
  ParsedFieldStateRecord,
  ParsedFieldStateStore,
  UrlReviewStatusClearFilter,
  UrlTemplateStore,
  UrlReviewStatus,
  UrlReviewStatusStore,
} from '../core/types.js';
import { imageResourceUrlsEqual } from '../core/image/image-navigation.js';
import { applyFieldSplitSpecs } from '../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs } from '../core/url/field-widths.js';
import { parseUrl } from '../core/url/parse-url.js';
import { collectUrlFields } from '../core/url/tokenize-fields.js';
import { ProjectionSessionController } from '../core/projection-session.js';
import type { ParsedUrlModel, UrlField } from '../core/url/types.js';
import {
  createThumbnailDataUrlFromDataUrl,
  createThumbnailDataUrlFromImage,
  createThumbnailDataUrlFromUrl,
  fetchThumbnailSource,
} from '../content/thumbnail-generator.js';
import { fetchDecodedBufferedImageSource, probeBufferedImageSource } from '../content/buffered-image-source.js';
import { checkImageRequestPolicy } from '../content/image-request-policy.js';
import { BufferedNavigationController } from './panel/buffered-navigation-controller.js';
import { FieldEditorController } from './panel/field-editor-controller.js';
import { NeighborPreloadController } from './panel/neighbor-preload-controller.js';
import { ParsedFieldNavigationController } from './panel/parsed-field-navigation-controller.js';
import { ParsedFieldStateSync } from './panel/parsed-field-state-sync.js';
import { PanelMount } from './panel/panel-mount.js';
import { PanelPositionController } from './panel/panel-position-controller.js';
import { PanelSettingsController } from './panel/panel-settings-controller.js';
import { RecallDrawerController } from './panel/recall-drawer-controller.js';
import { RecallExportController } from './panel/recall-export-controller.js';
import { RecallRestoreController } from './panel/recall-restore-controller.js';
import { RecordLibraryController } from './panel/record-library-controller.js';
import { CapturedOriginalsController } from './panel/captured-originals-controller.js';
import { UrlTemplateSettingsController } from './panel/url-template-settings-controller.js';
import { ProjectionApplicationController, toTargetState } from './panel/projection-application-controller.js';
import { dispatchPanelAction } from './panel/action-dispatch.js';
import { buildPanelActionRegistry } from './panel/actions/registry.js';
import type { PanelActionDeps } from './panel/actions/deps.js';
import { isFocusablePanelControl } from './panel/export-download.js';
import { urlReviewStatusClearScopeLabel } from './panel/record-export-helpers.js';
import { DEFAULT_LOCAL_SETTINGS, type LocalSettingsStore, type PlaintextLocalSettings } from '../content/panel-services.js';
import { renderPanel, renderRecallDrawer, type PanelLayoutState } from './render.js';
import { hostnameFromLocation } from './panel-position.js';

const FINITE_CAPTURE_ERROR_MS = 2400;

function addItems(items: readonly string[], nextItems: readonly string[]): readonly string[] {
  return [...items, ...nextItems.filter((item) => !items.includes(item))];
}

function removeItems(items: readonly string[], removedItems: readonly string[]): readonly string[] {
  if (removedItems.length === 0) return items;
  const removed = new Set(removedItems);
  return items.filter((item) => !removed.has(item));
}

export { nextParsedFieldStatePageKey, shouldRestoreParsedFieldState } from './panel/parsed-field-state-sync.js';
export { projectionSessionOwnsSelectedTarget, urlReviewStatusForLoadResult } from './panel/projection-application-controller.js';

export class ImageTrailPanel {
  private readonly panelMount = new PanelMount({
    isPanelVisible: () => this.state.visible,
    isPanelMinimized: () => this.state.minimized,
    onStylesReady: () => {
      this.panelPosition.queuePanelPositionRestore();
      this.panelPosition.applyRestoredPanelPosition();
    },
  });
  private get root(): HTMLElement | null {
    return this.panelMount.root;
  }
  private get recallRoot(): HTMLElement | null {
    return this.panelMount.recallRoot;
  }
  private get toastRoot(): HTMLElement | null {
    return this.panelMount.toastRoot;
  }
  private state: PanelState = createInitialPanelState();

  private readonly governor = new RequestGovernor();
  private readonly projections = new ProjectionSessionController();
  private readonly keyboard: KeyboardRouter;
  private readonly slideshow: Slideshow;
  private readonly retry: Retry404;
  private localSettings: PlaintextLocalSettings = DEFAULT_LOCAL_SETTINGS;
  private storageUsageRequestId = 0;
  private get panelStylesReady(): boolean {
    return this.panelMount.panelStylesReady;
  }
  private finiteCaptureErrorTimer: number | null = null;
  private readonly fieldStateSync = new ParsedFieldStateSync({
    store: () => this.parsedFieldStateStore,
    hostname: () => this.parsedFieldStateHostname(),
    currentPageHref: () => window.location.href,
    currentSelectedUrl: () => this.currentSelectedUrl(),
    selectedHandleId: () => this.state.target.selectedHandleId,
    syncTargetStateFromSnapshot: () => {
      this.state = setTargetState(this.state, toTargetState(this.pageAdapter.getSnapshot()));
    },
    createRecord: () => this.createParsedFieldStateRecord(),
    applyRestoredRecord: (record, ctx) => this.applyRestoredParsedFieldState(record, ctx),
  });
  private readonly bufferedNav = new BufferedNavigationController({
    getLocalSettings: () => this.localSettings,
    currentNavigationBaseRawUrl: () => this.currentNavigationBaseRawUrl(),
    currentNavigationBaseModel: () => this.currentNavigationBaseModel(),
    includedNavigationFields: (fields) => this.parsedFieldNavigation.includedNavigationFields(fields),
    currentKnownImageFingerprint: () => this.currentKnownImageFingerprint(),
    hasSelectedTarget: () => Boolean(this.pageAdapter.getSnapshot().selected?.url),
    currentPageHref: () => window.location.href,
    applyLandedUrl: (nextUrl, displayUrl, sha256, attemptedFieldIds) =>
      this.parsedFieldNavigation.applyBufferedNavigationUrl(nextUrl, displayUrl, sha256, attemptedFieldIds),
    createPlaceholderImage: () => new Image(),
    scheduleRevoke: (blobUrl) => window.setTimeout(() => URL.revokeObjectURL(blobUrl), 500),
    onToast: (message) => this.showBufferedNavigationToast(message),
    onSkipCapReached: (message) => {
      this.state = {
        ...this.state,
        status: 'ready',
        message,
        failedFieldId: null,
        lastUpdatedAt: Date.now(),
      };
      this.render();
      this.showBufferedNavigationToast(message);
    },
    onDebugChanged: () => this.renderBufferedDebugOverlay(),
    checkRequestPolicy: (url, options) => checkImageRequestPolicy(url, options),
    probeImage: (url, timeoutMs, options) => probeBufferedImageSource(url, timeoutMs, options),
    fetchDecodedImage: (url, options) => fetchDecodedBufferedImageSource(url, options),
  });
  private readonly neighborPreload = new NeighborPreloadController({
    getLocalSettings: () => this.localSettings,
    currentNavigationBaseRawUrl: () => this.currentNavigationBaseRawUrl(),
    currentNavigationBaseModel: () => this.currentNavigationBaseModel(),
    currentPageHref: () => window.location.href,
    isNavigableQueryField: (field) => this.isNavigableQueryField(field),
    currentFieldContextKeyParts: () => ({
      fieldSplitSpecs: this.state.fieldSplitSpecs,
      fieldDigitWidthSpecs: this.state.fieldDigitWidthSpecs,
      selectedHandleId: this.state.target.selectedHandleId,
    }),
    // preload() decides the source profile per intent: the active parsed-field navigation display
    // uses the 25 MB navigation budget (matching the skip-policy cache key), everything else keeps
    // the thumbnail-source budget.
    fetchThumbnail: (url, options) => fetchThumbnailSource(url, options),
  });
  private readonly urlTemplateSettings = new UrlTemplateSettingsController({
    store: () => this.urlTemplateStore,
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    currentUrlModel: () => this.currentUrlModel(),
    setUrlTemplates: (templates, activeId) => this.pageAdapter.setUrlTemplates(templates, activeId),
    setGrabSourcePatterns: (patterns) => this.pageAdapter.setGrabSourcePatterns(patterns),
    loadGrabSettings: (options) => this.loadGrabSettings(options),
  });
  private readonly recallExport = new RecallExportController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
    getLocalSettings: () => this.localSettings,
    findSelectedImage: (handleId) => this.findSelectedImage(handleId),
    bookmarkStore: () => this.bookmarkStore,
    captureStore: () => this.captureStore,
    urlReviewStatusStore: () => this.urlReviewStatusStore,
    loadPCloudProviderStatus: (...args) => loadPCloudProviderStatus(...args),
    connectPCloudProvider: (...args) => connectPCloudProvider(...args),
    disconnectPCloudProvider: (...args) => disconnectPCloudProvider(...args),
    uploadPCloudBackup: (input) => uploadPCloudBackup(input),
  });
  private readonly recallRestore = new RecallRestoreController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
    loadRecentHistory: (options) => this.loadRecentHistory(options),
    refreshStorageUsage: (options) => this.refreshStorageUsage(options),
    addImportedImage: (file) => this.recordLibrary.addImportedImage(file),
    getLocalSettings: () => this.localSettings,
    bookmarkStore: () => this.bookmarkStore,
    captureStore: () => this.captureStore,
    recentHistoryStore: () => this.recentHistoryStore,
    urlReviewStatusStore: () => this.urlReviewStatusStore,
    listPCloudBackups: (...args) => listPCloudBackups(...args),
    downloadPCloudBackup: (input) => downloadPCloudBackup(input),
    loadAllBookmarks: () => this.recallExport.loadAllBookmarksForExport(),
    refreshBlobKeyStatus: () => this.recallExport.refreshBlobKeyStatus(),
  });
  private readonly recordLibrary: RecordLibraryController = new RecordLibraryController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
    refreshStorageUsage: (options) => this.refreshStorageUsage(options),
    scheduleFiniteCaptureErrorReset: (updatedAt, mode) => this.scheduleFiniteCaptureErrorReset(updatedAt, mode),
    findSelectedImage: (handleId) => this.findSelectedImage(handleId),
    isProjectionActive: (projectionId) => this.projections.isActive(projectionId),
    applySelectedUrl: (url, attemptedFieldIds, options) => this.projectionApplication.applySelectedUrl(url, attemptedFieldIds, options),
    removeCapturedBlobReference: (blobId, options) => this.capturedOriginals.removeCapturedBlobReference(blobId, options),
    bookmarkStore: () => this.bookmarkStore,
    recentHistoryStore: () => this.recentHistoryStore,
    createThumbnailDataUrlFromImage,
    createThumbnailDataUrlFromUrl,
    createThumbnailDataUrlFromDataUrl,
    fetchThumbnailSource,
  });
  private readonly capturedOriginals: CapturedOriginalsController = new CapturedOriginalsController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: (options) => this.render(options),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
    refreshStorageUsage: (options) => this.refreshStorageUsage(options),
    applyStorageUsage: (usage) => this.applyStorageUsage(usage),
    invalidateStorageUsageRequests: () => {
      this.storageUsageRequestId += 1;
    },
    scheduleFiniteCaptureErrorReset: (updatedAt, mode) => this.scheduleFiniteCaptureErrorReset(updatedAt, mode),
    refreshBlobKeyStatus: () => this.recallExport.refreshBlobKeyStatus(),
    saveRecentRecordAsBookmark: (record, options) => this.recordLibrary.saveRecentRecordAsBookmark(record, options),
    markRecentHistoryRowPinned: (id, bookmark) => this.recordLibrary.markRecentHistoryRowPinned(id, bookmark),
    captureStore: () => this.captureStore,
    bookmarkStore: () => this.bookmarkStore,
    recentHistoryStore: () => this.recentHistoryStore,
  });
  private readonly projectionApplication: ProjectionApplicationController = new ProjectionApplicationController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    loadGrabSettings: () => this.loadGrabSettings(),
    scheduleFiniteCaptureErrorReset: (updatedAt, mode, durationMs) => this.scheduleFiniteCaptureErrorReset(updatedAt, mode, durationMs),
    saveFieldState: () => this.fieldStateSync.save(),
    setExtensionProjectedPageUrl: (pageUrl) => this.fieldStateSync.setExtensionProjectedPageUrl(pageUrl),
    refreshBufferedNavPreloads: () => this.bufferedNav.refreshPreloads(),
    primeBufferedNav: () => this.bufferedNav.prime(),
    refreshBlobKeyStatus: () => this.recallExport.refreshBlobKeyStatus(),
    saveUrlReviewStatus: (status, sourceUrl, fieldIds, reason) => this.saveUrlReviewStatus(status, sourceUrl, fieldIds, reason),
    currentKnownImageFingerprint: () => this.currentKnownImageFingerprint(),
    applyFieldLoadResult: (state, attemptedFieldIds, nextFingerprint, previousFingerprint) =>
      this.applyFieldLoadResult(state, attemptedFieldIds, nextFingerprint, previousFingerprint),
    pruneInvalidFieldSplitSpecsForUrl: (state, url, options) => this.pruneInvalidFieldSplitSpecsForUrl(state, url, options),
    parsedFieldRequestContextKey: (attemptedFieldIds, direction, runId) =>
      this.parsedFieldNavigation.parsedFieldRequestContextKey(attemptedFieldIds, direction, runId),
    currentSelectedUrl: () => this.currentSelectedUrl(),
    projectedSourceUrl: () => this.projectedSourceUrl(),
    findSelectedImage: (handleId) => this.findSelectedImage(handleId),
    projections: () => this.projections,
    neighborPreload: () => this.neighborPreload,
    pageAdapter: () => this.pageAdapter,
    captureStore: () => this.captureStore,
  });
  private readonly panelPosition: PanelPositionController = new PanelPositionController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderRecallOnly: () => this.renderRecallOnly(),
    whenStylesReady: () => this.panelMount.whenStylesReady(),
    root: () => this.root,
    panelPositionStore: () => this.panelPositionStore,
  });
  private readonly recallDrawer: RecallDrawerController = new RecallDrawerController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderRecallOnly: () => this.renderRecallOnly(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
    ensurePanelPositionRestored: () => this.panelPosition.ensurePanelPositionRestored(),
    refreshBlobKeyStatus: () => this.recallExport.refreshBlobKeyStatus(),
    root: () => this.root,
    recallStore: () => this.recallStore,
  });
  private readonly panelSettings: PanelSettingsController = new PanelSettingsController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    getLocalSettings: () => this.localSettings,
    setLocalSettings: (settings) => {
      this.localSettings = settings;
    },
    render: () => this.render(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
    loadRecentHistory: (options) => this.loadRecentHistory(options),
    currentNavigationBaseModel: () => this.currentNavigationBaseModel(),
    includedNavigationFields: (fields) => this.parsedFieldNavigation.includedNavigationFields(fields),
    localSettingsStore: () => this.localSettingsStore,
    governor: () => this.governor,
    neighborPreload: () => this.neighborPreload,
    pageAdapter: () => this.pageAdapter,
  });
  private readonly parsedFieldNavigation: ParsedFieldNavigationController = new ParsedFieldNavigationController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    loadGrabSettings: () => this.loadGrabSettings(),
    saveFieldState: () => this.fieldStateSync.save(),
    saveUrlTemplateFromCurrentFields: () => this.urlTemplateSettings.saveUrlTemplateFromCurrentFields(),
    currentNavigationBaseModel: () => this.currentNavigationBaseModel(),
    currentNavigationBaseRawUrl: () => this.currentNavigationBaseRawUrl(),
    currentKnownImageFingerprint: () => this.currentKnownImageFingerprint(),
    applyFieldLoadResult: (state, attemptedFieldIds, nextFingerprint, previousFingerprint) =>
      this.applyFieldLoadResult(state, attemptedFieldIds, nextFingerprint, previousFingerprint),
    saveUrlReviewStatus: (status, sourceUrl, fieldIds, reason) => this.saveUrlReviewStatus(status, sourceUrl, fieldIds, reason),
    isNavigableQueryField: (field) => this.isNavigableQueryField(field),
    governor: () => this.governor,
    bufferedNav: () => this.bufferedNav,
    neighborPreload: () => this.neighborPreload,
    projectionApplication: () => this.projectionApplication,
    pageAdapter: () => this.pageAdapter,
  });
  private readonly fieldEditor: FieldEditorController = new FieldEditorController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    scheduleFiniteCaptureErrorReset: (updatedAt, mode) => this.scheduleFiniteCaptureErrorReset(updatedAt, mode),
    currentRawUrl: () => this.currentRawUrl(),
    currentUrlModel: () => this.currentUrlModel(),
    pruneInvalidFieldSplitSpecsForUrl: (state, url, options) => this.pruneInvalidFieldSplitSpecsForUrl(state, url, options),
    applyPanelState: (nextState, options) => this.applyPanelState(nextState, options),
    enqueueFieldInteraction: (run) => this.fieldStateSync.enqueueFieldInteraction(run),
    saveFieldState: () => this.fieldStateSync.save(),
    saveUrlTemplateFromCurrentFields: () => this.urlTemplateSettings.saveUrlTemplateFromCurrentFields(),
    applySelectedUrl: (url, attemptedFieldIds, options) => this.projectionApplication.applySelectedUrl(url, attemptedFieldIds, options),
  });
  private bufferedNavigationToastTimer: number | null = null;
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
    private readonly parsedFieldStateStore: ParsedFieldStateStore | null = null,
    private readonly urlReviewStatusStore: UrlReviewStatusStore | null = null,
  ) {
    this.panelMount.registerSubscriptions([
      this.pageAdapter.subscribe((snapshot) => {
        this.state = setTargetState(this.state, toTargetState(snapshot));
        this.render();
        void this.loadGrabSettings().then(() => this.fieldStateSync.restore());
      }),
      this.pageAdapter.subscribeToSuccessfulLoads((target) => {
        if (target.projectionId && !this.projections.isActive(target.projectionId)) return;
        if (target.projectionId) this.projections.update(target.projectionId, { status: 'loaded' });
        void this.recordLibrary.addRecentHistory(target.url, target.thumbnail, {
          trustLoadedImage: target.trustedLoadedImage,
          width: target.width,
          height: target.height,
          projectionId: target.projectionId,
        });
      }),
      this.pageAdapter.subscribeToBookmarkRequests((target) => {
        this.recordLibrary.enqueueBookmarkMutation(async () => {
          const options = { trustLoadedImage: target.trustedLoadedImage, width: target.width, height: target.height };
          const bookmarked = await this.recordLibrary.bookmarkUrl(target.url, target.thumbnail, options);
          if (bookmarked) {
            await this.recordLibrary.addRecentHistory(target.url, target.thumbnail, options);
          }
        });
      }),
      this.pageAdapter.subscribeToGrabSourcePatternRequests((url) => {
        void this.urlTemplateSettings.learnGrabSourcePattern(url);
      }),
    ]);
    void this.loadSettingsBookmarksAndRecents();
    void this.loadGrabSettings().then(() => this.fieldStateSync.restore());
    void this.refreshStorageUsage();
    void this.recallExport.refreshBlobKeyStatus();
    void this.recallExport.refreshPCloudProviderStatus({ render: false });

    this.keyboard = new KeyboardRouter((action) => this.handleKeyAction(action));

    this.slideshow = new Slideshow(
      (direction) => this.parsedFieldNavigation.navigateBy(direction, 'slideshow'),
      (phase, count) => {
        this.state = setAutomationState(this.state, { slideshowPhase: phase, slideshowCount: count });
        this.render();
      },
    );

    this.retry = new Retry404(
      () => this.tryReloadCurrent(),
      (direction) => this.parsedFieldNavigation.navigateBy(direction, 'retry'),
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

  setBuildIdentity(buildIdentity: BuildIdentity | null): void {
    this.state = { ...this.state, buildIdentity };
    if (this.state.visible && this.state.settingsOpen) this.render();
  }

  toggle(): PanelState {
    const wasVisible = this.state.visible;
    this.dispatch({ name: 'toggle-panel' });
    if (!wasVisible && this.state.visible) this.restoreParsedFieldStateForCurrentPanel();
    return this.state;
  }

  destroy(): void {
    this.state = reducePanelAction(this.state, { name: 'close-panel' });
    this.slideshow.destroy();
    this.retry.destroy();
    this.keyboard.disable();
    this.bufferedNav.dispose();
    this.neighborPreload.dispose();
    this.cleanupMountedElements({ releaseTarget: true });
  }

  private cleanupMountedElements(options: { readonly releaseTarget?: boolean } = {}): void {
    if (options.releaseTarget) {
      this.pageAdapter.cleanup();
    } else {
      this.pageAdapter.suspend();
    }
    this.panelMount.teardown();
    this.panelPosition.invalidateRestore();
    this.recallDrawer.clearRecallMessageTimer();
    this.clearFiniteCaptureErrorTimer();
  }

  disconnect(): void {
    this.destroy();
    this.panelMount.disposeSubscriptions();
  }

  private loadBookmarks = async (options: { readonly render?: boolean } = {}): Promise<void> => {
    if (!this.bookmarkStore) return;
    await this.loadBookmarkPage(0, options);
  };

  private loadSettingsBookmarksAndRecents = async (): Promise<void> => {
    await this.panelSettings.loadLocalSettings({ render: false });
    await Promise.all([this.loadBookmarks({ render: false }), this.loadRecentHistory({ render: false })]);
    this.render();
  };

  private async loadGrabSettings(options: { readonly render?: boolean } = {}): Promise<void> {
    if (!this.urlTemplateStore) return;
    const hostname = this.urlTemplateSettings.currentUrlTemplateHostname();
    if (!hostname) return;
    const [templates, grabSourcePatterns] = await Promise.all([
      this.urlTemplateStore.load(hostname),
      this.urlTemplateStore.loadGrabSourcePatterns(hostname),
    ]);
    this.state = reducePanelAction(this.state, {
      name: 'url-templates/load',
      templates,
      activeTemplateId: this.urlTemplateSettings.activeTemplateIdForCurrentUrl(templates),
    });
    this.state = reducePanelAction(this.state, {
      name: 'grab-source-patterns/load',
      patterns: grabSourcePatterns,
    });
    this.urlTemplateSettings.syncGrabSettings();
    this.bufferedNav.prime();
    if (options.render !== false) this.render();
  }

  private parsedFieldStateHostname(): string | null {
    return hostnameFromLocation();
  }

  private createParsedFieldStateRecord(): ParsedFieldStateRecord | null {
    const hostname = this.parsedFieldStateHostname();
    if (!hostname) return null;
    if (!this.state.target.selectedUrl && !this.state.draftUrl) return null;
    return {
      schemaVersion: 1,
      hostname,
      pageUrl: this.fieldStateSync.pageUrl(),
      sourceUrl: this.currentRawUrl(),
      selectedUrl: this.state.target.selectedUrl,
      selectedHandleId: this.state.target.selectedHandleId,
      activeFieldId: this.state.activeFieldId,
      failedFieldId: this.state.failedFieldId,
      successfulFieldIds: this.state.successfulFieldIds,
      unchangedFieldIds: this.state.unchangedFieldIds,
      unlockedFieldIds: this.state.unlockedFieldIds,
      manuallyExcludedFieldIds: this.state.manuallyExcludedFieldIds,
      fieldSplitSpecs: this.state.fieldSplitSpecs,
      fieldDigitWidthSpecs: this.state.fieldDigitWidthSpecs,
      activeUrlTemplateId: this.state.activeUrlTemplateId,
      updatedAt: this.fieldStateSync.nextUpdatedAt(),
    };
  }

  private async applyRestoredParsedFieldState(
    record: ParsedFieldStateRecord,
    ctx: { readonly sameSource: boolean; readonly projectSavedSource: boolean },
  ): Promise<void> {
    if (ctx.projectSavedSource && !ctx.sameSource) {
      const projected = await this.projectionApplication.applySelectedUrl(record.sourceUrl, [], { reason: 'parsed-field-restore' });
      if (!projected && !imageResourceUrlsEqual(record.sourceUrl, this.currentRawUrl(), window.location.href)) return;
    }
    this.state = reducePanelAction(this.state, {
      name: 'parsed-field-state/restore',
      record: this.filterParsedFieldStateForCurrentUrl(record),
    });
    this.urlTemplateSettings.syncGrabSettings();
    void this.fieldStateSync.save();
    this.render();
  }

  private restoreParsedFieldStateForCurrentPanel(): void {
    void this.loadGrabSettings({ render: false }).then(() => this.fieldStateSync.restore({ projectSavedSource: true }));
  }

  private filterParsedFieldStateForCurrentUrl(record: ParsedFieldStateRecord): ParsedFieldStateRecord {
    try {
      const model = applyFieldDigitWidthSpecs(
        applyFieldSplitSpecs(parseUrl(record.sourceUrl), record.fieldSplitSpecs),
        record.fieldDigitWidthSpecs ?? [],
      );
      const fieldIds = new Set(collectUrlFields(model).map((field) => field.id));
      const keep = (ids: readonly string[]): readonly string[] => ids.filter((id) => fieldIds.has(id));
      return {
        ...record,
        activeFieldId: record.activeFieldId && fieldIds.has(record.activeFieldId) ? record.activeFieldId : null,
        failedFieldId: record.failedFieldId && fieldIds.has(record.failedFieldId) ? record.failedFieldId : null,
        successfulFieldIds: keep(record.successfulFieldIds),
        unchangedFieldIds: keep(record.unchangedFieldIds),
        unlockedFieldIds: keep(record.unlockedFieldIds),
        manuallyExcludedFieldIds: keep(record.manuallyExcludedFieldIds),
        fieldDigitWidthSpecs: (record.fieldDigitWidthSpecs ?? []).filter((spec) => fieldIds.has(spec.fieldId)),
      };
    } catch {
      return { ...record, activeFieldId: null, failedFieldId: null };
    }
  }

  private loadRecentHistory = async (options: { readonly render?: boolean } = {}): Promise<void> => {
    if (!this.recentHistoryStore) return;
    const history = await this.recentHistoryStore.load(window.location.href);
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    if (options.render !== false) this.render();
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

  private scheduleFiniteCaptureErrorReset(
    updatedAt: number,
    mode: 'status' | 'capture-result',
    durationMs: number = FINITE_CAPTURE_ERROR_MS,
  ): void {
    this.clearFiniteCaptureErrorTimer();
    this.finiteCaptureErrorTimer = window.setTimeout(() => {
      this.finiteCaptureErrorTimer = null;
      if (this.state.lastUpdatedAt !== updatedAt) return;
      if (mode === 'status') {
        if (this.state.status !== 'error') return;
        this.state = { ...this.state, status: 'ready', message: 'Image Trail is ready.', lastUpdatedAt: Date.now() };
      } else {
        if (this.state.captureResult === null || this.state.captureResult.status === 'captured') return;
        this.state = { ...reducePanelAction(this.state, { name: 'capture/clear' }), message: 'Image Trail is ready.' };
      }
      this.render();
    }, durationMs);
  }

  private clearFiniteCaptureErrorTimer(): void {
    if (this.finiteCaptureErrorTimer === null) return;
    window.clearTimeout(this.finiteCaptureErrorTimer);
    this.finiteCaptureErrorTimer = null;
  }

  private renderPanelAndRefreshRecall(): void {
    this.render({ includeRecall: false });
    this.recallDrawer.refreshRecallIfOpen();
  }

  private createActionDeps(): PanelActionDeps {
    return {
      getState: () => this.state,
      reduce: (action) => {
        this.state = reducePanelAction(this.state, action);
      },
      applyPanelState: (nextState, options) => this.applyPanelState(nextState, options),
      syncTargetState: (snapshot) => {
        this.state = setTargetState(this.state, toTargetState(snapshot));
      },
      render: (options) => this.render(options),
      renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
      refreshRecallIfOpen: () => this.recallDrawer.refreshRecallIfOpen(),
      clearRecallMessageTimer: () => this.recallDrawer.clearRecallMessageTimer(),
      getLocalSettings: () => this.localSettings,
      saveLocalSettings: (settings) => this.panelSettings.saveLocalSettings(settings),
      pageAdapter: () => this.pageAdapter,
      panelMount: () => this.panelMount,
      keyboard: () => this.keyboard,
      slideshow: () => this.slideshow,
      retry: () => this.retry,
      fieldStateSync: () => this.fieldStateSync,
      bufferedNav: () => this.bufferedNav,
      urlTemplateSettings: () => this.urlTemplateSettings,
      recallExport: () => this.recallExport,
      recallRestore: () => this.recallRestore,
      bookmarkCurrentImage: () => this.recordLibrary.bookmarkCurrentImage(),
      removeRecentHistory: (id) => this.recordLibrary.removeRecentHistory(id),
      deleteRecentHistory: () => this.recordLibrary.deleteRecentHistory(),
      pinRecentHistory: (id) => this.recordLibrary.pinRecentHistory(id),
      loadBookmark: (id) => this.recordLibrary.loadBookmark(id),
      removeBookmark: (id) => this.recordLibrary.removeBookmark(id),
      loadBookmarkPage: (offset, options) => this.loadBookmarkPage(offset, options),
      refreshBookmarkThumbnails: () => this.recordLibrary.refreshBookmarkThumbnails(),
      deleteVisibleBookmarks: () => this.recordLibrary.deleteVisibleBookmarks(),
      deleteRecallBookmarks: () => this.recordLibrary.deleteRecallBookmarks(),
      updateVisibleBookmarkSoftMax: (value) => this.panelSettings.updateVisibleBookmarkSoftMax(value),
      updateRecentHistoryRetention: (input) => this.panelSettings.updateRecentHistoryRetention(input),
      updatePinSaveStoragePreference: (value) => this.panelSettings.updatePinSaveStoragePreference(value),
      updateUrlReviewStatusRetention: (limit, clearAfterExport) =>
        this.panelSettings.updateUrlReviewStatusRetention(limit, clearAfterExport),
      updateRequestThrottle: (minimumIntervalMs, maxRequests, windowMs) =>
        this.panelSettings.updateRequestThrottle(minimumIntervalMs, maxRequests, windowMs),
      updateNeighborPreload: (enabled, radius, cacheLimit, probeMethod) =>
        this.panelSettings.updateNeighborPreload(enabled, radius, cacheLimit, probeMethod),
      preloadMoreNeighbors: (radius, cacheLimit) => this.panelSettings.preloadMoreNeighbors(radius, cacheLimit),
      resetPanelPosition: () => this.panelPosition.resetPanelPosition(),
      refreshStorageUsage: (options) => this.refreshStorageUsage(options),
      restoreParsedFieldStateForCurrentPanel: () => this.restoreParsedFieldStateForCurrentPanel(),
      openRecallDrawer: () => this.recallDrawer.openRecallDrawer(),
      loadRecallCandidates: (input) => this.recallDrawer.loadRecallCandidates(input),
      recallSelectedRecords: () => this.recallDrawer.recallSelectedRecords(),
      enqueueFieldTransform: (action) => this.fieldEditor.enqueueFieldTransform(action),
      enqueueSelectedUrlApply: (url) => this.fieldEditor.enqueueSelectedUrlApply(url),
      rejectUrlEditorInput: () => this.fieldEditor.rejectUrlEditorInput(),
      captureImage: (url, sourceType, sourceRecordId) => this.capturedOriginals.captureImage(url, sourceType, sourceRecordId),
      deleteCapturedBlob: (recordId, blobId) => this.capturedOriginals.deleteCapturedBlob(recordId, blobId),
      cleanupOrphanedBlobs: () => this.capturedOriginals.cleanupOrphanedBlobs(),
      previewRecord: (url, blobId, scrollAnchorId) => this.projectionApplication.previewRecord(url, blobId, scrollAnchorId),
      clearUrlReviewStatus: (scope) => this.clearUrlReviewStatus(scope),
      navigateBy: (delta) => this.parsedFieldNavigation.navigateBy(delta),
      cancelQueuedSlideshowNavigation: () => this.parsedFieldNavigation.cancelQueuedSlideshowNavigation(),
    };
  }

  // The former dispatch chain's fall-through tail, kept verbatim: `toggle-panel`/`close-panel` and
  // any unregistered action reduce first, then remount or tear down based on post-reduce visibility.
  private readonly handleDefaultAction = (action: PanelAction): void => {
    this.state = reducePanelAction(this.state, action);
    if (!this.state.visible) {
      void this.fieldStateSync.save();
      this.slideshow.destroy();
      this.retry.destroy();
      this.keyboard.disable();
      this.cleanupMountedElements({ releaseTarget: true });
      return;
    }
    this.pageAdapter.prepareStandaloneImageBackdrop();
    this.panelMount.mount();
    this.keyboard.enable();
    this.pageAdapter.enableBookmarkShortcut();
    this.pageAdapter.autoSelectSingleImage();
    this.render();
  };

  // Built in a field initializer; safe because every deps member is a lazy closure, so nothing
  // dereferences the constructor-assigned collaborators (keyboard/slideshow/retry) until a handler runs.
  private readonly actionRegistry = buildPanelActionRegistry(this.createActionDeps());

  private dispatch = (action: PanelAction): void => {
    dispatchPanelAction(this.actionRegistry, action, this.handleDefaultAction);
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
      case 'buffer-debug-toggle':
        this.bufferedNav.toggleDebugVisible();
        break;
      case 'stop':
        this.dispatch({ name: 'stop-all' });
        break;
      case 'panel-toggle':
        this.dispatch({ name: 'toggle-panel' });
        break;
      case 'grab-mode-toggle':
        this.dispatch({ name: this.state.target.grabModeActive ? 'grab-mode/stop' : 'grab-mode/start' });
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
    return this.urlModelFromRawUrl(this.currentRawUrl());
  }

  private currentNavigationBaseModel(): ParsedUrlModel {
    return this.urlModelFromRawUrl(this.currentNavigationBaseRawUrl());
  }

  private urlModelFromRawUrl(url: string): ParsedUrlModel {
    return this.applyCurrentFieldDigitWidthSpecs(applyFieldSplitSpecs(parseUrl(url), this.state.fieldSplitSpecs));
  }

  private pruneInvalidFieldSplitSpecsForUrl(
    state: PanelState,
    url: string,
    options: { readonly preserveMessage?: boolean } = {},
  ): PanelState {
    if (state.fieldSplitSpecs.length === 0) return state;
    let model: ParsedUrlModel;
    try {
      model = parseUrl(url);
    } catch {
      return state;
    }
    const pruned = pruneInvalidFieldSplitSpecsFromState(state, model);
    if (pruned === state || options.preserveMessage !== true) return pruned;
    return { ...pruned, status: state.status, message: state.message, lastUpdatedAt: state.lastUpdatedAt };
  }

  private applyCurrentFieldDigitWidthSpecs(model: ParsedUrlModel): ParsedUrlModel {
    return applyFieldDigitWidthSpecs(model, this.state.fieldDigitWidthSpecs);
  }

  private currentRawUrl(): string {
    return this.draftUrl() ?? this.projectedSourceUrl() ?? this.pageUrl();
  }

  private currentNavigationBaseRawUrl(): string {
    return this.state.failedFieldId && this.state.target.selectedUrl ? this.state.target.selectedUrl : this.currentRawUrl();
  }

  private projectedSourceUrl(): string | null {
    const snapshot = this.pageAdapter.getSnapshot();
    return snapshot.selected?.url ?? this.state.target.selectedUrl ?? null;
  }

  private draftUrl(): string | null {
    return this.state.draftUrl;
  }

  private pageUrl(): string {
    return window.location.href;
  }

  private currentSelectedUrl(): string | null {
    const snapshot = this.pageAdapter.getSnapshot();
    const selectedUrl = snapshot.selected?.url ?? this.state.target.selectedUrl;
    return selectedUrl?.startsWith('data:') ? 'data:' : (selectedUrl ?? null);
  }

  private applyPanelState(
    nextState: PanelState,
    options: { readonly saveParsedFieldState?: boolean; readonly render?: boolean } = {},
  ): boolean {
    if (nextState === this.state) return false;
    this.state = nextState;
    if (options.saveParsedFieldState) void this.fieldStateSync.save();
    if (options.render) this.render();
    return true;
  }

  private currentKnownImageFingerprint(): string | null {
    if (this.state.currentImageFingerprint) return this.state.currentImageFingerprint;
    const currentUrl = this.state.target.selectedUrl;
    if (!currentUrl) return null;
    return this.neighborPreload.getCachedFingerprint(currentUrl);
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
      unlockedFieldIds: changed ? addItems(removeItems(state.unlockedFieldIds, attemptedFieldIds), autoUnlocked) : state.unlockedFieldIds,
      currentImageFingerprint: nextFingerprint ?? state.currentImageFingerprint,
    };
  }

  private isAutoUnlockableField(fieldId: string): boolean {
    const model = this.currentUrlModel();
    const field = collectUrlFields(model).find((candidate) => candidate.id === fieldId);
    return field ? this.isNavigableQueryField(field) : false;
  }

  private isNavigableQueryField(field: UrlField): boolean {
    return field.location === 'query' && (field.tokenKind === 'int' || field.tokenKind === 'hex');
  }

  private async saveUrlReviewStatus(
    status: UrlReviewStatus,
    sourceUrl: string,
    fieldIds: readonly string[],
    reason?: string,
  ): Promise<void> {
    if (!this.urlReviewStatusStore || fieldIds.length === 0) return;
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    await this.urlReviewStatusStore.save(
      {
        schemaVersion: 1,
        hostname,
        pageUrl: this.fieldStateSync.pageUrl(),
        sourceUrl,
        status,
        fieldIds,
        activeFieldId: this.state.activeFieldId,
        reason,
        updatedAt: new Date().toISOString(),
      },
      { maxRecordsPerHost: this.localSettings.urlReviewStatusLimit },
    );
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

  private showPCloudBackupPlaceholder(kind: 'backup' | 'restore'): void {
    const message =
      kind === 'backup'
        ? 'pCloud is connected. Backup upload is the next implementation slice.'
        : 'pCloud is connected. Restore file selection is the next implementation slice.';
    this.state = reducePanelAction(this.state, { name: 'pcloud-backup/message', message });
    this.render();
  }

  private async clearUrlReviewStatus(scope: 'hostname' | 'page' | 'source' | 'all'): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const filter = this.urlReviewStatusClearFilter(scope);
    const deletedCount = filter && this.urlReviewStatusStore ? await this.urlReviewStatusStore.clear(filter) : 0;
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `Cleared ${deletedCount} URL review status record${deletedCount === 1 ? '' : 's'} for ${urlReviewStatusClearScopeLabel(scope)}.`,
    });
    this.render();
  }

  private urlReviewStatusClearFilter(scope: 'hostname' | 'page' | 'source' | 'all'): UrlReviewStatusClearFilter | null {
    if (scope === 'all') return { scope: 'all' };
    const hostname = hostnameFromLocation();
    if (!hostname) return null;
    if (scope === 'hostname') return { scope: 'hostname', hostname };
    if (scope === 'page') return { scope: 'page', hostname, pageUrl: this.fieldStateSync.pageUrl() };
    const sourceUrl = this.state.draftUrl ?? this.state.target.selectedUrl;
    return sourceUrl ? { scope: 'source', hostname, sourceUrl } : null;
  }

  private async refreshStorageUsage(options: { readonly render?: boolean } = {}): Promise<void> {
    if (!this.captureStore) return;
    const requestId = (this.storageUsageRequestId += 1);
    try {
      const usage = await this.captureStore.requestStorageUsage();
      if (requestId !== this.storageUsageRequestId) return;
      this.applyStorageUsage(usage, { preserveRequestId: true });
      if (options.render || this.state.settingsOpen) this.render();
    } catch {
      // Storage health is informational; it must not break row actions.
    }
  }

  private applyStorageUsage(usage: NonNullable<PanelState['storageUsage']>, options: { readonly preserveRequestId?: boolean } = {}): void {
    if (!options.preserveRequestId) this.storageUsageRequestId += 1;
    this.state = reducePanelAction(this.state, { name: 'storage/update', usage });
  }

  private render(options: { readonly includeRecall?: boolean } = {}): void {
    if (this.root) {
      const focusedControl = this.captureFocusedPanelControl();
      renderPanel(
        {
          root: this.root,
          recallRoot: this.recallRoot,
          toastRoot: this.toastRoot,
          dispatch: this.dispatch,
          layoutState: this.layoutState,
          scrollAnchorId: this.projectionApplication.previewScrollAnchorId,
          onPanelDragStart: this.panelPosition.handlePanelDragStart,
        },
        this.state,
        { renderRecall: options.includeRecall !== false },
      );
      this.restoreFocusedPanelControl(focusedControl);
      if (!this.state.minimized && this.panelStylesReady) {
        this.panelPosition.queuePanelPositionRestore();
        this.panelPosition.applyRestoredPanelPosition();
      }
      this.renderBufferedDebugOverlay();
    }
  }

  private renderBufferedDebugOverlay(): void {
    if (!this.root) return;
    const existing = this.root.querySelector('.image-trail-panel__buffer-debug');
    const snapshot = this.bufferedNav.getDebugSnapshot();
    if (!snapshot) {
      existing?.remove();
      return;
    }
    const overlay = existing instanceof HTMLElement ? existing : document.createElement('div');
    overlay.className = 'image-trail-panel__buffer-debug';
    const { cursor, bufferN, indices } = snapshot;
    const cells: HTMLElement[] = [];
    for (let index = cursor - bufferN; index <= cursor + bufferN; index += 1) {
      const entry = indices.get(index);
      const cell = document.createElement('span');
      cell.className = 'image-trail-panel__buffer-debug-cell';
      cell.dataset.status = entry ? `${entry.manifest}:${entry.image}` : 'UNKNOWN';
      if (index === cursor) cell.classList.add('is-current');
      cell.title = `${index}: ${entry?.manifest ?? 'UNKNOWN'} / ${entry?.image ?? 'UNKNOWN'}`;
      cell.textContent = String(index);
      cells.push(cell);
    }
    overlay.replaceChildren(...cells);
    if (!existing) this.root.append(overlay);
  }

  private showBufferedNavigationToast(message: string): void {
    if (!this.root || !this.toastRoot) return;
    if (this.bufferedNavigationToastTimer !== null) {
      window.clearTimeout(this.bufferedNavigationToastTimer);
      this.bufferedNavigationToastTimer = null;
    }
    this.root.classList.remove('has-buffered-skip-pulse');
    void this.root.offsetWidth;
    this.root.classList.add('has-buffered-skip-pulse');

    this.toastRoot.replaceChildren();
    this.toastRoot.className = 'image-trail-panel-root image-trail-panel__toast-root has-buffered-skip-pulse';

    const toast = document.createElement('aside');
    toast.className = 'image-trail-panel__toast image-trail-panel__buffered-skip-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const label = document.createElement('span');
    label.className = 'image-trail-panel__toast-label';
    label.textContent = 'Skipped';

    const copy = document.createElement('span');
    copy.className = 'image-trail-panel__toast-message';
    copy.textContent = message;
    copy.title = message;

    toast.append(label, copy);
    this.toastRoot.append(toast);
    this.bufferedNavigationToastTimer = window.setTimeout(() => {
      this.root?.classList.remove('has-buffered-skip-pulse');
      if (this.toastRoot) {
        this.toastRoot.replaceChildren();
        this.toastRoot.className = 'image-trail-panel-root image-trail-panel__toast-root';
      }
      this.bufferedNavigationToastTimer = null;
    }, 1800);
  }

  private captureFocusedPanelControl(): {
    readonly index: number;
    readonly tagName: string;
    readonly inputType?: string;
    readonly value?: string;
    readonly selectionStart?: number | null;
    readonly selectionEnd?: number | null;
  } | null {
    if (!this.root) return null;
    const rootNode = this.root.getRootNode();
    const activeElement = rootNode instanceof ShadowRoot ? rootNode.activeElement : document.activeElement;
    if (!(activeElement instanceof HTMLElement) || !this.root.contains(activeElement)) return null;
    if (!isFocusablePanelControl(activeElement)) return null;
    const controls = this.focusablePanelControls();
    const index = controls.indexOf(activeElement);
    if (index < 0) return null;
    if (activeElement instanceof HTMLInputElement) {
      if (activeElement.type === 'file') return { index, tagName: activeElement.tagName, inputType: activeElement.type };
      return {
        index,
        tagName: activeElement.tagName,
        inputType: activeElement.type,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      };
    }
    if (activeElement instanceof HTMLTextAreaElement) {
      return {
        index,
        tagName: activeElement.tagName,
        value: activeElement.value,
        selectionStart: activeElement.selectionStart,
        selectionEnd: activeElement.selectionEnd,
      };
    }
    return { index, tagName: activeElement.tagName };
  }

  private restoreFocusedPanelControl(
    focusedControl: {
      readonly index: number;
      readonly tagName: string;
      readonly inputType?: string;
      readonly value?: string;
      readonly selectionStart?: number | null;
      readonly selectionEnd?: number | null;
    } | null,
  ): void {
    if (!this.root || !focusedControl) return;
    const nextControl = this.focusablePanelControls()[focusedControl.index];
    if (!nextControl || nextControl.tagName !== focusedControl.tagName) return;
    if (
      focusedControl.inputType !== undefined &&
      (!(nextControl instanceof HTMLInputElement) || nextControl.type !== focusedControl.inputType)
    ) {
      return;
    }
    if (nextControl instanceof HTMLInputElement && nextControl.type === 'file') {
      nextControl.focus();
      return;
    }
    if (focusedControl.value !== undefined && (nextControl instanceof HTMLInputElement || nextControl instanceof HTMLTextAreaElement)) {
      nextControl.value = focusedControl.value;
      try {
        nextControl.setSelectionRange(focusedControl.selectionStart ?? null, focusedControl.selectionEnd ?? null);
      } catch {
        // Some input types, such as number, do not support selection ranges.
      }
    }
    nextControl.focus();
  }

  private focusablePanelControls(): HTMLElement[] {
    if (!this.root) return [];
    return Array.from(this.root.querySelectorAll<HTMLElement>('button, input, select, textarea'));
  }

  private renderRecallOnly(): void {
    if (!this.root || !this.recallRoot) return;
    renderRecallDrawer(
      {
        root: this.root,
        recallRoot: this.recallRoot,
        toastRoot: this.toastRoot,
        dispatch: this.dispatch,
        layoutState: this.layoutState,
        scrollAnchorId: this.projectionApplication.previewScrollAnchorId,
        onPanelDragStart: this.panelPosition.handlePanelDragStart,
      },
      this.state,
    );
  }
}
