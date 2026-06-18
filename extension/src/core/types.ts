import type { AutomationPhase } from './automation/types.js';
import type { CaptureResult, StorageUsageSummary } from './image/capture-result.js';
import type { ImageDisplayRecord } from './display-records.js';

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
  readonly history: readonly ImageDisplayRecord[];
  readonly bookmarks: readonly ImageDisplayRecord[];
  readonly captureInProgress: boolean;
  readonly captureResult: CaptureResult | null;
  readonly storageUsage: StorageUsageSummary | null;
  readonly automation: AutomationState;
}

export type CaptureSourceType = 'target' | 'history' | 'bookmark';

export type PanelActionName =
  | 'toggle-panel'
  | 'close-panel'
  | 'ping-status'
  | 'start-target-picker'
  | 'stop-target-picker'
  | 'history/add-loaded'
  | 'history/remove'
  | 'bookmark/current'
  | 'bookmark/load'
  | 'bookmark/remove'
  | 'capture/request'
  | 'capture/start'
  | 'capture/complete'
  | 'capture/clear'
  | 'capture/delete'
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
        | 'bookmark/load'
        | 'bookmark/remove'
        | 'capture/request'
        | 'capture/start'
        | 'capture/complete'
        | 'capture/clear'
        | 'capture/delete'
        | 'storage/update'
      >;
    }
  | { readonly name: 'history/add-loaded'; readonly url: string; readonly title?: string; readonly timestamp?: string }
  | { readonly name: 'history/remove' | 'bookmark/load' | 'bookmark/remove'; readonly id: string }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: CaptureSourceType; readonly sourceRecordId?: string }
  | { readonly name: 'capture/start' }
  | { readonly name: 'capture/complete'; readonly result: CaptureResult; readonly sourceRecordId?: string }
  | { readonly name: 'capture/clear' }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string }
  | { readonly name: 'storage/update'; readonly usage: StorageUsageSummary };

export interface BookmarkStore {
  readonly load: () => Promise<readonly ImageDisplayRecord[]>;
  readonly save: (record: ImageDisplayRecord) => Promise<ImageDisplayRecord>;
  readonly remove: (record: ImageDisplayRecord) => Promise<void>;
}
