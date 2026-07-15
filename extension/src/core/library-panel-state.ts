import type { ImageDisplayRecord } from './display-records.js';
import type { QueueDisplayOrder, RecentDisplayOrder } from './display-order.js';
import type { RecentHistoryScope } from './recent-history-scope.js';

export type RecentHistoryOverflowBehavior = 'drop-oldest' | 'keep-session';
export type RecentSparseRowDisplayMode = 'adaptive' | 'full' | 'half' | 'compact';

export interface LibraryPanelState {
  readonly history: readonly ImageDisplayRecord[];
  readonly recentHistoryLimit: number;
  readonly recentHistoryRetainedLimit: number;
  readonly recentHistoryOverflowBehavior: RecentHistoryOverflowBehavior;
  readonly recentSparseRowDisplayMode: RecentSparseRowDisplayMode;
  readonly recentDisplayOrder: RecentDisplayOrder;
  readonly recentHistoryScope: RecentHistoryScope;
  readonly bookmarks: readonly ImageDisplayRecord[];
  readonly bookmarkOffset: number;
  readonly bookmarkLimit: number;
  readonly bookmarkTotal: number;
  readonly bookmarkVisibilityScope: 'global' | 'site';
  readonly queueDisplayOrder: QueueDisplayOrder;
  readonly historySectionOpen: boolean;
  readonly bookmarksSectionOpen: boolean;
  readonly hasOlderBookmarks: boolean;
  readonly hasNewerBookmarks: boolean;
  readonly selectedHistoryIds: readonly string[];
  readonly selectedBookmarkIds: readonly string[];
}
