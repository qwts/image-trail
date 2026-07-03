import type { CaptureStore } from '../content/capture-controller.js';
import { requestEncryptedImageImport } from '../content/download-controller.js';
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
import type { PageAdapter, TargetSelectionSnapshot } from '../content/page-adapter.js';
import {
  createDisplayRecord,
  encryptedBlobIdForRecord,
  isDurableImageSourceUrl,
  validateImageRecordUrl,
  type ImageRecordUrlValidation,
} from '../core/display-records.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import {
  applyFieldLoadFailureToState,
  applyFieldSplitSpecToState,
  pruneInvalidFieldSplitSpecsFromState,
  reducePanelAction,
} from '../core/actions.js';
import { Retry404 } from '../core/automation/retry-404.js';
import { Slideshow } from '../core/automation/slideshow.js';
import type { BuildIdentity } from '../core/build-info.js';
import { createInitialPanelState, setAutomationState, setTargetState } from '../core/state.js';
import type {
  BookmarkStore,
  ImportedEncryptedImageFile,
  ImportedImageFile,
  PanelAction,
  PanelPosition,
  PanelPositionStore,
  PanelState,
  ParsedFieldStateRecord,
  ParsedFieldStateStore,
  TargetState,
  UrlReviewStatusClearFilter,
  UrlTemplateStore,
  UrlReviewStatus,
  UrlReviewStatusStore,
} from '../core/types.js';
import { isCapturedResult } from '../core/image/capture-result.js';
import { selectImageDownloadUrls } from '../core/image/downloads.js';
import type { ImageRequestIntent } from '../core/image/request-policy.js';
import { imageResourceUrlsEqual, pushVisibleUrlWhenSameOrigin } from '../core/image/image-navigation.js';
import {
  NEIGHBOR_PRELOAD_CACHE_LIMITS,
  NEIGHBOR_PRELOAD_RADIUS_LIMITS,
  RECENT_HISTORY_LIMITS,
  REQUEST_THROTTLE_MAX_REQUESTS_LIMITS,
  REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS,
  REQUEST_THROTTLE_WINDOW_LIMITS,
  URL_REVIEW_STATUS_LIMITS,
  VISIBLE_BOOKMARK_SOFT_MAX_LIMITS,
} from '../core/settings.js';
import { applyFieldSplitSpecs } from '../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs, fieldDigitWidthSpecsEqual } from '../core/url/field-widths.js';
import {
  applyFieldDigitWidthTransform,
  applyFieldSplitTransform,
  applySetFieldValueTransform,
  applyStepFieldValueTransform,
  clearFieldSplitTransform,
} from '../core/url/field-transforms.js';
import { parseUrl } from '../core/url/parse-url.js';
import {
  adjacentParsedFieldUrlCandidates,
  type AdjacentParsedFieldUrlCandidate,
  type NeighborPreloadDirection,
} from '../core/url/preload-neighbors.js';
import { rebuildUrl } from '../core/url/rebuild-url.js';
import { collectUrlFields } from '../core/url/tokenize-fields.js';
import { ProjectionSessionController, type ProjectionReason, type ProjectionSession } from '../core/projection-session.js';
import {
  createUrlTemplateRecord,
  findBestMatchingTemplate,
  updateGrabSourcePatternSettings,
  updateTemplateSettings,
  updateTemplateFields,
  upsertGrabSourcePattern,
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
import { fetchDecodedBufferedImageSource, probeBufferedImageSource } from '../content/buffered-image-source.js';
import { checkImageRequestPolicy } from '../content/image-request-policy.js';
import { BufferedNavigationController } from './panel/buffered-navigation-controller.js';
import { NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT, NeighborPreloadController } from './panel/neighbor-preload-controller.js';
import { ParsedFieldStateSync } from './panel/parsed-field-state-sync.js';
import { PanelMount } from './panel/panel-mount.js';
import {
  delay,
  downloadTextFile,
  downloadUrlsInSeries,
  encryptedImageExportResultMessage,
  exportEncryptedImagesInSeries,
  filenameForExportedImage,
  filenameForExportedImageRecord,
  imageDownloadResultMessage,
  isFocusablePanelControl,
} from './panel/export-download.js';
import {
  bookmarkRecordToExportEntry,
  bookmarkSaveMessage,
  historyRecordToExportEntry,
  isLockedPrivatePin,
  originalBlobIdsForFullBackup,
  pcloudBackupFileName,
  pcloudBackupUploadMessage,
  PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
  recordHasBlobId,
  selectedRecords,
  urlReviewStatusClearScopeLabel,
  withoutRecentPinState,
} from './panel/record-export-helpers.js';
import {
  bookmarkEntriesOriginalReferenceCount,
  bookmarkPayloadToDisplayRecord,
  createBookmarksRestorePreview,
  createHistoryRestorePreview,
  createRestoreDuplicateSummary,
  createUrlReviewStatusRestorePreview,
  fullBackupRestoreDetail,
  historyPayloadToDisplayRecord,
  restoreImportCompleteMessage,
  type BookmarkImportResult,
  type HistoryImportResult,
  type UrlReviewStatusImportResult,
} from './panel/restore-import-preview.js';
import {
  DEFAULT_LOCAL_SETTINGS,
  exportEncryptedBookmarks,
  exportEncryptedFullBackup,
  exportEncryptedHistory,
  exportPlainBookmarks,
  exportPlainHistory,
  exportUrlReviewStatus as exportUrlReviewStatusFile,
  importBookmarks as importBookmarkRecords,
  importEncryptedHistory,
  importUrlReviewStatus as importUrlReviewStatusFile,
  storedBlobRecordFromPortable,
  type LocalSettingsStore,
  type PlaintextLocalSettings,
  type FullBackupBlobKeyBackup,
} from '../content/panel-services.js';
import { renderPanel, renderRecallDrawer, type PanelLayoutState } from './render.js';
import { isUnsupportedUrlEditorInput } from './components/url-editor-view.js';
import { clampPanelPosition, hostnameFromLocation } from './panel-position.js';

const RECALL_DRAWER_OPEN_ANIMATION_MS = 190;
const RECALL_SUCCESS_MESSAGE_MS = 1800;
const FINITE_CAPTURE_ERROR_MS = 2400;
// Field-load (parsed-field navigation) errors are transient and should clear quickly; arrow / next
// / prev traversal mutes them entirely (see applySelectedUrl's quietFailure), while the +/- single
// step surfaces them for only about this long.
const FIELD_LOAD_ERROR_DISPLAY_MS = 1500;

interface ValidatedRecordUrl extends ImageRecordUrlValidation {
  readonly preloadDataUrl?: string;
}

interface RecordAddOptions {
  readonly trustLoadedImage?: boolean;
  readonly width?: number;
  readonly height?: number;
  readonly projectionId?: string;
}

type FieldEditorEffect =
  | { readonly kind: 'noop' }
  | { readonly kind: 'state'; readonly state: PanelState; readonly saveParsedFieldState?: boolean; readonly render?: boolean }
  | {
      readonly kind: 'project';
      readonly state?: PanelState;
      readonly url: string;
      readonly attemptedFieldIds: readonly string[];
      readonly saveTemplateOnLoad: 'always' | 'when-unlocked';
    };

const PARSED_NAVIGATION_RETRY_MIN_DELAY_MS = 25;

// Hard cap on how many neighbor candidates a single navigation drain will probe past (skipping
// failed/unavailable URLs) before giving up. Bounds the "skip to next good image" auto-advance so a
// run of bad URLs can never hammer the network indefinitely, regardless of how the navigation base
// moves between steps.
const MAX_PARSED_NAVIGATION_SKIP_ATTEMPTS = 50;

type QueuedParsedNavigationStepResult = 'blocked' | 'loaded' | 'retry' | 'wait';

type PendingRestoreImport =
  | { readonly kind: 'history'; readonly result: HistoryImportResult; readonly duplicateCount: number }
  | {
      readonly kind: 'bookmarks';
      readonly result: BookmarkImportResult;
      readonly duplicateCount: number;
      readonly password: string;
    }
  | { readonly kind: 'url-review-status'; readonly result: UrlReviewStatusImportResult };

function parseDimensionText(value: string | null): { readonly width?: number; readonly height?: number } {
  const match = value?.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/iu);
  if (!match) return {};
  return { width: Number(match[1]), height: Number(match[2]) };
}

function addItems(items: readonly string[], nextItems: readonly string[]): readonly string[] {
  return [...items, ...nextItems.filter((item) => !items.includes(item))];
}

function removeItems(items: readonly string[], removedItems: readonly string[]): readonly string[] {
  if (removedItems.length === 0) return items;
  const removed = new Set(removedItems);
  return items.filter((item) => !removed.has(item));
}

export function urlReviewStatusForLoadResult(nextFingerprint: string | null, previousFingerprint: string | null): UrlReviewStatus | null {
  if (!nextFingerprint || !previousFingerprint) return null;
  return nextFingerprint === previousFingerprint ? 'unchanged' : 'passed';
}

function toTargetState(snapshot: TargetSelectionSnapshot): TargetState {
  const selectedUrl = snapshot.selected?.url ?? null;
  return {
    mode: snapshot.mode,
    picking: snapshot.picking,
    grabModeActive: snapshot.grabModeActive,
    candidateCount: snapshot.candidateCount,
    selectedUrl: selectedUrl?.startsWith('data:') ? 'data:' : selectedUrl,
    selectedHandleId: snapshot.selected?.handleId ?? null,
    selectedDimensions: snapshot.selected ? `${snapshot.selected.width}×${snapshot.selected.height}` : null,
    fillScreen: snapshot.fillScreen,
    objectFit: snapshot.objectFit,
    message: snapshot.message,
  };
}

export { nextParsedFieldStatePageKey, shouldRestoreParsedFieldState } from './panel/parsed-field-state-sync.js';

export function projectionSessionOwnsSelectedTarget(session: ProjectionSession, selectedHandleId: string | null): boolean {
  return session.selectedHandleId === selectedHandleId;
}

