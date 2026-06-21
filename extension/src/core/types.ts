import type { AutomationPhase } from './automation/types.js';
import type { CaptureResult, StorageUsageSummary } from './image/capture-result.js';
import type { ImageDisplayRecord } from './display-records.js';
import type { UrlFieldSplitSpec } from './url/types.js';

export type PanelStatus = 'idle' | 'ready' | 'closed' | 'unsupported' | 'error' | 'picking';

export interface TargetState {
  readonly mode: 'auto' | 'manual' | 'none';
  readonly picking: boolean;
  readonly candidateCount: number;
  readonly selectedUrl: string | null;
  readonly selectedHandleId: string | null;
  readonly selectedDimensions: string | null;
  readonly message: string;
}

export interface ImportedImageFile {
  readonly name: string;
  readonly dataUrl: string;
}

export interface AutomationState {
  readonly slideshowPhase: AutomationPhase;
  readonly slideshowCount: number;
  readonly retryPhase: AutomationPhase;
  readonly retriesUsed: number;
  readonly retriesMax: number;
  readonly governorStatus: 'ready' | 'throttled' | 'capped';
  readonly requestsInLastMinute: number;
}

export interface PanelState {
  readonly visible: boolean;
  readonly status: PanelStatus;
  readonly message: string;
  readonly lastUpdatedAt: number;
  readonly target: TargetState;
  readonly draftUrl: string | null;
  readonly history: readonly ImageDisplayRecord[];
  readonly bookmarks: readonly ImageDisplayRecord[];
  readonly bookmarkOffset: number;
  readonly bookmarkLimit: number;
  readonly bookmarkTotal: number;
  readonly bookmarkVisibilityScope: 'global' | 'site';
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
  readonly automation: AutomationState;
  readonly selectedHistoryIds: readonly string[];
  readonly selectedBookmarkIds: readonly string[];
  readonly activeFieldId: string | null;
  readonly failedFieldId: string | null;
  readonly successfulFieldIds: readonly string[];
  readonly unchangedFieldIds: readonly string[];
  readonly unlockedFieldIds: readonly string[];
  readonly manuallyExcludedFieldIds: readonly string[];
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  readonly currentImageFingerprint: string | null;
}

export type CaptureSourceType = 'target' | 'history' | 'bookmark';

export type PanelActionName =
  | 'toggle-panel'
  | 'close-panel'
  | 'start-target-picker'
  | 'stop-target-picker'
  | 'target/release'
  | 'history/add-loaded'
  | 'history/remove'
  | 'history/load'
  | 'history/download'
  | 'history/select'
  | 'history-selection/toggle'
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
  | 'bookmark-selection/clear'
  | 'bookmarks/page-loaded'
  | 'bookmarks/older'
  | 'bookmarks/newer'
  | 'bookmarks/toggle-scope'
  | 'bookmarks/reload'
  | 'bookmarks/refresh-thumbnails'
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
  | 'import/history'
  | 'import/bookmarks'
  | 'import/bookmarklet'
  | 'import/image'
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
        | 'history/select'
        | 'history-selection/toggle'
        | 'history-selection/clear'
        | 'field-value-change'
        | 'field-value-bump'
        | 'selected-url/apply'
        | 'active-field/set'
        | 'field-unlock/toggle'
        | 'field-split/apply'
        | 'field-split/clear'
        | 'bookmark/load'
        | 'bookmark/remove'
        | 'bookmark-selection/toggle'
        | 'bookmark-selection/clear'
        | 'bookmarks/page-loaded'
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
        | 'import/history'
        | 'import/bookmarks'
        | 'import/bookmarklet'
        | 'import/image'
        | 'storage/update'
      >;
    }
  | {
      readonly name: 'history/add-loaded';
      readonly url: string;
      readonly title?: string;
      readonly timestamp?: string;
      readonly thumbnail?: string;
    }
  | { readonly name: 'history/remove' | 'bookmark/load' | 'bookmark/remove' | 'history/select'; readonly id: string }
  | { readonly name: 'history-selection/toggle' | 'bookmark-selection/toggle'; readonly id: string }
  | { readonly name: 'history-selection/clear' | 'bookmark-selection/clear' }
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
  | { readonly name: 'active-field/set'; readonly id: string | null }
  | { readonly name: 'field-unlock/toggle'; readonly id: string }
  | { readonly name: 'field-split/apply'; readonly id: string; readonly pattern: string }
  | { readonly name: 'field-split/clear'; readonly baseFieldId: string }
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
  | { readonly name: 'export/image'; readonly saveAs?: boolean }
  | { readonly name: 'import/history' | 'import/bookmarks'; readonly fileContent: string; readonly password: string }
  | { readonly name: 'import/bookmarklet'; readonly fileContent: string }
  | { readonly name: 'import/image'; readonly files: readonly ImportedImageFile[] }
  | { readonly name: 'storage/update'; readonly usage: StorageUsageSummary };

export interface BookmarkStore {
  readonly load: () => Promise<readonly ImageDisplayRecord[]>;
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
  readonly save: (record: ImageDisplayRecord) => Promise<ImageDisplayRecord>;
  readonly remove: (record: ImageDisplayRecord) => Promise<void>;
}
