import type { AutomationPhase } from './automation/types.js';
import type { CaptureResult, StorageUsageSummary } from './image/capture-result.js';
import type { ImageDisplayRecord } from './display-records.js';
import type { GrabSourcePattern, UrlTemplateMatchMode, UrlTemplateRecord } from './url/templates.js';
import type { UrlTemplateGrabStrategy } from './url/grab-strategies.js';
import type { UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from './url/types.js';
import type { ObjectFitMode } from './preview-style.js';

export type PanelStatus = 'idle' | 'ready' | 'closed' | 'unsupported' | 'error' | 'picking';
export type PinSaveStoragePreference = 'encrypted' | 'plaintext';
export type RecentHistoryOverflowBehavior = 'drop-oldest' | 'keep-session';

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

export interface ImportedImageFile {
  readonly name: string;
  readonly dataUrl: string;
}

export interface ImportedEncryptedImageFile {
  readonly name: string;
  readonly fileContent: string;
}

export interface AutomationState {
  readonly slideshowPhase: AutomationPhase;
  readonly slideshowCount: number;
  readonly retryPhase: AutomationPhase;
  readonly retriesUsed: number;
  readonly retriesMax: number;
  readonly governorStatus: 'ready' | 'throttled' | 'capped';
  readonly requestsInWindow: number;
}

export type RecallDrawerSide = 'left' | 'right';

export interface PanelPosition {
  readonly left: number;
  readonly top: number;
}

export interface PanelPositionStore {
  load(hostname: string): Promise<PanelPosition | null>;
  save(hostname: string, position: PanelPosition): Promise<void>;
  remove(hostname: string): Promise<void>;
}

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
  readonly fieldDigitWidthSpecs?: readonly UrlFieldDigitWidthSpec[];
  readonly activeUrlTemplateId: string | null;
  readonly updatedAt: string;
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
  readonly reason?: string;
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
  readonly open: boolean;
  readonly busy: boolean;
  readonly side: RecallDrawerSide;
  readonly candidates: readonly RecallCandidate[];
  readonly selectedIds: readonly string[];
  readonly offset: number;
  readonly nextOffset: number;
  readonly hasMore: boolean;
  readonly total: number;
  readonly failedCount: number;
  readonly message?: string;
  readonly messageIsError?: boolean;
}

export interface PanelState {
  readonly visible: boolean;
  readonly minimized: boolean;
  readonly status: PanelStatus;
  readonly message: string;
  readonly lastUpdatedAt: number;
  readonly target: TargetState;
  readonly draftUrl: string | null;
  readonly history: readonly ImageDisplayRecord[];
  readonly recentHistoryLimit: number;
  readonly recentHistoryOverflowBehavior: RecentHistoryOverflowBehavior;
  readonly bookmarks: readonly ImageDisplayRecord[];
  readonly bookmarkOffset: number;
  readonly bookmarkLimit: number;
  readonly bookmarkTotal: number;
  readonly bookmarkVisibilityScope: 'global' | 'site';
  readonly pinSaveStoragePreference: PinSaveStoragePreference;
  readonly privacyModeEnabled: boolean;
  readonly urlReviewStatusLimit: number;
  readonly clearUrlReviewStatusAfterExport: boolean;
  readonly requestThrottleMs: number;
  readonly requestThrottleMaxRequests: number;
  readonly requestThrottleWindowMs: number;
  readonly neighborPreloadEnabled: boolean;
  readonly neighborPreloadRadius: number;
  readonly neighborPreloadCacheLimit: number;
  readonly hasOlderBookmarks: boolean;
  readonly hasNewerBookmarks: boolean;
  readonly captureInProgress: boolean;
  readonly captureResult: CaptureResult | null;
  readonly storageUsage: StorageUsageSummary | null;
  readonly blobKeyUnlocked: boolean;
  readonly blobKeyAvailable: boolean;
  readonly blobKeyReference: string | null;
  readonly importExportBusy: boolean;
  readonly importExportMessage?: string;
  readonly importExportMessageIsError?: boolean;
  readonly settingsOpen: boolean;
  readonly automation: AutomationState;
  readonly recall: RecallState;
  readonly selectedHistoryIds: readonly string[];
  readonly selectedBookmarkIds: readonly string[];
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[];
  readonly urlTemplates: readonly UrlTemplateRecord[];
  readonly grabSourcePatterns: readonly GrabSourcePattern[];
  readonly activeUrlTemplateId: string | null;
  readonly currentImageFingerprint: string | null;
}

export type CaptureSourceType = 'target' | 'history' | 'bookmark';