export class ImageTrailPanel {
  private readonly panelMount = new PanelMount({
    isPanelVisible: () => this.state.visible,
    isPanelMinimized: () => this.state.minimized,
    onStylesReady: () => {
      this.queuePanelPositionRestore();
      this.applyRestoredPanelPosition();
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
  private previewScrollAnchorId: string | null = null;
  private storageUsageRequestId = 0;
  private bookmarkMutationQueue: Promise<void> = Promise.resolve();
  private panelPositionRestored = false;
  private panelPositionRestorePromise: Promise<void> | null = null;
  private panelPositionRestoreAttempt = 0;
  private restoredPanelPosition: PanelPosition | null = null;
  private get panelStylesReady(): boolean {
    return this.panelMount.panelStylesReady;
  }
  private recallOpeningUntil = 0;
  private recallMessageClearTimer: number | null = null;
  private finiteCaptureErrorTimer: number | null = null;
  private pendingRestoreImport: PendingRestoreImport | null = null;
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
    includedNavigationFields: (fields) => this.includedNavigationFields(fields),
    currentKnownImageFingerprint: () => this.currentKnownImageFingerprint(),
    hasSelectedTarget: () => Boolean(this.pageAdapter.getSnapshot().selected?.url),
    currentPageHref: () => window.location.href,
    applyLandedUrl: (nextUrl, displayUrl, sha256, attemptedFieldIds) =>
      this.applyBufferedNavigationUrl(nextUrl, displayUrl, sha256, attemptedFieldIds),
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
  private bufferedNavigationToastTimer: number | null = null;
  private queuedParsedNavigationDelta = 0;
  private parsedNavigationQueueRunning = false;
  // URLs skipped (failed to load) during the CURRENT navigation drain session. Scoped to the drain,
  // not to the navigation base — the base can advance to a just-failed URL between steps (e.g. the
  // manual "next" button with no stable selected target sets draftUrl to the failed URL), so a
  // base-keyed guard would reset every step and never bound the walk. Combined with
  // MAX_PARSED_NAVIGATION_SKIP_ATTEMPTS this guarantees a run of bad URLs terminates instead of
  // hammering the network forever, while still letting navigation skip forward to the next good image.
  private readonly navigationSessionSkippedUrls = new Set<string>();
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
        void this.addRecentHistory(target.url, target.thumbnail, {
          trustLoadedImage: target.trustedLoadedImage,
          width: target.width,
          height: target.height,
          projectionId: target.projectionId,
        });
      }),
      this.pageAdapter.subscribeToBookmarkRequests((target) => {
        this.enqueueBookmarkMutation(async () => {
          const options = { trustLoadedImage: target.trustedLoadedImage, width: target.width, height: target.height };
          const bookmarked = await this.bookmarkUrl(target.url, target.thumbnail, options);
          if (bookmarked) {
            await this.addRecentHistory(target.url, target.thumbnail, options);
          }
        });
      }),
      this.pageAdapter.subscribeToGrabSourcePatternRequests((url) => {
        void this.learnGrabSourcePattern(url);
      }),
    ]);
    void this.loadSettingsBookmarksAndRecents();
    void this.loadGrabSettings().then(() => this.fieldStateSync.restore());
    void this.refreshStorageUsage();
    void this.refreshBlobKeyStatus();
    void this.refreshPCloudProviderStatus({ render: false });

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
    this.panelPositionRestoreAttempt += 1;
    this.panelPositionRestored = false;
    this.panelPositionRestorePromise = null;
    this.restoredPanelPosition = null;
    this.clearRecallMessageTimer();
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
    await this.loadLocalSettings({ render: false });
    await Promise.all([this.loadBookmarks({ render: false }), this.loadRecentHistory({ render: false })]);
    this.render();
  };

  private async loadLocalSettings(options: { readonly render?: boolean } = {}): Promise<void> {
    this.localSettings = this.localSettingsStore ? await this.localSettingsStore.load() : DEFAULT_LOCAL_SETTINGS;
    const history = this.state.history.slice(0, this.localSettings.recentHistoryLimit);
    this.state = {
      ...this.state,
      history,
      selectedHistoryIds: this.state.selectedHistoryIds.filter((id) => history.some((item) => item.id === id)),
      bookmarkVisibilityScope: this.localSettings.bookmarkVisibilityScope,
      bookmarkLimit: this.localSettings.visibleBookmarkSoftMax,
      recentHistoryLimit: this.localSettings.recentHistoryLimit,
      recentHistoryOverflowBehavior: this.localSettings.recentHistoryOverflowBehavior,
      pinSaveStoragePreference: this.localSettings.pinSaveStoragePreference,
      privacyModeEnabled: this.localSettings.privacyModeEnabled,
      urlReviewStatusLimit: this.localSettings.urlReviewStatusLimit,
      clearUrlReviewStatusAfterExport: this.localSettings.clearUrlReviewStatusAfterExport,
      requestThrottleMs: this.localSettings.requestThrottleMs,
      requestThrottleMaxRequests: this.localSettings.requestThrottleMaxRequests,
      requestThrottleWindowMs: this.localSettings.requestThrottleWindowMs,
      neighborPreloadEnabled: this.localSettings.neighborPreloadEnabled,
      neighborPreloadRadius: this.localSettings.neighborPreloadRadius,
      neighborPreloadCacheLimit: this.localSettings.neighborPreloadCacheLimit,
      neighborPreloadProbeMethod: this.localSettings.neighborPreloadProbeMethod,
      secondaryControlsOpen: this.localSettings.secondaryControlsOpen,
      lastUpdatedAt: Date.now(),
    };
    this.governor.updateConfig({
      minimumIntervalMs: this.localSettings.requestThrottleMs,
      maxRequests: this.localSettings.requestThrottleMaxRequests,
      windowMs: this.localSettings.requestThrottleWindowMs,
    });
    const snapshot = this.pageAdapter.setPreviewPreferences({
      fillScreen: this.localSettings.previewFillScreen,
      objectFit: this.localSettings.previewObjectFit,
    });
    this.state = setTargetState(this.state, toTargetState(snapshot));
    if (options.render !== false) this.render();
  }

  private saveLocalSettings(settings: PlaintextLocalSettings): void {
    void this.saveLocalSettingsAsync(settings);
  }

  private async saveLocalSettingsAsync(settings: PlaintextLocalSettings): Promise<void> {
    this.localSettings = settings;
    await this.localSettingsStore?.save(settings);
  }

  private async loadGrabSettings(options: { readonly render?: boolean } = {}): Promise<void> {
    if (!this.urlTemplateStore) return;
    const hostname = this.currentUrlTemplateHostname();
    if (!hostname) return;
    const [templates, grabSourcePatterns] = await Promise.all([
      this.urlTemplateStore.load(hostname),
      this.urlTemplateStore.loadGrabSourcePatterns(hostname),
    ]);
    this.state = reducePanelAction(this.state, {
      name: 'url-templates/load',
      templates,
      activeTemplateId: this.activeTemplateIdForCurrentUrl(templates),
    });
    this.state = reducePanelAction(this.state, {
      name: 'grab-source-patterns/load',
      patterns: grabSourcePatterns,
    });
    this.syncGrabSettings();
    this.bufferedNav.prime();
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
    const existing = findBestMatchingTemplate(this.state.urlTemplates, model, { includeDisabled: true }) ?? undefined;
    if (this.state.unlockedFieldIds.length === 0) {
      if (existing) {
        await this.urlTemplateStore.remove(existing.hostname, existing.id);
        await this.loadGrabSettings({ render: false });
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
    await this.loadGrabSettings({ render: false });
    if (this.state.settingsOpen) this.render();
  }

  private async removeUrlTemplate(id: string): Promise<void> {
    if (!this.urlTemplateStore) return;
    const hostname = this.state.urlTemplates.find((candidate) => candidate.id === id)?.hostname ?? this.currentUrlTemplateHostname();
    if (!hostname) return;
    await this.urlTemplateStore.remove(hostname, id);
    this.state = reducePanelAction(this.state, { name: 'url-template/remove', id });
    this.syncGrabSettings();
    this.render();
  }

  private async updateUrlTemplateSettings(
    id: string,
    changes: Extract<PanelAction, { readonly name: 'url-template/update-settings' }>,
  ): Promise<void> {
    const template = this.state.urlTemplates.find((candidate) => candidate.id === id);
    if (!template || !this.urlTemplateStore) return;
    const updated = updateTemplateSettings(template, {
      matchMode: changes.matchMode,
      hideExcludedFields: changes.hideExcludedFields,
      autoApplyEnabled: changes.autoApplyEnabled,
      grabStrategy: changes.grabStrategy,
    });
    await this.urlTemplateStore.save(updated);
    this.state = reducePanelAction(this.state, changes);
    this.syncGrabSettings();
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
      this.syncGrabSettings();
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
    this.syncGrabSettings();
    this.render();
  }

  private async learnGrabSourcePattern(url: string): Promise<void> {
    if (!this.urlTemplateStore) return;
    let model: ParsedUrlModel;
    try {
      model = parseUrl(url);
    } catch {
      this.state = { ...this.state, status: 'error', message: 'Grab source link is not a valid URL.', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }

    const updated = upsertGrabSourcePattern(this.state.grabSourcePatterns, { model });
    await this.urlTemplateStore.saveGrabSourcePattern(updated);
    this.state = {
      ...this.state,
      grabSourcePatterns: [updated, ...this.state.grabSourcePatterns.filter((pattern) => pattern.id !== updated.id)],
      message: `Learned grab pattern for ${new URL(url).hostname}.`,
      status: 'ready',
      lastUpdatedAt: Date.now(),
    };
    this.syncGrabSettings();
    this.render();
  }

  private async updateGrabSourcePattern(
    id: string,
    changes: Extract<PanelAction, { readonly name: 'grab-source-pattern/update-settings' }>,
  ): Promise<void> {
    const pattern = this.state.grabSourcePatterns.find((candidate) => candidate.id === id);
    if (!pattern || !this.urlTemplateStore) return;
    const updated = updateGrabSourcePatternSettings(pattern, {
      matchMode: changes.matchMode,
      grabStrategy: changes.grabStrategy,
    });
    await this.urlTemplateStore.saveGrabSourcePattern(updated);
    this.state = reducePanelAction(this.state, changes);
    this.syncGrabSettings();
    this.render();
  }

  private async removeGrabSourcePattern(id: string): Promise<void> {
    const pattern = this.state.grabSourcePatterns.find((candidate) => candidate.id === id);
    if (!pattern || !this.urlTemplateStore) return;
    await this.urlTemplateStore.removeGrabSourcePattern(pattern.hostname, id);
    this.state = reducePanelAction(this.state, { name: 'grab-source-pattern/remove', id });
    this.syncGrabSettings();
    this.render();
  }

  private syncGrabSettings(): void {
    this.pageAdapter.setUrlTemplates(this.state.urlTemplates, this.state.activeUrlTemplateId);
    this.pageAdapter.setGrabSourcePatterns(this.state.grabSourcePatterns);
  }

  private activeTemplateIdForCurrentUrl(templates: readonly UrlTemplateRecord[]): string | null {
    try {
      return findBestMatchingTemplate(templates, this.currentUrlModel(), { includeDisabled: true })?.id ?? null;
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
      const projected = await this.applySelectedUrl(record.sourceUrl, [], { reason: 'parsed-field-restore' });
      if (!projected && !imageResourceUrlsEqual(record.sourceUrl, this.currentRawUrl(), window.location.href)) return;
    }
    this.state = reducePanelAction(this.state, {
      name: 'parsed-field-state/restore',
      record: this.filterParsedFieldStateForCurrentUrl(record),
    });
    this.syncGrabSettings();
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

  private async updateRecentHistoryRetention(input: {
    readonly limit: number;
    readonly overflowBehavior: PlaintextLocalSettings['recentHistoryOverflowBehavior'];
  }): Promise<void> {
    if (
      !Number.isInteger(input.limit) ||
      input.limit < RECENT_HISTORY_LIMITS.min ||
      input.limit > RECENT_HISTORY_LIMITS.max ||
      (input.limit === this.state.recentHistoryLimit && input.overflowBehavior === this.state.recentHistoryOverflowBehavior)
    ) {
      return;
    }
    const previousLimit = this.state.recentHistoryLimit;
    this.state = reducePanelAction(this.state, {
      name: 'settings/update-recent-history-retention',
      limit: input.limit,
      overflowBehavior: input.overflowBehavior,
    });
    await this.saveLocalSettingsAsync({
      ...this.localSettings,
      recentHistoryLimit: input.limit,
      recentHistoryOverflowBehavior: input.overflowBehavior,
    });
    if (input.limit > previousLimit && input.overflowBehavior === 'keep-session') {
      await this.loadRecentHistory();
      return;
    }
    this.render();
  }

  private updatePinSaveStoragePreference(value: PlaintextLocalSettings['pinSaveStoragePreference']): void {
    if (value === this.state.pinSaveStoragePreference) return;
    this.state = reducePanelAction(this.state, { name: 'settings/update-pin-save-storage-preference', value });
    this.saveLocalSettings({ ...this.localSettings, pinSaveStoragePreference: value });
    this.render();
  }

  private async updateUrlReviewStatusRetention(limit: number, clearAfterExport: boolean): Promise<void> {
    if (
      !Number.isInteger(limit) ||
      limit < URL_REVIEW_STATUS_LIMITS.min ||
      limit > URL_REVIEW_STATUS_LIMITS.max ||
      (limit === this.state.urlReviewStatusLimit && clearAfterExport === this.state.clearUrlReviewStatusAfterExport)
    ) {
      return;
    }
    this.state = reducePanelAction(this.state, {
      name: 'settings/update-url-review-status-retention',
      limit,
      clearAfterExport,
    });
    await this.saveLocalSettingsAsync({
      ...this.localSettings,
      urlReviewStatusLimit: limit,
      clearUrlReviewStatusAfterExport: clearAfterExport,
    });
    this.render();
  }

  private updateRequestThrottle(minimumIntervalMs: number, maxRequests: number, windowMs: number): void {
    if (
      !Number.isInteger(minimumIntervalMs) ||
      minimumIntervalMs < REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.min ||
      minimumIntervalMs > REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.max ||
      !Number.isInteger(maxRequests) ||
      maxRequests < REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.min ||
      maxRequests > REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.max ||
      !Number.isInteger(windowMs) ||
      windowMs < REQUEST_THROTTLE_WINDOW_LIMITS.min ||
      windowMs > REQUEST_THROTTLE_WINDOW_LIMITS.max ||
      (minimumIntervalMs === this.state.requestThrottleMs &&
        maxRequests === this.state.requestThrottleMaxRequests &&
        windowMs === this.state.requestThrottleWindowMs)
    ) {
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'settings/update-request-throttle', minimumIntervalMs, maxRequests, windowMs });
    this.governor.updateConfig({ minimumIntervalMs, maxRequests, windowMs });
    this.saveLocalSettings({
      ...this.localSettings,
      requestThrottleMs: minimumIntervalMs,
      requestThrottleMaxRequests: maxRequests,
      requestThrottleWindowMs: windowMs,
    });
    this.render();
  }

  private updateNeighborPreload(
    enabled: boolean,
    radius: number,
    cacheLimit: number,
    probeMethod = this.localSettings.neighborPreloadProbeMethod,
  ): void {
    if (
      !Number.isInteger(radius) ||
      radius < NEIGHBOR_PRELOAD_RADIUS_LIMITS.min ||
      radius > NEIGHBOR_PRELOAD_RADIUS_LIMITS.max ||
      !Number.isInteger(cacheLimit) ||
      cacheLimit < NEIGHBOR_PRELOAD_CACHE_LIMITS.min ||
      cacheLimit > NEIGHBOR_PRELOAD_CACHE_LIMITS.max ||
      (enabled === this.state.neighborPreloadEnabled &&
        radius === this.state.neighborPreloadRadius &&
        cacheLimit === this.state.neighborPreloadCacheLimit &&
        probeMethod === this.state.neighborPreloadProbeMethod)
    ) {
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'settings/update-neighbor-preload', enabled, radius, cacheLimit, probeMethod });
    this.saveLocalSettings({
      ...this.localSettings,
      neighborPreloadEnabled: enabled,
      neighborPreloadRadius: radius,
      neighborPreloadCacheLimit: cacheLimit,
      neighborPreloadProbeMethod: probeMethod,
    });
    if (!enabled || radius === 0) {
      this.neighborPreload.invalidate();
    }
    this.neighborPreload.pruneCache();
    this.render();
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

    if (action.name === 'grab-mode/start') {
      this.state = reducePanelAction(this.state, action);
      this.state = setTargetState(this.state, toTargetState(this.pageAdapter.startGrabMode()));
      this.render();
      return;
    }

    if (action.name === 'grab-mode/stop') {
      this.state = reducePanelAction(this.state, action);
      this.state = setTargetState(this.state, toTargetState(this.pageAdapter.stopGrabMode()));
      this.render();
      return;
    }

    if (action.name === 'target/release') {
      const snapshot = this.pageAdapter.releaseSelectedTarget();
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.render();
      return;
    }

    if (action.name === 'target/fill-screen') {
      const snapshot = this.pageAdapter.setSelectedFillScreen(action.enabled);
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.saveLocalSettings({ ...this.localSettings, previewFillScreen: snapshot.fillScreen });
      this.render();
      return;
    }

    if (action.name === 'target/set-object-fit') {
      const snapshot = this.pageAdapter.setSelectedObjectFit(action.mode);
      this.state = setTargetState(this.state, toTargetState(snapshot));
      this.saveLocalSettings({ ...this.localSettings, previewObjectFit: snapshot.objectFit });
      this.render();
      return;
    }

    if (action.name === 'panel/secondary-controls-open') {
      if (this.state.secondaryControlsOpen === action.open) return;
      this.state = reducePanelAction(this.state, action);
      this.saveLocalSettings({ ...this.localSettings, secondaryControlsOpen: action.open });
      this.render();
      return;
    }

    if (action.name === 'pin/current' || action.name === 'bookmark/current') {
      void this.bookmarkCurrentImage();
      return;
    }

    if (action.name === 'history/remove') {
      void this.removeRecentHistory(action.id);
      return;
    }

    if (action.name === 'history/delete-all') {
      void this.deleteRecentHistory();
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

    if (action.name === 'settings/update-recent-history-retention') {
      void this.updateRecentHistoryRetention({ limit: action.limit, overflowBehavior: action.overflowBehavior });
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

    if (action.name === 'settings/update-url-review-status-retention') {
      void this.updateUrlReviewStatusRetention(action.limit, action.clearAfterExport);
      return;
    }

    if (action.name === 'settings/update-request-throttle') {
      this.updateRequestThrottle(action.minimumIntervalMs, action.maxRequests, action.windowMs);
      return;
    }

    if (action.name === 'settings/update-neighbor-preload') {
      this.updateNeighborPreload(action.enabled, action.radius, action.cacheLimit, action.probeMethod);
      return;
    }

    if (action.name === 'neighbor-preload/manual') {
      this.preloadMoreNeighbors(action.radius, action.cacheLimit);
      return;
    }

    if (action.name === 'settings/reset-panel-position') {
      void this.resetPanelPosition();
      return;
    }

    if (action.name === 'settings/toggle') {
      this.state = reducePanelAction(this.state, action);
      this.render();
      if (this.state.settingsOpen) void this.refreshStorageUsage({ render: true });
      return;
    }

    if (action.name === 'panel/minimize' || action.name === 'panel/expand') {
      if (action.name === 'panel/minimize') void this.fieldStateSync.save();
      this.state = reducePanelAction(this.state, action);
      this.panelMount.mount();
      this.keyboard.enable();
      this.pageAdapter.enableBookmarkShortcut();
      this.render();
      if (action.name === 'panel/expand') this.restoreParsedFieldStateForCurrentPanel();
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

    if (action.name === 'grab-source-pattern/update-settings') {
      void this.updateGrabSourcePattern(action.id, action);
      return;
    }

    if (action.name === 'grab-source-pattern/remove') {
      void this.removeGrabSourcePattern(action.id);
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
      action.name === 'selection/select-visible' ||
      action.name === 'history-selection/toggle' ||
      action.name === 'history-selection/select' ||
      action.name === 'history-selection/clear' ||
      action.name === 'bookmark-selection/toggle' ||
      action.name === 'bookmark-selection/single' ||
      action.name === 'bookmark-selection/select' ||
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

    if (
      action.name === 'recall-selection/toggle' ||
      action.name === 'recall-selection/select' ||
      action.name === 'recall-selection/clear' ||
      action.name === 'recall/clear-results'
    ) {
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

    if (action.name === 'field/transform') {
      this.enqueueFieldTransform(action);
      return;
    }

    if (action.name === 'active-field/set') {
      this.applyPanelState(reducePanelAction(this.state, action), { saveParsedFieldState: true, render: true });
      return;
    }

    if (action.name === 'field-unlock/toggle') {
      const updated = this.applyPanelState(reducePanelAction(this.state, action), { saveParsedFieldState: true });
      if (!updated) return;
      void this.saveUrlTemplateFromCurrentFields().then(() => {
        this.bufferedNav.prime();
        this.render();
      });
      return;
    }

    if (action.name === 'selected-url/apply') {
      this.enqueueSelectedUrlApply(action.url);
      return;
    }

    if (action.name === 'selected-url/reject-unsupported-input') {
      this.rejectUrlEditorInput();
      return;
    }

    if (action.name === 'history/pin') {
      void this.pinRecentHistory(action.id);
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

    if (action.name === 'cloud-backup/connect' || action.name === 'cloud-backup/retry') {
      void this.connectPCloudBackup();
      return;
    }

    if (action.name === 'cloud-backup/disconnect') {
      void this.disconnectPCloudBackup();
      return;
    }

    if (action.name === 'cloud-backup/backup-now') {
      void this.backupPCloudNow(action.password);
      return;
    }

    if (action.name === 'cloud-backup/choose-restore') {
      void this.choosePCloudRestoreFile();
      return;
    }

    if (action.name === 'cloud-backup/preview-restore') {
      void this.previewPCloudRestoreFile(action.fileId, action.fileName, action.password);
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

    if (action.name === 'export/url-review-status') {
      void this.exportUrlReviewStatus();
      return;
    }

    if (action.name === 'clear/url-review-status') {
      void this.clearUrlReviewStatus(action.scope ?? 'hostname');
      return;
    }

    if (action.name === 'import/history') {
      void this.previewHistoryImport(action.fileContent, action.password, action.fileName);
      return;
    }

    if (action.name === 'import/bookmarks') {
      void this.previewBookmarksImport(action.fileContent, action.password, action.fileName);
      return;
    }

    if (action.name === 'import/url-review-status') {
      this.previewUrlReviewStatusImport(action.fileContent, action.fileName);
      return;
    }

    if (action.name === 'import/confirm-restore-preview') {
      void this.confirmRestorePreview();
      return;
    }

    if (action.name === 'import/cancel-restore-preview') {
      this.cancelRestorePreview();
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
      void this.fieldStateSync.save();
      this.slideshow.destroy();
      this.retry.destroy();
      this.keyboard.disable();
      this.cleanupMountedElements();
      return;
    }
    this.pageAdapter.prepareStandaloneImageBackdrop();
    this.panelMount.mount();
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

  private currentUrlModelWithoutDigitWidthSpecs(): ParsedUrlModel {
    return applyFieldSplitSpecs(parseUrl(this.currentRawUrl()), this.state.fieldSplitSpecs);
  }

  private currentNavigationBaseModel(): ParsedUrlModel {
    return this.urlModelFromRawUrl(this.currentNavigationBaseRawUrl());
  }

  private urlModelFromRawUrl(url: string): ParsedUrlModel {
    return this.applyCurrentFieldDigitWidthSpecs(applyFieldSplitSpecs(parseUrl(url), this.state.fieldSplitSpecs));
  }

  private pruneInvalidFieldSplitSpecsForCurrentUrl(): boolean {
    const nextState = this.pruneInvalidFieldSplitSpecsForUrl(this.state, this.currentRawUrl());
    if (nextState === this.state) return false;
    this.state = nextState;
    void this.fieldStateSync.save();
    return true;
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

  private enqueueFieldTransform(action: Extract<PanelAction, { readonly name: 'field/transform' }>): void {
    this.enqueueFieldInteraction(() => this.applyFieldTransform(action));
  }

  private enqueueSelectedUrlApply(url: string): void {
    this.enqueueFieldInteraction(() => this.applyUrlEditorUrl(url));
  }

  private enqueueFieldInteraction(run: () => Promise<void>): void {
    this.fieldStateSync.enqueueFieldInteraction(run);
  }

  private async applyUrlEditorUrl(url: string): Promise<void> {
    if (isUnsupportedUrlEditorInput(url)) {
      this.rejectUrlEditorInput();
      return;
    }

    await this.applySelectedUrl(url, [], { pushVisibleUrl: true, resetFieldState: url !== this.currentRawUrl() });
  }

  private rejectUrlEditorInput(): void {
    this.state = {
      ...this.state,
      status: 'error',
      message: 'URL editor cannot use data URLs. Paste an http or https image URL.',
      lastUpdatedAt: Date.now(),
    };
    this.scheduleFiniteCaptureErrorReset(this.state.lastUpdatedAt, 'status');
    this.render();
  }

  private async applyFieldTransform(action: Extract<PanelAction, { readonly name: 'field/transform' }>): Promise<void> {
    const prunedInvalidSplitSpecs = action.transformId !== 'split-clear' && this.pruneInvalidFieldSplitSpecsForCurrentUrl();
    const effect = this.fieldEditorEffect(action);
    if (effect.kind === 'noop') {
      if (prunedInvalidSplitSpecs) this.render();
      return;
    }
    await this.runFieldEditorEffect(effect);
  }

  private fieldEditorEffect(action: Extract<PanelAction, { readonly name: 'field/transform' }>): FieldEditorEffect {
    if (action.transformId === 'digit-width') {
      const baseModel = this.currentUrlModelWithoutDigitWidthSpecs();
      if (!collectUrlFields(baseModel).some((field) => field.id === action.fieldId)) {
        return { kind: 'noop' };
      }
      const transform = applyFieldDigitWidthTransform(baseModel, action.fieldId, action.value, this.state.fieldDigitWidthSpecs);
      if (!transform.ok) {
        return { kind: 'state', state: { ...this.state, status: 'error', message: transform.message, lastUpdatedAt: Date.now() } };
      }

      const fieldDigitWidthSpecsChanged = !fieldDigitWidthSpecsEqual(transform.fieldDigitWidthSpecs, this.state.fieldDigitWidthSpecs);
      const state = {
        ...this.state,
        activeFieldId: action.fieldId,
        fieldDigitWidthSpecs: transform.fieldDigitWidthSpecs,
        lastUpdatedAt: Date.now(),
      };

      if (transform.url === this.currentRawUrl()) {
        return this.state.activeFieldId === action.fieldId && !fieldDigitWidthSpecsChanged ? { kind: 'noop' } : { kind: 'state', state };
      }

      return {
        kind: 'project',
        state,
        url: transform.url,
        attemptedFieldIds: transform.attemptedFieldIds,
        saveTemplateOnLoad: 'when-unlocked',
      };
    }

    if (action.transformId === 'split-clear') {
      const transform = clearFieldSplitTransform(action.fieldId);
      if (!transform.ok) return { kind: 'noop' };
      return { kind: 'state', state: reducePanelAction(this.state, action) };
    }

    let model: ParsedUrlModel;
    try {
      model = this.currentUrlModel();
    } catch {
      if (action.transformId !== 'split-apply') return { kind: 'noop' };
      return {
        kind: 'state',
        state: {
          ...this.state,
          status: 'error',
          message: 'Current URL could not be parsed for splitting.',
          lastUpdatedAt: Date.now(),
        },
      };
    }

    const field = collectUrlFields(model).find((item) => item.id === action.fieldId);
    if (!field) return { kind: 'noop' };

    if (action.transformId === 'split-apply') {
      const transform = applyFieldSplitTransform(field, action.pattern);
      if (!transform.ok) {
        return { kind: 'state', state: { ...this.state, status: 'error', message: transform.message, lastUpdatedAt: Date.now() } };
      }

      return { kind: 'state', state: applyFieldSplitSpecToState(this.state, transform.splitSpec) };
    }

    const transform =
      action.transformId === 'set-value'
        ? applySetFieldValueTransform(model, field, action.value)
        : applyStepFieldValueTransform(model, field, action.delta);

    const state =
      action.transformId === 'step' ? reducePanelAction(this.state, { name: 'active-field/set', id: action.fieldId }) : this.state;

    if (transform.url === this.currentRawUrl()) {
      return state === this.state ? { kind: 'noop' } : { kind: 'state', state };
    }

    return {
      kind: 'project',
      state,
      url: transform.url,
      attemptedFieldIds: transform.attemptedFieldIds,
      saveTemplateOnLoad: action.transformId === 'step' ? 'always' : 'when-unlocked',
    };
  }

  private async runFieldEditorEffect(effect: FieldEditorEffect): Promise<boolean> {
    if (effect.kind === 'noop') return false;
    if (effect.kind === 'state') {
      return this.applyPanelState(effect.state, {
        saveParsedFieldState: effect.saveParsedFieldState ?? true,
        render: effect.render ?? true,
      });
    }
    if (effect.state) this.applyPanelState(effect.state);
    const loaded = await this.applySelectedUrl(effect.url, effect.attemptedFieldIds);
    if (loaded && (effect.saveTemplateOnLoad === 'always' || this.state.unlockedFieldIds.length > 0)) {
      await this.saveUrlTemplateFromCurrentFields();
    }
    return loaded;
  }

  private navigateBy(delta: 1 | -1): void {
    this.queuedParsedNavigationDelta += delta;
    void this.drainQueuedParsedNavigation();
  }

  private async drainQueuedParsedNavigation(): Promise<void> {
    if (this.parsedNavigationQueueRunning) return;
    this.parsedNavigationQueueRunning = true;
    this.navigationSessionSkippedUrls.clear();
    try {
      while (this.queuedParsedNavigationDelta !== 0) {
        const delta = this.queuedParsedNavigationDelta > 0 ? 1 : -1;
        const result = await this.runQueuedParsedNavigationStep(delta);
        if (result === 'blocked') {
          this.queuedParsedNavigationDelta = 0;
          break;
        }
        if (result === 'wait') {
          const delayMs = Math.max(PARSED_NAVIGATION_RETRY_MIN_DELAY_MS, this.governor.nextReadyDelayMs());
          await delay(delayMs);
          continue;
        }
        if (result === 'retry') {
          await delay(PARSED_NAVIGATION_RETRY_MIN_DELAY_MS);
          continue;
        }
        if (result === 'loaded') this.queuedParsedNavigationDelta -= delta;
      }
    } finally {
      this.parsedNavigationQueueRunning = false;
      if (this.queuedParsedNavigationDelta !== 0) void this.drainQueuedParsedNavigation();
    }
  }

  private async runQueuedParsedNavigationStep(delta: 1 | -1): Promise<QueuedParsedNavigationStepResult> {
    const snapshot = this.pageAdapter.getSnapshot();
    if (!snapshot.selected?.url) return 'blocked';
    const model = this.currentNavigationBaseModel();
    const fields = collectUrlFields(model);
    const navigableFields = this.includedNavigationFields(fields);
    if (navigableFields.length === 0) return 'blocked';
    if (this.neighborPreload.isActive) {
      const buffered = await this.bufferedNav.step(model, navigableFields, delta);
      if (buffered === 'loaded') {
        void this.saveUrlTemplateFromCurrentFields();
        this.state = setAutomationState(this.state, {
          governorStatus: 'ready',
          requestsInWindow: this.governor.requestsInWindow(),
        });
        this.render();
        return 'loaded';
      }
      // buffered === 'blocked': the preloaded window held no landable image (failed/unknown
      // neighbors). Fall through to the candidate scan below instead of stopping — it skips URLs
      // already known to have failed (the buffered preload records them in the shared request-policy
      // cache, so no re-probe) and advances to the next good image, giving preload-on navigation the
      // same smooth skip-to-next-good behavior as the plain path.
    }
    const candidate = await this.nextParsedFieldNavigationCandidate(model, navigableFields, delta);
    if (!candidate) {
      const skipped = this.navigationSessionSkippedUrls.size;
      this.state = {
        ...this.state,
        status: 'ready',
        message:
          skipped > 0
            ? `Stopped after skipping ${skipped} unavailable image${skipped === 1 ? '' : 's'}; no loadable image found in that direction.`
            : 'No non-failed parsed-field neighbor candidate found in that direction.',
        lastUpdatedAt: Date.now(),
      };
      this.render();
      return 'blocked';
    }
    const nextUrl = candidate.url;
    const shouldStartNetworkRequest = !nextUrl.startsWith('data:image/');
    if (shouldStartNetworkRequest) {
      const request = this.governor.request(() => undefined);
      if (request.status !== 'ok') {
        this.state = setAutomationState(this.state, {
          governorStatus: request.status,
          requestsInWindow: this.governor.requestsInWindow(),
        });
        this.render();
        return 'wait';
      }
    }

    const loaded = await this.applySelectedUrl(
      nextUrl,
      navigableFields.map((field) => field.id),
      { preloadDirection: delta, quietFailure: true },
    );
    if (loaded) {
      void this.saveUrlTemplateFromCurrentFields();
      // Progress made — the next segment of this drain gets a fresh skip budget.
      this.navigationSessionSkippedUrls.clear();
    } else {
      this.navigationSessionSkippedUrls.add(nextUrl);
    }

    this.state = setAutomationState(this.state, {
      governorStatus: 'ready',
      requestsInWindow: this.governor.requestsInWindow(),
    });
    this.render();
    return loaded ? 'loaded' : 'retry';
  }

  private async nextParsedFieldNavigationCandidate(
    model: ParsedUrlModel,
    fields: readonly UrlField[],
    direction: NeighborPreloadDirection,
  ): Promise<AdjacentParsedFieldUrlCandidate | null> {
    // Give up once this drain has skipped past the cap of failed candidates, so a run of bad URLs
    // stops instead of chasing the frontier forever (the base can advance to each failed URL).
    if (this.navigationSessionSkippedUrls.size >= MAX_PARSED_NAVIGATION_SKIP_ATTEMPTS) return null;
    const candidates = adjacentParsedFieldUrlCandidates(model, fields, NEIGHBOR_PRELOAD_FILL_SCAN_LIMIT)
      .filter((candidate) => candidate.direction === direction)
      .sort((a, b) => a.distance - b.distance);
    for (const candidate of candidates) {
      if (this.navigationSessionSkippedUrls.has(candidate.url)) continue;
      const policy = await checkImageRequestPolicy(candidate.url, {
        intent: 'field-active-navigation',
        contextKey: this.parsedFieldRequestContextKey(
          fields.map((field) => field.id),
          direction,
          this.neighborPreload.runId,
        ),
      });
      if (policy.status === 'skippable-failed') continue;
      return candidate;
    }
    return null;
  }

  private async applyBufferedNavigationUrl(
    nextUrl: string,
    displayUrl: string,
    sha256: string | null,
    attemptedFieldIds: readonly string[],
  ): Promise<boolean> {
    const session = this.beginProjectionSession('parsed-field-navigation', nextUrl);
    if (!session) return false;
    const baselineFingerprint = this.currentKnownImageFingerprint();
    const reviewStatus = urlReviewStatusForLoadResult(sha256, baselineFingerprint);
    const snapshot = this.pageAdapter.getSnapshot();
    if (snapshot.selected) {
      const nextSnapshot = this.applyProjectionToSelectedImage(session, displayUrl);
      if (!nextSnapshot) return false;
      if (!this.isCurrentProjectionSession(session)) return false;
      this.state = { ...setTargetState(this.state, toTargetState(nextSnapshot)), draftUrl: null };
    }
    this.state = this.applyFieldLoadResult(this.state, attemptedFieldIds, sha256, baselineFingerprint);
    if (reviewStatus === 'passed') void this.saveUrlReviewStatus(reviewStatus, nextUrl, attemptedFieldIds);
    void this.fieldStateSync.save();
    this.render();
    void this.loadGrabSettings();
    return true;
  }

  private mostRecentSuccessfulNavigableField(fields: readonly UrlField[]): UrlField | null {
    for (let index = this.state.successfulFieldIds.length - 1; index >= 0; index -= 1) {
      const field = fields.find((candidate) => candidate.id === this.state.successfulFieldIds[index]);
      if (field && this.isNavigableQueryField(field)) return field;
    }
    return null;
  }

  private includedNavigationFields(fields: readonly UrlField[]): readonly UrlField[] {
    const includedFields = fields.filter((field) => this.isUnlockedNavigableField(field));
    if (includedFields.length === 0) return [];
    const mostRecentSuccessfulIncluded = this.mostRecentSuccessfulNavigableField(includedFields);
    return mostRecentSuccessfulIncluded ? [mostRecentSuccessfulIncluded] : includedFields;
  }

  private async applySelectedUrl(
    nextUrl: string,
    attemptedFieldIds: readonly string[] = [],
    options: {
      readonly pushVisibleUrl?: boolean;
      readonly reason?: ProjectionReason;
      readonly preloadDirection?: NeighborPreloadDirection;
      readonly resetFieldState?: boolean;
      readonly quietFailure?: boolean;
    } = {},
  ): Promise<boolean> {
    const session = this.beginProjectionSession(options.reason ?? this.applySelectedUrlReason(attemptedFieldIds), nextUrl);
    if (!session) return false;
    if (options.resetFieldState) this.state = this.resetParsedFieldInteractionState(this.state);
    const baselineFingerprint = this.currentKnownImageFingerprint();
    this.projections.update(session, { status: 'preloading' });
    const preload = await this.neighborPreload.preload(nextUrl, {
      readCache: session.reason !== 'parsed-field-navigation',
      writeCache: session.reason !== 'parsed-field-navigation',
      intent: this.imageRequestIntentForProjectionReason(session.reason),
      contextKey:
        session.reason === 'parsed-field-navigation'
          ? this.parsedFieldRequestContextKey(attemptedFieldIds, options.preloadDirection, this.neighborPreload.runId)
          : undefined,
    });
    if (!this.isCurrentProjectionSession(session)) return false;
    if (!preload.ok) {
      this.projections.update(session, { status: 'failed' });
      const failedState = this.pruneInvalidFieldSplitSpecsForUrl(
        applyFieldLoadFailureToState(this.state, { draftUrl: nextUrl, attemptedFieldIds, message: preload.message }),
        nextUrl,
        { preserveMessage: true },
      );
      // Arrow / next / prev traversal skips past bad URLs, so it mutes the alert: keep the failure in
      // field/review state (which drives the skip) but leave the previous status/message so we don't
      // flash a red error or churn the panel on every skipped image. The +/- single step still shows
      // the error, briefly.
      if (options.quietFailure) {
        this.state = { ...failedState, status: this.state.status, message: this.state.message, lastUpdatedAt: this.state.lastUpdatedAt };
      } else {
        this.state = failedState;
        this.scheduleFiniteCaptureErrorReset(this.state.lastUpdatedAt, 'status', FIELD_LOAD_ERROR_DISPLAY_MS);
        this.render();
      }
      void this.saveUrlReviewStatus('failed', nextUrl, attemptedFieldIds, preload.message);
      void this.fieldStateSync.save();
      if (session.reason === 'parsed-field-navigation') this.bufferedNav.refreshPreloads();
      return false;
    }

    const reviewStatus = urlReviewStatusForLoadResult(preload.sha256, baselineFingerprint);
    if (attemptedFieldIds.length > 0 && reviewStatus === 'unchanged') {
      this.projections.update(session, { status: 'loaded', displayUrl: preload.displayUrl });
      this.state = this.pruneInvalidFieldSplitSpecsForUrl(
        this.applyFieldLoadResult(
          { ...this.state, draftUrl: nextUrl, message: 'Image loaded but did not change.', status: 'ready', lastUpdatedAt: Date.now() },
          attemptedFieldIds,
          preload.sha256,
          baselineFingerprint,
        ),
        nextUrl,
        { preserveMessage: true },
      );
      void this.saveUrlReviewStatus('unchanged', nextUrl, attemptedFieldIds, 'Image loaded but did not change.');
      void this.fieldStateSync.save();
      this.render();
      return false;
    }

    const snapshot = this.pageAdapter.getSnapshot();
    if (snapshot.selected) {
      const nextSnapshot = this.applyProjectionToSelectedImage(session, preload.displayUrl);
      if (!nextSnapshot) return false;
      if (!this.isCurrentProjectionSession(session)) return false;
      this.state = { ...setTargetState(this.state, toTargetState(nextSnapshot)), draftUrl: null };
    }
    this.state = this.pruneInvalidFieldSplitSpecsForUrl(
      this.applyFieldLoadResult(this.state, attemptedFieldIds, preload.sha256, baselineFingerprint),
      nextUrl,
      { preserveMessage: true },
    );
    if (reviewStatus === 'passed') void this.saveUrlReviewStatus(reviewStatus, nextUrl, attemptedFieldIds);
    if (options.pushVisibleUrl && pushVisibleUrlWhenSameOrigin(nextUrl))
      this.fieldStateSync.setExtensionProjectedPageUrl(window.location.href);
    void this.fieldStateSync.save();
    this.render();
    void this.loadGrabSettings();
    if (session.reason === 'parsed-field-navigation') {
      this.bufferedNav.prime();
    }
    return true;
  }

  private applySelectedUrlReason(attemptedFieldIds: readonly string[]): ProjectionReason {
    return attemptedFieldIds.length > 0 ? 'parsed-field-navigation' : 'selected-url-apply';
  }

  private imageRequestIntentForProjectionReason(reason: ProjectionReason): ImageRequestIntent {
    switch (reason) {
      case 'parsed-field-navigation':
      case 'parsed-field-restore':
        return 'field-active-navigation';
      case 'bookmark-load':
        return 'bookmark-load';
      case 'record-preview':
        return 'recent-load';
      case 'selected-url-apply':
        return 'url-editor-apply';
    }
  }

  private parsedFieldRequestContextKey(
    attemptedFieldIds: readonly string[],
    direction: NeighborPreloadDirection | undefined,
    runId: number,
  ): string {
    return [
      'parsed-field-navigation',
      String(runId),
      this.currentNavigationBaseRawUrl(),
      attemptedFieldIds.join(','),
      this.state.fieldSplitSpecs.map((spec) => `${spec.baseFieldId}:${spec.pattern}`).join('|'),
      this.state.fieldDigitWidthSpecs.map((spec) => `${spec.fieldId}:${spec.width}:${spec.sourceWidth ?? ''}`).join('|'),
      this.state.target.selectedHandleId ?? '',
      direction === undefined ? '' : String(direction),
    ].join('\n');
  }

  private resetParsedFieldInteractionState(state: PanelState): PanelState {
    return {
      ...state,
      activeFieldId: null,
      failedFieldId: null,
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      fieldDigitWidthSpecs: [],
    };
  }

  private beginProjectionSession(reason: ProjectionReason, sourceUrl: string): ProjectionSession | null {
    const result = this.projections.beginGuarded({
      reason,
      sourceUrl,
      selectedHandleId: this.state.target.selectedHandleId,
      originalSourceUrl: this.projectedSourceUrl(),
    });
    if (result.ok) return result.session;
    console.warn('Image Trail projection loop guard blocked a repeated host image projection request.', result.warning);
    this.state = {
      ...this.state,
      status: 'error',
      message: 'Projection stopped because repeated host image requests looked like a loop.',
      lastUpdatedAt: Date.now(),
    };
    this.render();
    return null;
  }

  private isCurrentProjectionSession(session: ProjectionSession): boolean {
    return this.projections.isActive(session) && projectionSessionOwnsSelectedTarget(session, this.state.target.selectedHandleId);
  }

  private applyProjectionToSelectedImage(session: ProjectionSession, displayUrl: string): TargetSelectionSnapshot | null {
    if (!this.isCurrentProjectionSession(session)) return null;
    this.projections.update(session, { status: 'applying', displayUrl });
    const snapshot = this.pageAdapter.applyUrlToSelected(session.sourceUrl, displayUrl, {
      projectionId: session.id,
      projectionReason: session.reason,
    });
    if (!this.isCurrentProjectionSession(session)) return null;
    return snapshot;
  }

  private preloadMoreNeighbors(radius: number, cacheLimit: number): void {
    this.updateNeighborPreload(true, radius, cacheLimit);
    if (!this.neighborPreload.isActive) return;
    let model: ParsedUrlModel;
    try {
      model = this.currentNavigationBaseModel();
    } catch {
      return;
    }
    const fields = this.includedNavigationFields(collectUrlFields(model));
    if (fields.length === 0) return;
    const result = this.neighborPreload.preloadMore(model, fields);
    if (!result) {
      this.state = {
        ...this.state,
        status: 'ready',
        message: 'No additional parsed-field preload candidates found.',
        lastUpdatedAt: Date.now(),
      };
      this.render();
      return;
    }
    this.state = {
      ...this.state,
      status: 'ready',
      message: `Preloading ${result.candidateCount} more parsed-field neighbor image(s)...`,
      lastUpdatedAt: Date.now(),
    };
    this.render();
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
    void this.refreshStorageUsage({ render: true });
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
    void this.refreshStorageUsage({ render: true });
    return true;
  }

  private async addRecentHistory(url: string, thumbnail?: string, options: RecordAddOptions = {}): Promise<void> {
    if (options.projectionId && !this.projections.isActive(options.projectionId)) return;
    const validation = await this.validateRecordUrlForAdd(url, options);
    if (options.projectionId && !this.projections.isActive(options.projectionId)) return;
    if (!validation.ok || !validation.sourceUrl) return;
    const resolvedThumbnail = await this.resolveRecordThumbnail(validation.sourceUrl, thumbnail, validation, options);
    if (options.projectionId && !this.projections.isActive(options.projectionId)) return;
    const next = reducePanelAction(this.state, {
      name: 'history/add-loaded',
      url: validation.sourceUrl,
      thumbnail: resolvedThumbnail,
      width: options.width,
      height: options.height,
    }).history;
    const item = next[0];
    if (!item) return;
    if (options.projectionId && !this.projections.isActive(options.projectionId)) return;
    const history = this.recentHistoryStore ? await this.recentHistoryStore.add(item, window.location.href) : next;
    if (options.projectionId && !this.projections.isActive(options.projectionId)) return;
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
  }

  private async pinRecentHistory(id: string): Promise<void> {
    const record = this.state.history.find((item) => item.id === id);
    if (!record) return;
    const result = await this.saveRecentRecordAsBookmark(record, { render: false });
    if (!result.ok) {
      this.state = { ...this.state, message: result.message, status: 'error', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }
    await this.markRecentHistoryRowPinned(id, result.record);
    this.renderPanelAndRefreshRecall();
  }

  private async saveRecentRecordAsBookmark(
    record: ImageDisplayRecord,
    options: { readonly timestamp?: string; readonly render?: boolean } = {},
  ): Promise<{ readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string }> {
    const timestamp = options.timestamp ?? new Date().toISOString();
    const recordForBookmark = withoutRecentPinState(record);
    const draft = createDisplayRecord({
      ...recordForBookmark,
      id: record.url.startsWith('data:image/') ? record.id : record.url,
      timestamp,
      source: 'bookmark',
    });
    if (!this.bookmarkStore) {
      return { ok: false, message: 'Bookmark storage is unavailable.' };
    }
    const result = this.bookmarkStore.saveResult
      ? await this.bookmarkStore.saveResult(draft)
      : { ok: true as const, record: await this.bookmarkStore.save(draft) };
    if (!result.ok) return result;
    const bookmark = result.record;
    this.state = { ...this.state, message: bookmarkSaveMessage(bookmark, bookmark.label), lastUpdatedAt: Date.now() };
    await this.loadBookmarkPage(0, { render: false });
    if (options.render !== false) this.renderPanelAndRefreshRecall();
    void this.refreshStorageUsage({ render: options.render !== false });
    return { ok: true, record: bookmark };
  }

  private async markRecentHistoryRowPinned(id: string, bookmark: ImageDisplayRecord): Promise<void> {
    this.state = reducePanelAction(this.state, {
      name: 'history/mark-pinned',
      id,
      pinnedAt: bookmark.timestamp,
      pinnedRecordId: bookmark.id,
    });
    const updatedHistory = this.state.history.find((item) => item.id === id);
    if (!updatedHistory) return;
    const history = this.recentHistoryStore ? await this.recentHistoryStore.add(updatedHistory, window.location.href) : this.state.history;
    this.state = {
      ...this.state,
      history,
      selectedHistoryIds: this.state.selectedHistoryIds.filter((selectedId) => history.some((item) => item.id === selectedId)),
      lastUpdatedAt: Date.now(),
    };
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
    this.scheduleFiniteCaptureErrorReset(this.state.lastUpdatedAt, 'status');
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
    const blobId = existing ? encryptedBlobIdForRecord(existing) : undefined;
    const history = this.recentHistoryStore
      ? await this.recentHistoryStore.remove(id, window.location.href)
      : reducePanelAction(this.state, { name: 'history/remove', id }).history;
    this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    this.render();
    if (blobId) await this.removeCapturedBlobReference(blobId, { render: true });
  }

  private async deleteRecentHistory(): Promise<void> {
    const records = this.state.history;
    if (records.length === 0) return;
    if (this.recentHistoryStore) {
      for (const record of records) {
        await this.recentHistoryStore.remove(record.id, window.location.href);
      }
    }
    this.state = reducePanelAction(this.state, { name: 'history/delete-all' });
    this.render();
    let removedCapturedBlob = false;
    for (const record of records) {
      const blobId = encryptedBlobIdForRecord(record);
      if (blobId) {
        await this.removeCapturedBlobReference(blobId, { render: false });
        removedCapturedBlob = true;
      }
    }
    if (removedCapturedBlob) await this.refreshStorageUsage({ render: true });
  }

  private async loadBookmark(id: string): Promise<void> {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    await this.applySelectedUrl(bookmark.url, [], { reason: 'bookmark-load' });
  }

  private async removeBookmark(id: string): Promise<void> {
    const bookmark = this.state.bookmarks.find((item) => item.id === id);
    if (!bookmark) return;
    await this.bookmarkStore?.remove(bookmark);
    this.state = reducePanelAction(this.state, { name: 'bookmark/remove', id });
    await this.loadBookmarkPage(this.state.bookmarkOffset, { render: false });
    this.renderPanelAndRefreshRecall();
    void this.refreshStorageUsage({ render: true });
  }

  private async deleteVisibleBookmarks(): Promise<void> {
    if (!this.bookmarkStore || this.state.bookmarks.length === 0) return;
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await this.bookmarkStore.removeMany(this.state.bookmarks.map((bookmark) => bookmark.id));
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `Deleted ${result.removedCount} queue item${result.removedCount === 1 ? '' : 's'}.`,
    });
    this.renderPanelAndRefreshRecall();
    void this.refreshStorageUsage({ render: true });
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
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `Deleted ${result.removedCount} Recall item${result.removedCount === 1 ? '' : 's'}.`,
    });
    this.renderPanelAndRefreshRecall();
    void this.refreshStorageUsage({ render: true });
  }

  private async removeCapturedBlobReference(blobId: string, options: { readonly render?: boolean } = {}): Promise<void> {
    if (!this.captureStore) return;
    try {
      const { usage } = await this.captureStore.requestDeleteBlob(blobId);
      this.applyStorageUsage(usage);
      if (options.render) this.render();
    } catch {
      void this.refreshStorageUsage({ render: options.render });
    }
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
    this.storageUsageRequestId += 1;
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
    if (this.state.captureInProgress) return;
    const isImportedImage = url.startsWith('data:image/');
    if (!isImportedImage && !isDurableImageSourceUrl(url)) {
      const lastUpdatedAt = Date.now();
      this.state = {
        ...this.state,
        message: 'Only http(s) image URLs can be captured as encrypted originals.',
        status: 'error',
        lastUpdatedAt,
      };
      this.render();
      this.scheduleFiniteCaptureErrorReset(lastUpdatedAt, 'status');
      return;
    }
    this.state = reducePanelAction(this.state, { name: 'capture/start' });
    this.render();
    const result = await this.captureStore.requestCapture(url, sourceType, sourceRecordId);
    this.state = reducePanelAction(this.state, { name: 'capture/complete', result, sourceRecordId });
    let queueChanged = false;
    const finiteCaptureResultError =
      (result.status === 'failed' || result.status === 'remote-only') &&
      (result.reason === 'encryption-locked' || result.reason === 'auth-required');
    if ((result.status === 'failed' || result.status === 'remote-only') && result.reason === 'encryption-locked') {
      await this.refreshBlobKeyStatus();
    }
    if (isCapturedResult(result) && sourceType === 'history' && sourceRecordId) {
      const updatedHistory = this.state.history.find((item) => item.id === sourceRecordId);
      if (updatedHistory) {
        const saved = await this.saveRecentRecordAsBookmark(updatedHistory, { render: false });
        if (saved.ok) {
          await this.markRecentHistoryRowPinned(sourceRecordId, saved.record);
          this.state = {
            ...this.state,
            message: `Captured ${(result.byteLength / 1024).toFixed(1)} KB image. ${bookmarkSaveMessage(saved.record, saved.record.label)}`,
            lastUpdatedAt: Date.now(),
          };
          queueChanged = true;
        } else {
          const history = this.recentHistoryStore
            ? await this.recentHistoryStore.add(updatedHistory, window.location.href)
            : this.state.history;
          this.state = {
            ...this.state,
            history,
            message: `Captured ${(result.byteLength / 1024).toFixed(1)} KB image, but the recent row was not pinned: ${saved.message}`,
            status: 'error',
            lastUpdatedAt: Date.now(),
          };
        }
      }
    }
    if (isCapturedResult(result) && sourceType === 'target') {
      const capturedAt = new Date().toISOString();
      const dimensions = parseDimensionText(this.state.target.selectedDimensions);
      const draft = createDisplayRecord({
        id: url,
        url,
        timestamp: capturedAt,
        width: dimensions.width,
        height: dimensions.height,
        source: 'bookmark',
        capturedAt,
        captureStatus: 'captured',
        blobId: result.blobId,
        storedOriginal: {
          blobId: result.blobId,
          mimeType: result.mimeType,
          byteLength: result.byteLength,
          capturedAt,
        },
      });
      if (!this.bookmarkStore) {
        await this.removeCapturedBlobReference(result.blobId);
        this.state = {
          ...this.state,
          message: 'Captured original was discarded because bookmark storage is unavailable.',
          status: 'error',
          lastUpdatedAt: Date.now(),
        };
      } else {
        const saved = this.bookmarkStore.saveResult
          ? await this.bookmarkStore.saveResult(draft)
          : { ok: true as const, record: await this.bookmarkStore.save(draft) };
        if (saved.ok) {
          await this.loadBookmarkPage(0, { render: false });
          this.state = {
            ...this.state,
            message: `Captured ${(result.byteLength / 1024).toFixed(1)} KB image. ${bookmarkSaveMessage(saved.record, saved.record.label)}`,
            lastUpdatedAt: Date.now(),
          };
          queueChanged = true;
        } else {
          await this.removeCapturedBlobReference(result.blobId);
          this.state = {
            ...this.state,
            message: `Captured original was discarded because the target pin was not saved: ${saved.message}`,
            status: 'error',
            lastUpdatedAt: Date.now(),
          };
        }
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
    if (finiteCaptureResultError) this.scheduleFiniteCaptureErrorReset(this.state.lastUpdatedAt, 'capture-result');
    if (queueChanged) {
      this.renderPanelAndRefreshRecall();
    } else {
      this.render();
    }
  }

  private async deleteCapturedBlob(recordId: string, blobId: string): Promise<void> {
    if (!this.captureStore) return;
    this.state = reducePanelAction(this.state, { name: 'capture/delete', id: recordId, blobId });
    const updatedHistory = this.state.history.find((b) => b.id === recordId);
    if (updatedHistory && this.recentHistoryStore) {
      const history = await this.recentHistoryStore.add(updatedHistory, window.location.href);
      this.state = { ...this.state, history, lastUpdatedAt: Date.now() };
    }
    const updatedBookmark = this.state.bookmarks.find((bookmark) => bookmark.id === recordId || recordHasBlobId(bookmark, blobId));
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
    void this.removeCapturedBlobReference(blobId, { render: true });
  }

  private async previewRecord(url: string, blobId?: string, scrollAnchorId?: string): Promise<void> {
    this.previewScrollAnchorId = scrollAnchorId ?? null;
    let session: ProjectionSession | null = null;
    try {
      if ((!blobId || !this.captureStore) && this.isCurrentSelectedImageUrl(url)) {
        this.applyAlreadyProjectedPreviewMessage();
        return;
      }
      session = this.beginProjectionSession('record-preview', url);
      if (!session) return;
      if (!blobId) {
        await this.previewUrl(url, session);
        return;
      }

      if (!this.captureStore) {
        await this.previewUrl(url, session);
        return;
      }
      const retrieved = await this.captureStore.requestRetrieveBlob(blobId);
      if (!this.isCurrentProjectionSession(session)) return;
      if (!retrieved.ok) {
        if (retrieved.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
        if (!this.isCurrentProjectionSession(session)) return;
        this.projections.update(session, { status: 'failed' });
        this.state = { ...this.state, message: retrieved.message, status: 'error', lastUpdatedAt: Date.now() };
        this.render();
        return;
      }

      if (await this.projectUrlToSelectedImage(retrieved.dataUrl, session)) {
        if (!this.isCurrentProjectionSession(session)) return;
        this.state = {
          ...this.state,
          message: `Projected encrypted original (${(retrieved.byteLength / 1024).toFixed(1)} KB).`,
          lastUpdatedAt: Date.now(),
        };
        this.render();
        return;
      }

      if (!this.isCurrentProjectionSession(session)) return;
      this.projections.update(session, { status: 'failed' });
      this.state = {
        ...this.state,
        message: 'Select a host image before previewing encrypted originals.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
      this.render();
    } finally {
      if (!session || this.isCurrentProjectionSession(session)) this.previewScrollAnchorId = null;
    }
  }

  private async previewUrl(url: string, session: ProjectionSession): Promise<void> {
    if (!this.canProjectToSelectedImage()) {
      if (!this.isCurrentProjectionSession(session)) return;
      this.projections.update(session, { status: 'failed' });
      this.state = {
        ...this.state,
        message: 'Select a host image before previewing an image.',
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
      this.render();
      return;
    }

    if (await this.projectUrlToSelectedImage(url, session)) {
      if (!this.isCurrentProjectionSession(session)) return;
      this.state = { ...this.state, message: 'Projected image into selected host element.', lastUpdatedAt: Date.now() };
      this.render();
      return;
    }
  }

  private canProjectToSelectedImage(): boolean {
    const handleId = this.state.target.selectedHandleId;
    return !!handleId && !!this.findSelectedImage(handleId);
  }

  private isCurrentSelectedImageUrl(url: string): boolean {
    return imageResourceUrlsEqual(url, this.currentSelectedUrl(), window.location.href);
  }

  private applyAlreadyProjectedPreviewMessage(): void {
    this.state = {
      ...this.state,
      message: 'Recent image is already projected into the selected host element.',
      status: 'ready',
      lastUpdatedAt: Date.now(),
    };
    this.render();
  }

  private async projectUrlToSelectedImage(url: string, session: ProjectionSession): Promise<boolean> {
    const handleId = this.state.target.selectedHandleId;
    if (!handleId) return false;
    const image = this.findSelectedImage(handleId);
    if (!image) return false;

    this.projections.update(session, { status: 'preloading' });
    const preload = await this.neighborPreload.preload(url, { intent: this.imageRequestIntentForProjectionReason(session.reason) });
    if (!this.isCurrentProjectionSession(session)) return false;
    if (!preload.ok) {
      this.projections.update(session, { status: 'failed' });
      this.state = { ...this.state, message: preload.message, status: 'error', lastUpdatedAt: Date.now() };
      this.scheduleFiniteCaptureErrorReset(this.state.lastUpdatedAt, 'status');
      this.render();
      return false;
    }

    const snapshot = this.applyProjectionToSelectedImage(session, preload.displayUrl);
    if (!snapshot) return false;
    if (!this.isCurrentProjectionSession(session)) return false;
    this.state = setTargetState(this.state, toTargetState(snapshot));
    this.render();
    void this.loadGrabSettings();
    return true;
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

  private async refreshPCloudProviderStatus(options: { readonly render?: boolean } = {}): Promise<void> {
    const status = await loadPCloudProviderStatus();
    this.state = reducePanelAction(this.state, { name: 'pcloud-backup/status', status });
    if (options.render !== false) this.render();
  }

  private async connectPCloudBackup(): Promise<void> {
    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/busy',
      pendingOperation: 'connecting',
      message: 'Opening pCloud authorization...',
    });
    this.render();
    const result = await connectPCloudProvider();
    this.state = reducePanelAction(this.state, { name: 'pcloud-backup/status', status: result.status });
    if (!result.ok) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/error', message: result.message });
    }
    this.render();
  }

  private async disconnectPCloudBackup(): Promise<void> {
    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/busy',
      pendingOperation: 'disconnecting',
      message: 'Disconnecting pCloud...',
    });
    this.render();
    const result = await disconnectPCloudProvider();
    this.state = reducePanelAction(this.state, { name: 'pcloud-backup/status', status: result.status });
    if (!result.ok) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/error', message: result.message });
    }
    this.render();
  }

  private async backupPCloudNow(password: string): Promise<void> {
    if (this.state.pcloudBackup.connectionState === 'busy') return;
    if (password.length < 4) {
      this.state = reducePanelAction(this.state, {
        name: 'pcloud-backup/upload-error',
        message: 'Enter a cloud backup password with at least 4 characters before uploading.',
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/busy',
      pendingOperation: 'backing-up',
      message: 'Creating encrypted backup...',
    });
    this.render();

    const bookmarks = await this.loadAllBookmarksForExport();
    if (bookmarks.some(isLockedPrivatePin)) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/upload-error', message: PRIVATE_PIN_EXPORT_LOCKED_MESSAGE });
      this.render();
      return;
    }
    if (bookmarks.length === 0) {
      this.state = reducePanelAction(this.state, {
        name: 'pcloud-backup/upload-error',
        message: 'No durable pins or bookmarks to back up.',
      });
      this.render();
      return;
    }

    const originalBlobIds = originalBlobIdsForFullBackup(bookmarks);
    const originalBlobResult =
      originalBlobIds.length > 0 && this.captureStore
        ? await this.captureStore.requestOriginalBlobRecords(originalBlobIds)
        : { ok: true as const, records: [], missingBlobIds: originalBlobIds };
    if (!originalBlobResult.ok) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/upload-error', message: originalBlobResult.message });
      this.render();
      return;
    }
    const originalBlobRecords = originalBlobResult.records.map(storedBlobRecordFromPortable);

    const blobKeyBackupResult = await this.exportBlobKeyBackupsForOriginalRecords(originalBlobRecords, password);
    if (!blobKeyBackupResult.ok) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/upload-error', message: blobKeyBackupResult.message });
      this.render();
      return;
    }

    const now = new Date().toISOString();
    const exportResult = await exportEncryptedFullBackup({
      bookmarks: bookmarks.map(bookmarkRecordToExportEntry),
      originalBlobs: originalBlobRecords,
      blobKeyBackups: blobKeyBackupResult.backups,
      missingOriginalBlobIds: originalBlobResult.missingBlobIds,
      password,
      now,
    });
    if (!exportResult.status.ok || !exportResult.fileContent) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/upload-error', message: exportResult.status.message });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/busy',
      pendingOperation: 'backing-up',
      message: 'Uploading encrypted backup to pCloud...',
    });
    this.render();

    const upload = await uploadPCloudBackup({
      fileName: pcloudBackupFileName(now),
      fileContent: exportResult.fileContent,
    });
    if (!upload.ok) {
      this.state = reducePanelAction(this.state, { name: 'pcloud-backup/upload-error', message: upload.message, status: upload.status });
      this.render();
      return;
    }
    const originalBytes = originalBlobRecords.reduce((total, record) => total + record.encryptedByteLength, 0);
    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/upload-complete',
      fileName: upload.fileName,
      folderPath: upload.folderPath,
      apiHost: upload.apiHost,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      originalCount: originalBlobRecords.length,
      originalBytes,
      missingOriginalCount: originalBlobResult.missingBlobIds.length,
      uploadedAt: upload.uploadedAt,
      message: pcloudBackupUploadMessage(
        upload.message,
        originalBlobRecords.length,
        originalBytes,
        originalBlobResult.missingBlobIds.length,
      ),
    });
    this.render();
  }

  private async exportBlobKeyBackupsForOriginalRecords(
    originalBlobRecords: readonly ReturnType<typeof storedBlobRecordFromPortable>[],
    password: string,
  ): Promise<
    { readonly ok: true; readonly backups: readonly FullBackupBlobKeyBackup[] } | { readonly ok: false; readonly message: string }
  > {
    if (originalBlobRecords.length === 0) return { ok: true, backups: [] };
    if (!this.captureStore) return { ok: false, message: 'Encrypted original storage is unavailable; no bookmarks were backed up.' };

    const backups: FullBackupBlobKeyBackup[] = [];
    const keyReferences = [...new Set(originalBlobRecords.map((record) => record.key.reference))].sort();
    for (const keyReference of keyReferences) {
      const backup = await this.captureStore.exportBlobKeyBackup(password, keyReference);
      if (!backup.ok) return { ok: false, message: backup.message };
      backups.push({ keyReference: backup.keyReference, fileContent: backup.fileContent });
    }
    return { ok: true, backups };
  }

  private async choosePCloudRestoreFile(): Promise<void> {
    if (this.state.pcloudBackup.connectionState === 'busy') return;
    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/busy',
      pendingOperation: 'restoring',
      message: 'Checking pCloud backups...',
    });
    this.render();

    const result = await listPCloudBackups();
    if (!result.ok) {
      this.state = reducePanelAction(this.state, {
        name: 'pcloud-backup/restore-error',
        message: result.message,
        status: result.status,
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/restore-candidates-loaded',
      candidates: result.candidates,
      folderPath: result.folderPath,
      apiHost: result.apiHost,
      message: result.message,
    });
    this.render();
  }

  private async previewPCloudRestoreFile(fileId: number, fileName: string, password: string): Promise<void> {
    if (this.state.pcloudBackup.connectionState === 'busy') return;
    if (password.length < 4) {
      this.state = reducePanelAction(this.state, {
        name: 'pcloud-backup/restore-error',
        message: 'Enter the cloud backup password before previewing this restore file.',
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/busy',
      pendingOperation: 'restoring',
      message: 'Downloading encrypted pCloud backup...',
    });
    this.render();

    const result = await downloadPCloudBackup({ fileId, fileName });
    if (!result.ok) {
      this.state = reducePanelAction(this.state, {
        name: 'pcloud-backup/restore-error',
        message: result.message,
        status: result.status,
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, {
      name: 'pcloud-backup/restore-downloaded',
      fileName: result.fileName,
      folderPath: result.folderPath,
      apiHost: result.apiHost,
      sizeBytes: result.sizeBytes,
      sha256: result.sha256,
      downloadedAt: result.downloadedAt,
      message: result.message,
    });
    await this.previewBookmarksImport(result.fileContent, password, result.fileName);
    this.render();
  }

  private showPCloudBackupPlaceholder(kind: 'backup' | 'restore'): void {
    const message =
      kind === 'backup'
        ? 'pCloud is connected. Backup upload is the next implementation slice.'
        : 'pCloud is connected. Restore file selection is the next implementation slice.';
    this.state = reducePanelAction(this.state, { name: 'pcloud-backup/message', message });
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
    const selectedBookmarks = [
      ...(this.state.selectedBookmarkIds.length > 0 ? selectedRecords(this.state.bookmarks, this.state.selectedBookmarkIds) : []),
      ...(this.state.recall.selectedIds.length > 0 ? this.selectedRecallRecords() : []),
    ];
    const bookmarks = selectedBookmarks.length > 0 ? selectedBookmarks : await this.loadAllBookmarksForExport();
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

  private async exportUrlReviewStatus(): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const hostname = hostnameFromLocation();
    const records = hostname && this.urlReviewStatusStore ? await this.urlReviewStatusStore.list(hostname) : [];
    const result = exportUrlReviewStatusFile({ records });
    if (!result.status.ok || !result.fileContent || !result.fileName) {
      this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
      return;
    }
    downloadTextFile(result.fileContent, result.fileName);
    let message = result.status.message;
    if (this.localSettings.clearUrlReviewStatusAfterExport && hostname && this.urlReviewStatusStore) {
      const deletedCount = await this.urlReviewStatusStore.clear({ scope: 'hostname', hostname });
      message = `${message} Cleared ${deletedCount} current-site record${deletedCount === 1 ? '' : 's'} after export.`;
    }
    this.state = reducePanelAction(this.state, { name: 'import-export/complete', message });
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
    return [
      ...(this.state.selectedHistoryIds.length > 0 ? selectedRecords(this.state.history, this.state.selectedHistoryIds) : []),
      ...(this.state.selectedBookmarkIds.length > 0 ? selectedRecords(this.state.bookmarks, this.state.selectedBookmarkIds) : []),
      ...(this.state.recall.selectedIds.length > 0 ? this.selectedRecallRecords() : []),
    ];
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
        fileName: filenameForExportedImageRecord(record),
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
        fileName: filenameForExportedImageRecord(record),
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

  private async previewHistoryImport(fileContent: string, password: string, fileName?: string): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await importEncryptedHistory(fileContent, password);
    if (!result.status.ok) {
      this.pendingRestoreImport = null;
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.status.message });
      this.render();
      return;
    }
    const duplicateSummary = createRestoreDuplicateSummary(result.entries, await this.loadRetainedRecentHistoryForRestoreDuplicateCheck());
    this.pendingRestoreImport = {
      kind: 'history',
      result: { ...result, entries: duplicateSummary.uniqueEntries },
      duplicateCount: duplicateSummary.duplicateCount,
    };
    this.state = reducePanelAction(this.state, {
      name: 'import/restore-preview-ready',
      preview: createHistoryRestorePreview(result, fileName, duplicateSummary),
    });
    this.render();
  }

  private async importHistory(result: HistoryImportResult, duplicateCount: number): Promise<void> {
    if (!this.recentHistoryStore) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Recent history storage is unavailable; no records were imported.',
      });
      this.render();
      return;
    }
    let importedCount = 0;
    for (const entry of result.entries) {
      const record = historyPayloadToDisplayRecord(entry.uuid, entry.payload);
      await this.recentHistoryStore.add(record, window.location.href);
      importedCount += 1;
    }
    await this.loadRecentHistory();
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: restoreImportCompleteMessage(
        'record',
        importedCount,
        duplicateCount,
        result.skipped.length,
        result.plaintext,
        'reloaded into extension state',
      ),
    });
    this.render();
  }

  private async previewBookmarksImport(fileContent: string, password: string, fileName?: string): Promise<void> {
    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();
    const result = await importBookmarkRecords(fileContent, password);
    if (!result.status.ok) {
      this.pendingRestoreImport = null;
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.status.message });
      this.render();
      return;
    }
    const duplicateSummary = createRestoreDuplicateSummary(result.entries, await this.loadAllBookmarksForExport());
    this.pendingRestoreImport = {
      kind: 'bookmarks',
      result: {
        ...result,
        entries: duplicateSummary.uniqueEntries,
        externalOriginalCount: bookmarkEntriesOriginalReferenceCount(duplicateSummary.uniqueEntries),
      },
      duplicateCount: duplicateSummary.duplicateCount,
      password,
    };
    this.state = reducePanelAction(this.state, {
      name: 'import/restore-preview-ready',
      preview: createBookmarksRestorePreview(result, fileName, duplicateSummary),
    });
    this.render();
  }

  private async importBookmarks(result: BookmarkImportResult, duplicateCount: number, password: string): Promise<void> {
    if (!this.bookmarkStore) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Bookmark storage is unavailable; no bookmarks were imported.',
      });
      this.render();
      return;
    }
    const fullBackupOriginalRestore = await this.restoreFullBackupOriginals(result, password);
    if (!fullBackupOriginalRestore.ok) {
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: fullBackupOriginalRestore.message });
      this.render();
      return;
    }
    let importedCount = 0;
    for (const entry of result.entries) {
      await this.bookmarkStore.save(bookmarkPayloadToDisplayRecord(entry.uuid, entry.payload));
      importedCount += 1;
    }
    await this.loadBookmarkPage(0, { render: false });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: restoreImportCompleteMessage(
        'bookmark',
        importedCount,
        duplicateCount,
        result.skipped.length,
        result.plaintext,
        result.fullBackup ? fullBackupRestoreDetail(fullBackupOriginalRestore.importedOriginalCount) : 'encrypted into bookmark storage',
      ),
    });
    this.renderPanelAndRefreshRecall();
  }

  private async restoreFullBackupOriginals(
    result: BookmarkImportResult,
    password: string,
  ): Promise<{ readonly ok: true; readonly importedOriginalCount: number } | { readonly ok: false; readonly message: string }> {
    if (!result.fullBackup || result.externalOriginalCount === 0) return { ok: true, importedOriginalCount: 0 };
    if (!this.captureStore) {
      return { ok: false, message: 'Encrypted original storage is unavailable; no bookmarks were imported.' };
    }
    for (const backup of result.blobKeyBackups) {
      const imported = await this.captureStore.importBlobKeyBackup(backup.fileContent, password);
      if (!imported.ok) return { ok: false, message: imported.message };
    }
    const blobImport = await this.captureStore.importOriginalBlobRecords(result.originalBlobs);
    if (!blobImport.ok) return { ok: false, message: blobImport.message };
    await this.refreshBlobKeyStatus();
    await this.refreshStorageUsage();
    return { ok: true, importedOriginalCount: blobImport.importedCount };
  }

  private previewUrlReviewStatusImport(fileContent: string, fileName?: string): void {
    const result = importUrlReviewStatusFile(fileContent);
    if (!result.status.ok) {
      this.pendingRestoreImport = null;
      this.state = reducePanelAction(this.state, { name: 'import-export/error', message: result.status.message });
      this.render();
      return;
    }
    this.pendingRestoreImport = { kind: 'url-review-status', result };
    this.state = reducePanelAction(this.state, {
      name: 'import/restore-preview-ready',
      preview: createUrlReviewStatusRestorePreview(result, fileName),
    });
    this.render();
  }

  private async importUrlReviewStatus(result: ReturnType<typeof importUrlReviewStatusFile>): Promise<void> {
    const importedCount = await this.urlReviewStatusStore?.importMany(result.records, {
      maxRecordsPerHost: this.localSettings.urlReviewStatusLimit,
    });
    this.state = reducePanelAction(this.state, {
      name: 'import-export/complete',
      message: `${result.status.message} ${importedCount ?? 0} saved to extension state.`,
    });
    this.render();
  }

  private async confirmRestorePreview(): Promise<void> {
    const pending = this.pendingRestoreImport;
    if (!pending) {
      this.state = reducePanelAction(this.state, {
        name: 'import-export/error',
        message: 'Choose an import file before confirming restore.',
      });
      this.render();
      return;
    }

    this.state = reducePanelAction(this.state, { name: 'import-export/start' });
    this.render();

    switch (pending.kind) {
      case 'history':
        await this.importHistory(pending.result, pending.duplicateCount);
        break;
      case 'bookmarks':
        await this.importBookmarks(pending.result, pending.duplicateCount, pending.password);
        break;
      case 'url-review-status':
        await this.importUrlReviewStatus(pending.result);
        break;
    }
    this.pendingRestoreImport = null;
  }

  private cancelRestorePreview(): void {
    this.pendingRestoreImport = null;
    this.state = reducePanelAction(this.state, { name: 'import/cancel-restore-preview' });
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

  private async loadRetainedRecentHistoryForRestoreDuplicateCheck(): Promise<readonly ImageDisplayRecord[]> {
    if (!this.recentHistoryStore) return this.state.history;
    return this.recentHistoryStore.load(window.location.href, { includeRetained: true });
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
          scrollAnchorId: this.previewScrollAnchorId,
          onPanelDragStart: this.handlePanelDragStart,
        },
        this.state,
        { renderRecall: options.includeRecall !== false },
      );
      this.restoreFocusedPanelControl(focusedControl);
      if (!this.state.minimized && this.panelStylesReady) {
        this.queuePanelPositionRestore();
        this.applyRestoredPanelPosition();
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
      if (!saved || !this.isPanelPositionRestoreCurrent(attempt)) return;
      await this.waitForPanelLayout();
      if (!this.isPanelPositionRestoreCurrent(attempt)) return;
      this.restoredPanelPosition = this.clampPanelPosition(saved);
      this.applyRestoredPanelPosition();
      this.renderRecallOnly();
    } finally {
      if (this.root && this.panelPositionRestoreAttempt === attempt) {
        this.panelPositionRestored = true;
      }
    }
  }

  private isPanelPositionRestoreCurrent(attempt: number): boolean {
    return Boolean(this.root) && this.panelPositionRestoreAttempt === attempt && !this.panelPositionRestored;
  }

  private async waitForPanelLayout(): Promise<void> {
    await this.panelMount.whenStylesReady();
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

  private clearPanelPosition(): void {
    if (!this.root) return;
    this.root.style.removeProperty('left');
    this.root.style.removeProperty('top');
    this.root.style.removeProperty('right');
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

  private async resetPanelPosition(): Promise<void> {
    const hostname = hostnameFromLocation();
    if (!hostname) return;
    this.panelPositionRestoreAttempt += 1;
    this.panelPositionRestorePromise = null;
    await this.panelPositionStore?.remove(hostname);
    this.restoredPanelPosition = null;
    this.panelPositionRestored = true;
    this.clearPanelPosition();
    this.state = { ...this.state, message: 'Panel position reset for this site.', status: 'ready', lastUpdatedAt: Date.now() };
    this.render();
    this.renderRecallOnly();
  }
}
