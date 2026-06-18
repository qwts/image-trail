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

export interface PanelState {
  readonly visible: boolean;
  readonly status: PanelStatus;
  readonly message: string;
  readonly lastUpdatedAt: number;
  readonly target: TargetState;
  readonly history: readonly ImageDisplayRecord[];
  readonly bookmarks: readonly ImageDisplayRecord[];
}

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
  | 'undo-last';

export type PanelAction =
  | { readonly name: Exclude<PanelActionName, 'history/add-loaded' | 'history/remove' | 'bookmark/load' | 'bookmark/remove'> }
  | { readonly name: 'history/add-loaded'; readonly url: string; readonly title?: string; readonly timestamp?: string }
  | { readonly name: 'history/remove' | 'bookmark/load' | 'bookmark/remove'; readonly id: string };

export interface BookmarkStore {
  readonly load: () => Promise<readonly ImageDisplayRecord[]>;
  readonly save: (record: ImageDisplayRecord) => Promise<ImageDisplayRecord>;
  readonly remove: (record: ImageDisplayRecord) => Promise<void>;
}