export type PanelActionName =
  | 'toggle-panel'
  | 'close-panel'
  | 'panel/minimize'
  | 'panel/expand'
  | 'start-target-picker'
  | 'stop-target-picker'
  | 'grab-mode/start'
  | 'grab-mode/stop'
  | 'target/fill-screen'
  | 'target/set-object-fit'
  | 'target/release'
  | 'history/add-loaded'
  | 'history/remove'
  | 'history/pin'
  | 'history/mark-pinned'
  | 'history/delete-all'
  | 'history/load'
  | 'history/download'
  | 'history/select'
  | 'selection/select-visible'
  | 'history-selection/toggle'
  | 'history-selection/select'
  | 'history-selection/clear'
  | 'active-field/set'
  | 'field-unlock/toggle'
  | 'field-split/apply'
  | 'field-split/clear'
  | 'field-value-change'
  | 'field-value-bump'
  | 'selected-url/apply'
  | 'bookmark/current'
  | 'bookmark/load'
  | 'bookmark/remove'
  | 'bookmark-selection/toggle'
  | 'bookmark-selection/single'
  | 'bookmark-selection/select'
  | 'bookmark-selection/clear'
  | 'bookmarks/page-loaded'
  | 'bookmarks/older'
  | 'bookmarks/newer'
  | 'bookmarks/toggle-scope'
  | 'bookmarks/reload'
  | 'bookmarks/refresh-thumbnails'
  | 'settings/toggle'
  | 'settings/update-visible-bookmark-soft-max'
  | 'settings/update-recent-history-retention'
  | 'settings/update-pin-save-storage-preference'
  | 'settings/update-privacy-mode'
  | 'settings/update-url-review-status-retention'
  | 'settings/update-request-throttle'
  | 'settings/update-neighbor-preload'
  | 'neighbor-preload/manual'
  | 'settings/reset-panel-position'
  | 'url-templates/load'
  | 'url-template/remove'
  | 'url-template/update-settings'
  | 'url-template/update-fields'
  | 'grab-source-patterns/load'
  | 'grab-source-pattern/remove'
  | 'grab-source-pattern/update-settings'
  | 'parsed-field-state/restore'
  | 'capture/request'
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
  | 'export/history'
  | 'export/bookmarks'
  | 'export/image'
  | 'export/encrypted-image'
  | 'import/history'
  | 'import/bookmarks'
  | 'import/bookmarklet'
  | 'import/image'
  | 'import/encrypted-image'
  | 'recall/open'
  | 'recall/close'
  | 'recall/load-start'
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
        | 'selection/select-visible'
        | 'history-selection/toggle'
        | 'history-selection/select'
        | 'history-selection/clear'
        | 'field-value-change'
        | 'field-value-bump'
        | 'selected-url/apply'
        | 'target/fill-screen'
        | 'target/set-object-fit'
        | 'active-field/set'
        | 'field-unlock/toggle'
        | 'field-split/apply'
        | 'field-split/clear'
        | 'field-digit-width/change'
        | 'bookmark/load'
        | 'bookmark/remove'
        | 'bookmark-selection/toggle'
        | 'bookmark-selection/single'
        | 'bookmark-selection/select'
        | 'bookmark-selection/clear'
        | 'bookmarks/page-loaded'
        | 'settings/update-visible-bookmark-soft-max'
        | 'settings/update-recent-history-retention'
        | 'settings/update-pin-save-storage-preference'
        | 'settings/update-privacy-mode'
        | 'settings/update-url-review-status-retention'
        | 'settings/update-request-throttle'
        | 'settings/update-neighbor-preload'
        | 'neighbor-preload/manual'
        | 'url-templates/load'
        | 'url-template/remove'
        | 'url-template/update-settings'
        | 'url-template/update-fields'
        | 'grab-source-patterns/load'
        | 'grab-source-pattern/remove'
        | 'grab-source-pattern/update-settings'
        | 'parsed-field-state/restore'
        | 'capture/request'
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
        | 'export/history'
        | 'export/bookmarks'
        | 'export/image'
        | 'export/encrypted-image'
        | 'import/history'
        | 'import/bookmarks'
        | 'import/bookmarklet'
        | 'import/image'
        | 'import/encrypted-image'
        | 'recall/open'
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
      readonly title?: string;
      readonly timestamp?: string;
      readonly thumbnail?: string;
      readonly width?: number;
      readonly height?: number;
    }
  | {
      readonly name: 'history/remove' | 'history/pin' | 'bookmark/load' | 'bookmark/remove' | 'bookmark/clear' | 'history/select';
      readonly id: string;
    }
  | { readonly name: 'history/mark-pinned'; readonly id: string; readonly pinnedAt: string; readonly pinnedRecordId: string }
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
  | { readonly name: 'history/load' | 'history/download' }
  | { readonly name: 'settings/update-visible-bookmark-soft-max'; readonly value: number }
  | {
      readonly name: 'settings/update-recent-history-retention';
      readonly limit: number;
      readonly overflowBehavior: RecentHistoryOverflowBehavior;
    }
  | { readonly name: 'settings/update-pin-save-storage-preference'; readonly value: PinSaveStoragePreference }
  | { readonly name: 'settings/update-privacy-mode'; readonly enabled: boolean }
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
    }
  | { readonly name: 'neighbor-preload/manual'; readonly radius: number; readonly cacheLimit: number }
  | { readonly name: 'url-templates/load'; readonly templates: readonly UrlTemplateRecord[]; readonly activeTemplateId?: string | null }
  | { readonly name: 'url-template/remove'; readonly id: string }
  | {
      readonly name: 'url-template/update-settings';
      readonly id: string;
      readonly matchMode?: UrlTemplateMatchMode;
      readonly hideExcludedFields?: boolean;
      readonly autoApplyEnabled?: boolean;
      readonly grabStrategy?: UrlTemplateGrabStrategy | null;
    }
  | { readonly name: 'url-template/update-fields'; readonly id: string; readonly includedFieldIds: readonly string[] }
  | { readonly name: 'grab-source-patterns/load'; readonly patterns: readonly GrabSourcePattern[] }
  | { readonly name: 'grab-source-pattern/remove'; readonly id: string }
  | {
      readonly name: 'grab-source-pattern/update-settings';
      readonly id: string;
      readonly matchMode?: UrlTemplateMatchMode;
      readonly grabStrategy?: UrlTemplateGrabStrategy | null;
    }
  | { readonly name: 'parsed-field-state/restore'; readonly record: ParsedFieldStateRecord }
  | { readonly name: 'active-field/set'; readonly id: string | null }
  | { readonly name: 'target/fill-screen'; readonly enabled: boolean }
  | { readonly name: 'target/set-object-fit'; readonly mode: ObjectFitMode }
  | { readonly name: 'field-unlock/toggle'; readonly id: string }
  | { readonly name: 'field-split/apply'; readonly id: string; readonly pattern: string }
  | { readonly name: 'field-split/clear'; readonly baseFieldId: string }
  | { readonly name: 'field-digit-width/change'; readonly id: string; readonly value: string }
  | { readonly name: 'field-value-change'; readonly id: string; readonly value: string }
  | { readonly name: 'field-value-bump'; readonly id: string; readonly delta: 1 | -1 }
  | { readonly name: 'selected-url/apply'; readonly url: string }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: CaptureSourceType; readonly sourceRecordId?: string }
  | { readonly name: 'capture/start' }
  | { readonly name: 'capture/complete'; readonly result: CaptureResult; readonly sourceRecordId?: string }
  | { readonly name: 'capture/clear' }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string }
  | { readonly name: 'capture/cleanup-orphans' }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string; readonly scrollAnchorId?: string }
  | { readonly name: 'blob-key/setup' | 'blob-key/unlock'; readonly password: string }
  | { readonly name: 'blob-key/clear' }
  | { readonly name: 'blob-key/export'; readonly password: string }
  | { readonly name: 'blob-key/import'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'blob-key/status'; readonly unlocked: boolean; readonly keyReference?: string | null; readonly hasKey?: boolean }
  | { readonly name: 'import-export/complete'; readonly message: string }
  | { readonly name: 'import-export/error'; readonly message: string }
  | { readonly name: 'export/history' | 'export/bookmarks'; readonly password: string; readonly plaintext: boolean }
  | { readonly name: 'export/url-review-status' }
  | { readonly name: 'clear/url-review-status'; readonly scope?: 'hostname' | 'page' | 'source' | 'all' }
  | { readonly name: 'export/image'; readonly saveAs?: boolean }
  | { readonly name: 'export/encrypted-image' }
  | { readonly name: 'import/history' | 'import/bookmarks'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/url-review-status'; readonly fileContent: string }
  | { readonly name: 'import/bookmarklet'; readonly fileContent: string }
  | { readonly name: 'import/image'; readonly files: readonly ImportedImageFile[] }
  | { readonly name: 'import/encrypted-image'; readonly files: readonly ImportedEncryptedImageFile[] }
  | { readonly name: 'recall/open'; readonly side: RecallDrawerSide }
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

export interface BookmarkStore {
  readonly load: () => Promise<readonly ImageDisplayRecord[]>;
  readonly loadOriginalBlobIds: () => Promise<ReadonlySet<string>>;
  readonly loadPage: (input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }) => Promise<{
    readonly items: readonly ImageDisplayRecord[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  }>;
  readonly loadByIds: (ids: readonly string[]) => Promise<readonly ImageDisplayRecord[]>;
  readonly save: (record: ImageDisplayRecord) => Promise<ImageDisplayRecord>;
  readonly saveResult?: (
    record: ImageDisplayRecord,
  ) => Promise<{ readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string }>;
  readonly remove: (record: ImageDisplayRecord) => Promise<void>;
  readonly removeMany: (ids: readonly string[]) => Promise<{ readonly removedCount: number }>;
  readonly removeRecallPage: (input: {
    readonly offset: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }) => Promise<{ readonly removedCount: number }>;
}
