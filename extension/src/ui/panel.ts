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
import { reducePanelAction } from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import type { BuildIdentity } from '../core/build-info.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type {
  BookmarkStore,
  PanelAction,
  PanelPositionStore,
  WorkspaceLayoutStore,
  PanelState,
  ParsedFieldStateStore,
  UrlTemplateStore,
  UrlReviewStatusStore,
} from '../core/types.js';
import { pruneInvalidFieldSplitSpecsForUrl, urlModelFromRawUrl } from './panel/url-model.js';
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
import { WorkspaceLayoutController } from './panel/workspace-layout-controller.js';
import { handlePanelShortcutAction } from './panel/shortcut-actions.js';
import { PanelRenderController } from './panel/panel-render-controller.js';
import { ParsedFieldStateRecordController } from './panel/parsed-field-state-record-controller.js';
import { UrlReviewStatusController } from './panel/url-review-status-controller.js';
import { PanelDataLoadController } from './panel/panel-data-load-controller.js';
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
import { DEFAULT_LOCAL_SETTINGS, type LocalSettingsStore, type PlaintextLocalSettings } from '../content/panel-services.js';
import { hostnameFromLocation } from './panel-position.js';
import { galleryOpenErrorState, openGalleryErrorMessage } from './panel/gallery-action.js';

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

