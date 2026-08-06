import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import { createDisplayRecord, withDurableQueueState, type ImageDisplayRecord } from '../../core/display-records.js';
import type { PanelState } from '../../core/types.js';
import { bookmarkSaveMessage } from './record-export-helpers.js';

export interface ProtectedImageImportLibraryDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  refreshStorageUsage(options?: { readonly render?: boolean }): Promise<void>;
  recentHistoryStore(): RecentHistoryStore | null;
}

export async function addProtectedImportedImageToLibrary(
  deps: ProtectedImageImportLibraryDeps,
  bookmark: ImageDisplayRecord,
): Promise<boolean> {
  const historyDraft = createDisplayRecord({
    ...bookmark,
    id: `${bookmark.capturedAt ?? bookmark.timestamp}:history:${bookmark.id}`,
    source: 'history',
    thumbnail: undefined,
  });
  const historyItem = withDurableQueueState(historyDraft, { ...bookmark, thumbnail: undefined });
  const recentHistoryStore = deps.recentHistoryStore();
  const reviewLimit = deps.getState().reviewingRecentSession
    ? deps.getState().recentHistoryRetainedLimit
    : deps.getState().recentHistoryLimit;
  const history = recentHistoryStore
    ? await recentHistoryStore.add(historyItem, window.location.href, {
        scope: deps.getState().recentHistoryScope,
        includeRetained: deps.getState().reviewingRecentSession,
      })
    : [historyItem, ...deps.getState().history.filter((item) => item.id !== historyItem.id && item.url !== historyItem.url)];
  deps.setState({
    ...deps.getState(),
    history: history.slice(0, reviewLimit),
    message: bookmarkSaveMessage(bookmark, bookmark.label),
    lastUpdatedAt: Date.now(),
  });
  await deps.loadBookmarkPage(0, { render: false });
  deps.renderPanelAndRefreshRecall();
  void deps.refreshStorageUsage({ render: true });
  return true;
}
