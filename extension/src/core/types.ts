import type { AutomationPhase } from './automation/types.js';
import type { BuildIdentity } from './build-info.js';
import type { CaptureResult, CaptureRetryRequest, CaptureSourceType, StorageUsageSummary } from './image/capture-result.js';
import type { ImageDisplayRecord } from './display-records.js';
import type { ImageProbeMethod } from './image/request-policy.js';
import type { LoadFailureFeedback } from './settings.js';
import type { SearchableMetadataPolicy } from './metadata-policy.js';
import type { GrabSourcePattern, UrlTemplateRecord } from './url/templates.js';
import type { FieldTransformPanelAction } from './field-transform-panel-action.js';
import type { UrlTemplatePanelAction } from './url/panel-actions.js';
import type { UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from './url/types.js';
import type { ObjectFitMode } from './preview-style.js';
import type { QueueDisplayOrder, RecentDisplayOrder } from './display-order.js';
import type { DetachableSectionId } from './workspace-layout.js';
import type { PCloudBackupState } from './cloud/pcloud-provider.js';
import type { PageContext, PageContextState } from './page-context.js';
import type { ImportedEncryptedImageFile, ImportedImageFile, ImportRestorePreviewState } from './import-types.js';
import type { WorkspacePanelAction } from './workspace-actions.js';
import type { RecentHistoryScope } from './recent-history-scope.js';
import type { LibraryPanelState, RecentHistoryOverflowBehavior, RecentSparseRowDisplayMode } from './library-panel-state.js';
import type { SessionInactivityTimeoutMinutes } from './secure-session-policy.js';
import type { SecureSessionPanelAction } from './secure-session-actions.js';

export type { RecentHistoryOverflowBehavior, RecentSparseRowDisplayMode } from './library-panel-state.js';
export type { BookmarkStore } from './bookmark-store.js';

export type PanelStatus = 'idle' | 'ready' | 'closed' | 'unsupported' | 'error' | 'picking';
export type PinSaveStoragePreference = 'encrypted' | 'plaintext';

export interface TargetState {
  readonly mode: 'auto' | 'manual' | 'none';
  readonly picking: boolean;
  readonly grabModeActive: boolean;
  readonly candidateCount: number;
  readonly selectedUrl: string | null;
  readonly selectedHandleId: string | null;
  readonly selectedDimensions: string | null;
  readonly fillScreen: boolean;
  readonly objectFit: ObjectFitMode;
  readonly message: string;
}

export interface AutomationState {
  readonly slideshowPhase: AutomationPhase;
  readonly slideshowCount: number;
  readonly retryPhase: AutomationPhase;
  readonly retriesUsed: number;
  readonly retriesMax: number;
  readonly governorStatus: 'ready' | 'throttled' | 'capped';
  readonly requestsInWindow: number;
  // True while the parsed-field navigation drain is working; the panel's busy signal (#373).
  readonly navigationBusy: boolean;
}

export type PanelDestinationId = import('./destinations.js').ExtensionDestinationId;

export type {
  DetachableSectionId,
  PanelPosition,
  PanelPositionStore,
  StoredWorkspaceLayout,
  WorkspaceLayout,
  WorkspaceLayoutStore,
  WorkspaceSectionLayout,
} from './workspace-layout.js';
export type {
  ImportedEncryptedImageFile,
  ImportedImageFile,
  ImportRestorePreviewSample,
  ImportRestorePreviewState,
  ImportRestorePreviewUnsupportedSection,
  ImportRestorePreviewValidationIssue,
} from './import-types.js';
export type { FieldTransformPanelAction } from './field-transform-panel-action.js';

export interface UrlTemplateStore {
  load(hostname: string): Promise<readonly UrlTemplateRecord[]>;
  loadGrabSourcePatterns(hostname: string): Promise<readonly GrabSourcePattern[]>;
  save(template: UrlTemplateRecord): Promise<void>;
  saveGrabSourcePattern(pattern: GrabSourcePattern): Promise<void>;
  remove(hostname: string, id: string): Promise<void>;
  removeGrabSourcePattern(hostname: string, id: string): Promise<void>;
}

export interface ParsedFieldStateRecord {
  readonly schemaVersion: 1;
  readonly hostname: string;
  readonly pageUrl: string;
  readonly sourceUrl: string;
  readonly selectedUrl: string | null;
  readonly selectedHandleId: string | null;
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs?: readonly UrlFieldDigitWidthSpec[] | undefined;
  readonly activeUrlTemplateId: string | null;
  readonly updatedAt: string;
}

export interface ParsedFieldResetBaseline {
  readonly sourceUrl: string;
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
}

export interface ParsedFieldStateStore {
  load(hostname: string, pageUrl: string): Promise<ParsedFieldStateRecord | null>;
  loadForSource(hostname: string, sourceUrl: string): Promise<ParsedFieldStateRecord | null>;
  save(record: ParsedFieldStateRecord): Promise<void>;
}

export type UrlReviewStatus = 'passed' | 'failed' | 'unchanged';

export interface UrlReviewStatusRecord {
  readonly schemaVersion: 1;
  readonly hostname: string;
  readonly pageUrl: string;
  readonly sourceUrl: string;
  readonly status: UrlReviewStatus;
  readonly fieldIds: readonly string[];
  readonly activeFieldId: string | null;
  readonly reason?: string | undefined;
  readonly updatedAt: string;
}

export type UrlReviewStatusClearFilter =
  | { readonly scope: 'hostname'; readonly hostname: string }
  | { readonly scope: 'page'; readonly hostname: string; readonly pageUrl: string }
  | { readonly scope: 'source'; readonly hostname: string; readonly sourceUrl: string }
  | { readonly scope: 'all' };

export interface UrlReviewStatusStore {
  list(hostname: string): Promise<readonly UrlReviewStatusRecord[]>;
  save(record: UrlReviewStatusRecord, options?: { readonly maxRecordsPerHost?: number }): Promise<void>;
  importMany(records: readonly UrlReviewStatusRecord[], options?: { readonly maxRecordsPerHost?: number }): Promise<number>;
  clear(filter: UrlReviewStatusClearFilter): Promise<number>;
}

export interface RecallCandidate extends ImageDisplayRecord {
  readonly envelopeCreatedAt: string;
}

export interface RecallState {
  readonly busy: boolean;
  readonly candidates: readonly RecallCandidate[];
  readonly selectedIds: readonly string[];
  readonly offset: number;
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly total: number;
  readonly failedCount: number;
  readonly message?: string | undefined;
  readonly messageIsError?: boolean | undefined;
}

export interface PanelState extends LibraryPanelState {
  readonly visible: boolean;
  readonly minimized: boolean;
  readonly status: PanelStatus;
  readonly message: string;
  readonly lastUpdatedAt: number;
  readonly target: TargetState;
  readonly pageContext: PageContextState;
  readonly draftUrl: string | null;
  readonly pinSaveStoragePreference: PinSaveStoragePreference;
  readonly blobKeyInactivityTimeoutMinutes: SessionInactivityTimeoutMinutes;
  readonly privacyModeEnabled: boolean;
  readonly searchableMetadataPolicy: SearchableMetadataPolicy;
  readonly buildInfoOverlayVisible: boolean;
  readonly urlReviewStatusLimit: number;
  readonly clearUrlReviewStatusAfterExport: boolean;
  readonly requestThrottleMs: number;
  readonly requestThrottleMaxRequests: number;
  readonly requestThrottleWindowMs: number;
  readonly neighborPreloadEnabled: boolean;
  readonly neighborPreloadRadius: number;
  readonly neighborPreloadCacheLimit: number;
  readonly neighborPreloadProbeMethod: ImageProbeMethod;
  readonly loadFailureFeedback: LoadFailureFeedback;
  readonly downArrowAction: import('./keyboard-shortcuts.js').DownArrowAction;
  readonly secondaryControlsOpen: boolean;
  readonly detachedSections: readonly DetachableSectionId[];
  readonly restoreWorkspaceLayoutEnabled: boolean;
  readonly captureInProgress: boolean;
  readonly captureResult: CaptureResult | null;
  readonly captureRetryRequest: CaptureRetryRequest | null;
  readonly storageUsage: StorageUsageSummary | null;
  readonly buildIdentity: BuildIdentity | null;
  readonly blobKeyUnlocked: boolean;
  readonly blobKeyAvailable: boolean;
  readonly blobKeyReference: string | null;
  readonly importExportBusy: boolean;
  readonly importExportMessage?: string | undefined;
  readonly importExportMessageIsError?: boolean | undefined;
  readonly importRestorePreview?: ImportRestorePreviewState | undefined;
  readonly pcloudBackup: PCloudBackupState;
  readonly activeDestination: PanelDestinationId | null;
  readonly helpOpen: boolean;
  readonly automation: AutomationState;
  readonly recall: RecallState;
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
  readonly parsedFieldResetBaseline: ParsedFieldResetBaseline | null;
  readonly urlTemplates: readonly UrlTemplateRecord[];
  readonly grabSourcePatterns: readonly GrabSourcePattern[];
  readonly activeUrlTemplateId: string | null;
  readonly currentImageFingerprint: string | null;
}

export type PanelActionName =
  | 'toggle-panel'
  | 'close-panel'
  | 'panel/minimize'
  | 'panel/expand'
  | 'panel/secondary-controls-open'
  | 'destination/select'
  | 'destination/close'
  | 'section/detach'
  | 'section/restore'
  | 'start-target-picker'
  | 'stop-target-picker'
  | 'grab-mode/start'
  | 'grab-mode/stop'
  | 'target/fill-screen'
  | 'target/set-object-fit'
  | 'target/release'
  | 'page-context/set'
  | 'history/add-loaded'
  | 'history/remove'
  | 'history/pin'
  | 'history/mark-pinned'
  | 'history/delete-all'
  | 'history/load'
  | 'history/download'
  | 'history/select'
  | 'history/update-display-order'
  | 'selection/select-visible'
  | 'history-selection/toggle'
  | 'history-selection/select'
  | 'history-selection/clear'
  | 'active-field/set'
  | 'field-unlock/toggle'
  | 'field/transform'
  | 'field/commit-rejected'
  | 'selected-url/apply'
  | 'selected-url/reject-unsupported-input'
  | 'pin/current'
  | 'bookmark/current'
  | 'bookmark/load'
  | 'bookmark/remove'
  | 'bookmark-selection/toggle'
  | 'bookmark-selection/single'
  | 'bookmark-selection/select'
  | 'bookmark-selection/clear'
  | 'bookmarks/page-loaded'
  | 'bookmarks/update-display-order'
  | 'gallery/open'
  | 'bookmarks/page-front'
  | 'bookmarks/page-back'
  | 'bookmarks/toggle-scope'
  | 'bookmarks/reload'
  | 'bookmarks/refresh-thumbnails'
  | 'settings/toggle'
  | 'help/toggle'
  | 'settings/update-visible-bookmark-soft-max'
  | 'settings/update-recent-history-retention'
  | 'settings/update-recent-sparse-row-display-mode'
  | 'settings/update-pin-save-storage-preference'
  | 'settings/update-privacy-mode'
  | 'settings/update-metadata-policy'
  | 'settings/update-build-info-overlay-visibility'
  | 'settings/update-url-review-status-retention'
  | 'settings/update-request-throttle'
  | 'settings/update-neighbor-preload'
  | 'settings/update-down-arrow-action'
  | 'neighbor-preload/manual'
  | 'settings/reset-panel-position'
  | 'settings/update-workspace-layout-restore'
  | 'settings/reset-workspace-layout'
  | 'url-templates/load'
  | 'url-template/remove'
  | 'url-template/update-settings'
  | 'url-template/update-fields'
  | 'grab-source-patterns/load'
  | 'grab-source-pattern/remove'
  | 'grab-source-pattern/update-settings'
  | 'parsed-field-state/restore'
  | 'capture/permission-retry'
  | 'capture/start'
  | 'capture/complete'
  | 'capture/clear'
  | 'capture/delete'
  | 'capture/cleanup-orphans'
  | 'capture/preview'
  | 'blob-key/setup'
  | 'blob-key/unlock'
  | 'blob-key/clear'
  | 'blob-key/export'
  | 'blob-key/import'
  | 'blob-key/status'
  | 'import-export/start'
  | 'import-export/complete'
  | 'import-export/error'
  | 'import/restore-preview-ready'
  | 'pcloud-backup/status'
  | 'pcloud-backup/busy'
  | 'pcloud-backup/message'
  | 'pcloud-backup/upload-complete'
  | 'pcloud-backup/upload-error'
  | 'pcloud-backup/error'
  | 'cloud-backup/connect'
  | 'cloud-backup/backup-now'
  | 'cloud-backup/choose-restore'
  | 'cloud-backup/retry'
  | 'cloud-backup/disconnect'
  | 'export/history'
  | 'export/bookmarks'
  | 'export/image'
  | 'export/encrypted-image'
  | 'import/history'
  | 'import/bookmarks'
  | 'import/image'
  | 'import/encrypted-image'
  | 'import/confirm-restore-preview'
  | 'import/cancel-restore-preview'
  | 'recall/open'
  | 'recall/close'
  | 'recall/load-start'
  | 'recall/reload'
  | 'recall/load-more'
  | 'recall/load-complete'
  | 'recall/error'
  | 'recall-selection/toggle'
  | 'recall-selection/select'
  | 'recall-selection/clear'
  | 'recall/selected'
  | 'recall/complete'
  | 'storage/update'
  | 'undo-last'
  | 'slideshow-start'
  | 'slideshow-stop'
  | 'slideshow-pause'
  | 'slideshow-resume'
  | 'retry-start'
  | 'retry-stop'
  | 'navigate-next'
  | 'navigate-previous'
  | 'stop-all';

export type PanelAction =
  | {
      readonly name: Exclude<
        PanelActionName,
        | 'history/add-loaded'
        | 'history/remove'
        | 'history/pin'
        | 'history/mark-pinned'
        | 'history/delete-all'
        | 'history/select'
        | 'history/update-display-order'
        | 'selection/select-visible'
        | 'history-selection/toggle'
        | 'history-selection/select'
        | 'history-selection/clear'
        | 'field/transform'
        | 'selected-url/apply'
        | 'target/fill-screen'
        | 'target/set-object-fit'
        | 'page-context/set'
        | 'panel/secondary-controls-open'
        | 'destination/select'
        | 'section/detach'
        | 'section/restore'
        | 'active-field/set'
        | 'field-unlock/toggle'
        | 'bookmark/load'
        | 'bookmark/remove'
        | 'bookmark-selection/toggle'
        | 'bookmark-selection/single'
        | 'bookmark-selection/select'
        | 'bookmark-selection/clear'
        | 'bookmarks/page-loaded'
        | 'bookmarks/update-display-order'
        | 'settings/update-visible-bookmark-soft-max'
        | 'settings/update-recent-history-retention'
        | 'settings/update-recent-sparse-row-display-mode'
        | 'settings/update-pin-save-storage-preference'
        | 'settings/update-privacy-mode'
        | 'settings/update-metadata-policy'
        | 'settings/update-build-info-overlay-visibility'
        | 'settings/update-url-review-status-retention'
        | 'settings/update-request-throttle'
        | 'settings/update-neighbor-preload'
        | 'settings/update-down-arrow-action'
        | 'settings/update-workspace-layout-restore'
        | 'neighbor-preload/manual'
        | 'url-templates/load'
        | 'url-template/remove'
        | 'url-template/update-settings'
        | 'url-template/update-fields'
        | 'grab-source-patterns/load'
        | 'grab-source-pattern/remove'
        | 'grab-source-pattern/update-settings'
        | 'parsed-field-state/restore'
        | 'capture/start'
        | 'capture/complete'
        | 'capture/clear'
        | 'capture/delete'
        | 'capture/cleanup-orphans'
        | 'capture/preview'
        | 'blob-key/setup'
        | 'blob-key/unlock'
        | 'blob-key/clear'
        | 'blob-key/export'
        | 'blob-key/import'
        | 'blob-key/status'
        | 'import-export/complete'
        | 'import-export/error'
        | 'import/restore-preview-ready'
        | 'pcloud-backup/status'
        | 'pcloud-backup/busy'
        | 'pcloud-backup/message'
        | 'pcloud-backup/upload-complete'
        | 'pcloud-backup/upload-error'
        | 'pcloud-backup/error'
        | 'cloud-backup/connect'
        | 'cloud-backup/backup-now'
        | 'cloud-backup/choose-restore'
        | 'cloud-backup/retry'
        | 'cloud-backup/disconnect'
        | 'export/history'
        | 'export/bookmarks'
        | 'export/image'
        | 'export/encrypted-image'
        | 'import/history'
        | 'import/bookmarks'
        | 'import/image'
        | 'import/encrypted-image'
        | 'recall/load-complete'
        | 'recall/error'
        | 'recall-selection/toggle'
        | 'recall-selection/select'
        | 'recall/complete'
        | 'storage/update'
      >;
    }
  | {
      readonly name: 'history/add-loaded';
      readonly url: string;
      readonly title?: string | undefined;
      readonly timestamp?: string | undefined;
      readonly thumbnail?: string | undefined;
      readonly width?: number | undefined;
      readonly height?: number | undefined;
    }
  | {
      readonly name: 'history/remove' | 'history/pin' | 'bookmark/load' | 'bookmark/remove' | 'bookmark/clear' | 'history/select';
      readonly id: string;
    }
  | { readonly name: 'history/mark-pinned'; readonly id: string; readonly pinnedAt: string; readonly pinnedRecordId: string }
  | { readonly name: 'history/update-display-order'; readonly order: RecentDisplayOrder }
  | { readonly name: 'history/update-scope'; readonly scope: RecentHistoryScope }
  | { readonly name: 'selection/select-visible' }
  | { readonly name: 'history-selection/toggle' | 'bookmark-selection/toggle' | 'bookmark-selection/single'; readonly id: string }
  | {
      readonly name: 'history-selection/select' | 'bookmark-selection/select' | 'recall-selection/select';
      readonly ids: readonly string[];
      readonly mode?: 'replace' | 'add';
    }
  | { readonly name: 'history/delete-all' | 'history-selection/clear' | 'bookmark-selection/clear' }
  | { readonly name: 'bookmarks/clear-visible' | 'bookmarks/delete-visible' | 'recall/delete-all' }
  | {
      readonly name: 'bookmarks/page-loaded';
      readonly bookmarks: readonly ImageDisplayRecord[];
      readonly offset: number;
      readonly limit: number;
      readonly total: number;
      readonly hasOlder: boolean;
      readonly hasNewer: boolean;
    }
  | { readonly name: 'bookmarks/update-display-order'; readonly order: QueueDisplayOrder }
  | { readonly name: 'history/load' | 'history/download' }
  | { readonly name: 'panel/secondary-controls-open'; readonly open: boolean }
  | { readonly name: 'destination/select' | 'destination/open-tab'; readonly destination: PanelDestinationId }
  | { readonly name: 'panel/history-section-open'; readonly open: boolean }
  | { readonly name: 'panel/bookmarks-section-open'; readonly open: boolean }
  | WorkspacePanelAction
  | { readonly name: 'settings/update-visible-bookmark-soft-max'; readonly value: number }
  | {
      readonly name: 'settings/update-recent-history-retention';
      readonly limit: number;
      readonly retainedLimit: number;
      readonly overflowBehavior: RecentHistoryOverflowBehavior;
    }
  | { readonly name: 'settings/update-recent-sparse-row-display-mode'; readonly mode: RecentSparseRowDisplayMode }
  | { readonly name: 'settings/update-pin-save-storage-preference'; readonly value: PinSaveStoragePreference }
  | SecureSessionPanelAction
  | { readonly name: 'settings/update-privacy-mode'; readonly enabled: boolean }
  | { readonly name: 'settings/update-metadata-policy'; readonly policy: SearchableMetadataPolicy }
  | { readonly name: 'settings/update-workspace-layout-restore'; readonly enabled: boolean }
  | { readonly name: 'settings/update-build-info-overlay-visibility'; readonly visible: boolean }
  | {
      readonly name: 'settings/update-url-review-status-retention';
      readonly limit: number;
      readonly clearAfterExport: boolean;
    }
  | {
      readonly name: 'settings/update-request-throttle';
      readonly minimumIntervalMs: number;
      readonly maxRequests: number;
      readonly windowMs: number;
    }
  | {
      readonly name: 'settings/update-neighbor-preload';
      readonly enabled: boolean;
      readonly radius: number;
      readonly cacheLimit: number;
      readonly probeMethod: ImageProbeMethod;
      readonly loadFailureFeedback: LoadFailureFeedback;
    }
  | {
      readonly name: 'settings/update-down-arrow-action';
      readonly value: import('./keyboard-shortcuts.js').DownArrowAction;
    }
  | { readonly name: 'neighbor-preload/manual'; readonly radius: number; readonly cacheLimit: number }
  | UrlTemplatePanelAction
  | { readonly name: 'parsed-field-state/restore'; readonly record: ParsedFieldStateRecord }
  | { readonly name: 'active-field/set'; readonly id: string | null }
  | { readonly name: 'target/fill-screen'; readonly enabled: boolean }
  | { readonly name: 'target/set-object-fit'; readonly mode: ObjectFitMode }
  | { readonly name: 'page-context/set'; readonly context: PageContext | null }
  | { readonly name: 'field-unlock/toggle'; readonly id: string }
  | FieldTransformPanelAction
  | { readonly name: 'selected-url/apply'; readonly url: string }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: CaptureSourceType; readonly sourceRecordId?: string }
  | { readonly name: 'capture/repair-selected'; readonly ids: readonly string[] }
  | { readonly name: 'capture/start'; readonly request?: CaptureRetryRequest | undefined }
  | { readonly name: 'capture/complete'; readonly result: CaptureResult; readonly sourceRecordId?: string | undefined }
  | { readonly name: 'capture/clear' }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string }
  | { readonly name: 'capture/cleanup-orphans' }
  | {
      readonly name: 'capture/preview';
      readonly url: string;
      readonly blobId?: string | undefined;
      readonly scrollAnchorId?: string | undefined;
    }
  | { readonly name: 'import-export/complete'; readonly message: string }
  | { readonly name: 'import-export/error'; readonly message: string }
  | { readonly name: 'import/restore-preview-ready'; readonly preview: ImportRestorePreviewState }
  | { readonly name: 'pcloud-backup/status'; readonly status: import('./cloud/pcloud-provider.js').PCloudProviderStatus }
  | {
      readonly name: 'pcloud-backup/busy';
      readonly pendingOperation: 'connecting' | 'disconnecting' | 'backing-up' | 'restoring';
      readonly message: string;
    }
  | { readonly name: 'pcloud-backup/message'; readonly message: string }
  | {
      readonly name: 'pcloud-backup/upload-complete';
      readonly apiHost: string;
      readonly originalCount?: number;
      readonly originalBytes?: number;
      readonly missingOriginalCount?: number;
      readonly historyRecord: import('./cloud/pcloud-provider.js').BackupHistoryRecord;
      readonly message: string;
    }
  | {
      readonly name: 'pcloud-backup/upload-error';
      readonly message: string;
      readonly status?: import('./cloud/pcloud-provider.js').PCloudProviderStatus;
    }
  | {
      readonly name: 'pcloud-backup/restore-candidates-loaded';
      readonly candidates: readonly import('./cloud/pcloud-provider.js').PCloudBackupRestoreCandidate[];
      readonly folderPath: string;
      readonly apiHost: string;
      readonly message: string;
    }
  | {
      readonly name: 'pcloud-backup/restore-downloaded';
      readonly fileName: string;
      readonly folderPath: string;
      readonly apiHost: string;
      readonly sizeBytes: number;
      readonly sha256: string;
      readonly downloadedAt: string;
      readonly message: string;
    }
  | {
      readonly name: 'pcloud-backup/restore-error';
      readonly message: string;
      readonly status?: import('./cloud/pcloud-provider.js').PCloudProviderStatus;
    }
  | { readonly name: 'pcloud-backup/error'; readonly message: string }
  | { readonly name: 'cloud-backup/connect'; readonly provider: 'pcloud' }
  | { readonly name: 'cloud-backup/backup-now'; readonly provider: 'pcloud'; readonly password: string }
  | { readonly name: 'cloud-backup/choose-restore'; readonly provider: 'pcloud' }
  | {
      readonly name: 'cloud-backup/preview-restore';
      readonly provider: 'pcloud';
      readonly fileId: number;
      readonly fileName: string;
      readonly password: string;
    }
  | { readonly name: 'cloud-backup/retry'; readonly provider: 'pcloud' }
  | { readonly name: 'cloud-backup/disconnect'; readonly provider: 'pcloud' }
  | { readonly name: 'export/history' | 'export/bookmarks'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/url-review-status' }
  | { readonly name: 'clear/url-review-status'; readonly scope?: 'hostname' | 'page' | 'source' | 'all' }
  | { readonly name: 'export/image'; readonly saveAs?: boolean }
  | { readonly name: 'export/encrypted-image' }
  | {
      readonly name: 'import/history' | 'import/bookmarks';
      readonly fileContent: string;
      readonly password: string;
      readonly fileName?: string;
    }
  | { readonly name: 'import/url-review-status'; readonly fileContent: string; readonly fileName?: string }
  | { readonly name: 'import/image'; readonly files: readonly ImportedImageFile[] }
  | { readonly name: 'import/encrypted-image'; readonly files: readonly ImportedEncryptedImageFile[] }
  | { readonly name: 'import/confirm-restore-preview' | 'import/cancel-restore-preview' }
  | {
      readonly name: 'recall/load-complete';
      readonly candidates: readonly RecallCandidate[];
      readonly append: boolean;
      readonly offset: number;
      readonly nextOffset: number;
      readonly hasMore: boolean;
      readonly total: number;
      readonly failedCount: number;
      readonly message: string;
    }
  | { readonly name: 'recall/error'; readonly message: string }
  | { readonly name: 'recall/message-clear'; readonly message: string }
  | { readonly name: 'recall-selection/toggle'; readonly id: string }
  | { readonly name: 'recall/clear-results' }
  | {
      readonly name: 'recall/complete';
      readonly records: readonly ImageDisplayRecord[];
      readonly failedCount: number;
      readonly message: string;
    }
  | { readonly name: 'storage/update'; readonly usage: StorageUsageSummary };