export interface ImageTrailPanelOptions {
  readonly applyBuildInfoOverlayVisibility?: (visible: boolean) => void;
}

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
  private get detachedRoot(): HTMLElement | null {
    return this.panelMount.detachedRoot;
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
  private readonly fieldStateSync = new ParsedFieldStateSync({
    store: () => this.parsedFieldStateStore,
    hostname: () => hostnameFromLocation(),
    currentPageHref: () => window.location.href,
    currentSelectedUrl: () => this.currentSelectedUrl(),
    selectedHandleId: () => this.state.target.selectedHandleId,
    syncTargetStateFromSnapshot: () => {
      this.state = setTargetState(this.state, toTargetState(this.pageAdapter.getSnapshot()));
    },
    createRecord: () => this.parsedFieldStateRecord.createParsedFieldStateRecord(),
    applyRestoredRecord: (record, ctx) => this.parsedFieldStateRecord.applyRestoredParsedFieldState(record, ctx),
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
    onToast: (message) => this.panelRender.showBufferedNavigationToast(message),
    onSkipCapReached: (message) => {
      this.state = {
        ...this.state,
        status: 'ready',
        message,
        failedFieldId: null,
        lastUpdatedAt: Date.now(),
      };
      this.render();
      this.panelRender.showBufferedNavigationToast(message);
    },
    onDebugChanged: () => this.panelRender.renderBufferedDebugOverlay(),
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
    loadGrabSettings: (options) => this.panelDataLoad.loadGrabSettings(options),
  });
  private readonly recallExport = new RecallExportController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
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
    loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
    loadRecentHistory: (options) => this.panelDataLoad.loadRecentHistory(options),
    refreshStorageUsage: (options) => this.panelDataLoad.refreshStorageUsage(options),
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
    loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
    refreshStorageUsage: (options) => this.panelDataLoad.refreshStorageUsage(options),
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
    loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
    refreshStorageUsage: (options) => this.panelDataLoad.refreshStorageUsage(options),
    applyStorageUsage: (usage) => this.panelDataLoad.applyStorageUsage(usage),
    invalidateStorageUsageRequests: () => this.panelDataLoad.invalidateStorageUsageRequests(),
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
    loadGrabSettings: () => this.panelDataLoad.loadGrabSettings(),
    scheduleFiniteCaptureErrorReset: (updatedAt, mode, durationMs) => this.scheduleFiniteCaptureErrorReset(updatedAt, mode, durationMs),
    saveFieldState: () => this.fieldStateSync.save(),
    setExtensionProjectedPageUrl: (pageUrl) => this.fieldStateSync.setExtensionProjectedPageUrl(pageUrl),
    refreshBufferedNavPreloads: () => this.bufferedNav.refreshPreloads(),
    primeBufferedNav: () => this.bufferedNav.prime(),
    refreshBlobKeyStatus: () => this.recallExport.refreshBlobKeyStatus(),
    saveUrlReviewStatus: (status, sourceUrl, fieldIds, reason) =>
      this.urlReviewStatus.saveUrlReviewStatus(status, sourceUrl, fieldIds, reason),
    currentKnownImageFingerprint: () => this.currentKnownImageFingerprint(),
    applyFieldLoadResult: (state, attemptedFieldIds, nextFingerprint, previousFingerprint) =>
      this.applyFieldLoadResult(state, attemptedFieldIds, nextFingerprint, previousFingerprint),
    pruneInvalidFieldSplitSpecsForUrl: (state, url, options) => pruneInvalidFieldSplitSpecsForUrl(state, url, options),
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
  private readonly workspaceLayout: WorkspaceLayoutController = new WorkspaceLayoutController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    workspaceLayoutStore: () => this.workspaceLayoutStore,
    getLocalSettings: () => this.localSettings,
    saveLocalSettings: (settings) => this.panelSettings.saveLocalSettings(settings),
    detachedWindowPositions: () => this.panelRender.workspaceGeometry().detachedWindowPositions,
    detachedWindowMinimized: () => this.panelRender.workspaceGeometry().detachedWindowMinimized,
  });
  private readonly recallDrawer: RecallDrawerController = new RecallDrawerController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    renderRecallOnly: () => this.renderRecallOnly(),
    renderPanelAndRefreshRecall: () => this.renderPanelAndRefreshRecall(),
    loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
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
    loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
    loadRecentHistory: (options) => this.panelDataLoad.loadRecentHistory(options),
    currentNavigationBaseModel: () => this.currentNavigationBaseModel(),
    includedNavigationFields: (fields) => this.parsedFieldNavigation.includedNavigationFields(fields),
    localSettingsStore: () => this.localSettingsStore,
    governor: () => this.governor,
    neighborPreload: () => this.neighborPreload,
    pageAdapter: () => this.pageAdapter,
    onLocalSettingsLoaded: () => this.workspaceLayout.queueWorkspaceRestore(),
  });
  private readonly parsedFieldNavigation: ParsedFieldNavigationController = new ParsedFieldNavigationController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    loadGrabSettings: () => this.panelDataLoad.loadGrabSettings(),
    saveFieldState: () => this.fieldStateSync.save(),
    saveUrlTemplateFromCurrentFields: () => this.urlTemplateSettings.saveUrlTemplateFromCurrentFields(),
    currentNavigationBaseModel: () => this.currentNavigationBaseModel(),
    currentNavigationBaseRawUrl: () => this.currentNavigationBaseRawUrl(),
    currentKnownImageFingerprint: () => this.currentKnownImageFingerprint(),
    applyFieldLoadResult: (state, attemptedFieldIds, nextFingerprint, previousFingerprint) =>
      this.applyFieldLoadResult(state, attemptedFieldIds, nextFingerprint, previousFingerprint),
    saveUrlReviewStatus: (status, sourceUrl, fieldIds, reason) =>
      this.urlReviewStatus.saveUrlReviewStatus(status, sourceUrl, fieldIds, reason),
    isNavigableQueryField: (field) => this.isNavigableQueryField(field),
    neighborPreloadRadius: () => this.localSettings.neighborPreloadRadius,
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
    pruneInvalidFieldSplitSpecsForUrl: (state, url, options) => pruneInvalidFieldSplitSpecsForUrl(state, url, options),
    applyPanelState: (nextState, options) => this.applyPanelState(nextState, options),
    enqueueFieldInteraction: (run) => this.fieldStateSync.enqueueFieldInteraction(run),
    saveFieldState: () => this.fieldStateSync.save(),
    saveUrlTemplateFromCurrentFields: () => this.urlTemplateSettings.saveUrlTemplateFromCurrentFields(),
    applySelectedUrl: (url, attemptedFieldIds, options) => this.projectionApplication.applySelectedUrl(url, attemptedFieldIds, options),
  });
  private readonly panelRender: PanelRenderController = new PanelRenderController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    dispatch: (action) => this.dispatch(action),
    root: () => this.root,
    recallRoot: () => this.recallRoot,
    detachedRoot: () => this.detachedRoot,
    toastRoot: () => this.toastRoot,
    panelStylesReady: () => this.panelMount.panelStylesReady,
    previewScrollAnchorId: () => this.projectionApplication.previewScrollAnchorId,
    handlePanelDragStart: (event) => this.panelPosition.handlePanelDragStart(event),
    queuePanelPositionRestore: () => this.panelPosition.queuePanelPositionRestore(),
    applyRestoredPanelPosition: () => this.panelPosition.applyRestoredPanelPosition(),
    bufferedNavDebugSnapshot: () => this.bufferedNav.getDebugSnapshot(),
    refreshRecallIfOpen: () => this.recallDrawer.refreshRecallIfOpen(),
    onWorkspaceLayoutChanged: () => this.workspaceLayout.handleWorkspaceLayoutChanged(),
  });
  private readonly parsedFieldStateRecord: ParsedFieldStateRecordController = new ParsedFieldStateRecordController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    currentRawUrl: () => this.currentRawUrl(),
    applySelectedUrl: (url, attemptedFieldIds, options) => this.projectionApplication.applySelectedUrl(url, attemptedFieldIds, options),
    syncGrabSettings: () => this.urlTemplateSettings.syncGrabSettings(),
    loadGrabSettings: (options) => this.panelDataLoad.loadGrabSettings(options),
    fieldStatePageUrl: () => this.fieldStateSync.pageUrl(),
    nextFieldStateUpdatedAt: () => this.fieldStateSync.nextUpdatedAt(),
    saveFieldState: () => this.fieldStateSync.save(),
    restoreFieldState: (options) => this.fieldStateSync.restore(options),
  });
  private readonly urlReviewStatus: UrlReviewStatusController = new UrlReviewStatusController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    urlReviewStatusStore: () => this.urlReviewStatusStore,
    urlReviewStatusLimit: () => this.localSettings.urlReviewStatusLimit,
    fieldStatePageUrl: () => this.fieldStateSync.pageUrl(),
  });
  private readonly panelDataLoad: PanelDataLoadController = new PanelDataLoadController({
    getState: () => this.state,
    setState: (state) => {
      this.state = state;
    },
    render: () => this.render(),
    bookmarkStore: () => this.bookmarkStore,
    recentHistoryStore: () => this.recentHistoryStore,
    captureStore: () => this.captureStore,
    urlTemplateStore: () => this.urlTemplateStore,
    loadLocalSettings: (options) => this.panelSettings.loadLocalSettings(options),
    currentUrlTemplateHostname: () => this.urlTemplateSettings.currentUrlTemplateHostname(),
    activeTemplateIdForCurrentUrl: (templates) => this.urlTemplateSettings.activeTemplateIdForCurrentUrl(templates),
    syncGrabSettings: () => this.urlTemplateSettings.syncGrabSettings(),
    primeBufferedNav: () => this.bufferedNav.prime(),
  });

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
    private readonly workspaceLayoutStore: WorkspaceLayoutStore | null = null,
    private readonly options: ImageTrailPanelOptions = {},
  ) {
    this.panelMount.registerSubscriptions([
      this.pageAdapter.subscribe((snapshot) => {
        this.state = setTargetState(this.state, toTargetState(snapshot));
        this.render();
        void this.panelDataLoad.loadGrabSettings().then(() => this.fieldStateSync.restore());
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
    void this.panelDataLoad.loadSettingsBookmarksAndRecents();
    void this.panelDataLoad.loadGrabSettings().then(() => this.fieldStateSync.restore());
    void this.panelDataLoad.refreshStorageUsage();
    void this.recallExport.refreshBlobKeyStatus();
    void this.recallExport.refreshPCloudProviderStatus({ render: false });

    this.keyboard = new KeyboardRouter((action) => this.handleShortcutAction(action));

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

  setBuildInfoOverlayVisible(visible: boolean): void {
    this.dispatch({ name: 'settings/update-build-info-overlay-visibility', visible });
  }

  toggle(): PanelState {
    const wasVisible = this.state.visible;
    this.dispatch({ name: 'toggle-panel' });
    if (!wasVisible && this.state.visible) this.parsedFieldStateRecord.restoreParsedFieldStateForCurrentPanel();
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
    this.workspaceLayout.invalidateRestore();
    this.recallDrawer.clearRecallMessageTimer();
    this.panelRender.clearFiniteCaptureErrorTimer();
  }

  disconnect(): void {
    this.destroy();
    this.panelMount.disposeSubscriptions();
  }

  private scheduleFiniteCaptureErrorReset(updatedAt: number, mode: 'status' | 'capture-result', durationMs?: number): void {
    this.panelRender.scheduleFiniteCaptureErrorReset(updatedAt, mode, durationMs);
  }

  private renderPanelAndRefreshRecall(): void {
    this.panelRender.renderPanelAndRefreshRecall();
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
      applyBuildInfoOverlayVisibility: (visible) => this.options.applyBuildInfoOverlayVisibility?.(visible),
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
      openGallery: async () => {
        const message = await openGalleryErrorMessage();
        if (!message) return;
        this.state = galleryOpenErrorState(this.state, message);
        this.render();
      },
      loadBookmarkPage: (offset, options) => this.panelDataLoad.loadBookmarkPage(offset, options),
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
      updateWorkspaceLayoutRestore: (enabled) => this.workspaceLayout.updateWorkspaceLayoutRestore(enabled),
      resetWorkspaceLayout: () => this.workspaceLayout.resetWorkspaceLayout(),
      notifyWorkspaceLayoutChanged: () => this.workspaceLayout.handleWorkspaceLayoutChanged(),
      refreshStorageUsage: (options) => this.panelDataLoad.refreshStorageUsage(options),
      restoreParsedFieldStateForCurrentPanel: () => this.parsedFieldStateRecord.restoreParsedFieldStateForCurrentPanel(),
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
      clearUrlReviewStatus: (scope) => this.urlReviewStatus.clearUrlReviewStatus(scope),
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

  handleShortcutAction(action: string): void {
    handlePanelShortcutAction(action, {
      getState: () => this.state,
      dispatch: this.dispatch,
      slideshow: () => this.slideshow,
      toggleBufferedNavDebug: () => this.bufferedNav.toggleDebugVisible(),
    });
  }

  private currentUrlModel(): ParsedUrlModel {
    return urlModelFromRawUrl(this.currentRawUrl(), this.state);
  }

  private currentNavigationBaseModel(): ParsedUrlModel {
    return urlModelFromRawUrl(this.currentNavigationBaseRawUrl(), this.state);
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

  private render(options: { readonly includeRecall?: boolean } = {}): void {
    this.panelRender.render(options);
  }

  private renderRecallOnly(): void {
    this.panelRender.renderRecallOnly();
  }
}
