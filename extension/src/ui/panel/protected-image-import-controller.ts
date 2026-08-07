import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import { createDisplayRecord, withDurableQueueState, type ImageDisplayRecord } from '../../core/display-records.js';
import type { PanelState } from '../../core/types.js';
import { bookmarkSaveMessage } from './record-export-helpers.js';
import { recentHistoryAfterMutation, recentHistoryMutationProjection } from './recent-history-mutation-projection.js';

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
  const stateBeforeHistoryAdd = deps.getState();
  const historyProjection = recentHistoryMutationProjection(stateBeforeHistoryAdd);
  const reviewLimit = historyProjection.includeRetained
    ? stateBeforeHistoryAdd.recentHistoryRetainedLimit
    : stateBeforeHistoryAdd.recentHistoryLimit;
  const history = recentHistoryStore
    ? await recentHistoryStore.add(historyItem, window.location.href, {
        ...historyProjection,
      })
    : { items: [historyItem, ...deps.getState().history.filter((item) => item.id !== historyItem.id && item.url !== historyItem.url)] };
  deps.setState({
    ...deps.getState(),
    history: recentHistoryAfterMutation(deps.getState(), historyProjection, history.items, reviewLimit),
    message: bookmarkSaveMessage(bookmark, bookmark.label),
    lastUpdatedAt: Date.now(),
  });
  await deps.loadBookmarkPage(0, { render: false });
  deps.renderPanelAndRefreshRecall();
  void deps.refreshStorageUsage({ render: true });
  return true;
}
