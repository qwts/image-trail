import type { RecentHistoryAddResult } from '../../content/recent-history-store.js';
import type { PanelState } from '../../core/types.js';

interface RecentHistoryAddResultDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  refreshStorageUsage(options?: { readonly render?: boolean }): Promise<void>;
}

export function stateAfterRecentHistoryAdd(state: PanelState, result: RecentHistoryAddResult): PanelState {
  return {
    ...state,
    history: result.items,
    message: result.autoPinStatus?.message ?? state.message,
    status: result.autoPinStatus ? (result.autoPinStatus.tone === 'error' ? 'error' : 'ready') : state.status,
    lastUpdatedAt: Date.now(),
  };
}

export async function renderRecentHistoryAddResult(deps: RecentHistoryAddResultDeps, result: RecentHistoryAddResult): Promise<void> {
  deps.setState(stateAfterRecentHistoryAdd(deps.getState(), result));
  if ((result.autoPinStatus?.promotedCount ?? 0) === 0) {
    deps.render();
    return;
  }
  await deps.loadBookmarkPage(0, { render: false });
  deps.renderPanelAndRefreshRecall();
  void deps.refreshStorageUsage({ render: true });
}
