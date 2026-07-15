import type { RecentDisplayOrder } from '../../core/display-order.js';
import type { RecentHistoryScope } from '../../core/recent-history-scope.js';
import type { RecentSparseRowDisplayMode } from '../../core/types.js';

export type HistoryAction =
  | { readonly name: 'history/pin'; readonly id: string }
  | { readonly name: 'history/remove'; readonly id: string }
  | { readonly name: 'history/delete-all' }
  | { readonly name: 'history-selection/toggle'; readonly id: string }
  | { readonly name: 'history-selection/select'; readonly ids: readonly string[]; readonly mode?: 'replace' | 'add' }
  | { readonly name: 'history-selection/clear' }
  | { readonly name: 'history/update-display-order'; readonly order: RecentDisplayOrder }
  | { readonly name: 'history/update-scope'; readonly scope: RecentHistoryScope }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'history'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string | undefined }
  | { readonly name: 'panel/history-section-open'; readonly open: boolean }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

export interface HistoryViewOptions {
  readonly blobKeyAvailable: boolean;
  readonly sectionOpen?: boolean;
  readonly collapsible?: boolean;
  readonly listBlockSize: number | null;
  readonly onListResize: (blockSize: number) => void;
  readonly sparseRowDisplayMode: RecentSparseRowDisplayMode;
  readonly displayOrder?: RecentDisplayOrder | undefined;
  readonly privacyMode?: boolean;
  readonly scope?: RecentHistoryScope;
  readonly pageUrl?: string;
}
