import { createDisplayRecord } from '../display-records.js';
import { isCapturedResult } from '../image/capture-result.js';
import type { PanelState } from '../types.js';
import {
  clearRecordCapture,
  removeRecallCandidate,
  syncHistoryWithBookmarks,
  unlinkHistoryFromBookmark,
  updateRecordCapture,
  updateRecordPinned,
} from './queue-record-transitions.js';
import { assertNeverAction } from './routing.js';
import type { PanelActionForDomain } from './routing.js';

type QueueRecentsAction = PanelActionForDomain<'queue-recents'>;

function toggleItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}
function addItems(items: readonly string[], additions: readonly string[]): readonly string[] {
  if (additions.length === 0) return items;
  const next = [...items];
  for (const item of additions) if (!next.includes(item)) next.push(item);
  return next;
}
function uniqueItems(items: readonly string[]): readonly string[] {
  return [...new Set(items)];
}
function removeItem(items: readonly string[], item: string): readonly string[] {
  return items.filter((value) => value !== item);
}
function keepItems(items: readonly string[], allowedItems: readonly string[]): readonly string[] {
  if (items.length === 0) return items;
  const allowed = new Set(allowedItems);
  return items.filter((item) => allowed.has(item));
}
function mergeRecordsById<T extends { readonly id: string }>(existing: readonly T[], additions: readonly T[]): readonly T[] {
  if (additions.length === 0) return existing;
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...additions.filter((item) => !seen.has(item.id))];
}
export function reduceQueueRecentsAction(state: PanelState, action: QueueRecentsAction): PanelState {
  switch (action.name) {
    case 'history/add-loaded': {
      const existing = state.history.find((entry) => entry.url === action.url);
      const item = createDisplayRecord({
        ...existing,
        url: action.url,
        title: action.title ?? existing?.title,
        timestamp: action.timestamp,
        thumbnail: action.thumbnail ?? existing?.thumbnail,
        width: action.width ?? existing?.width,
        height: action.height ?? existing?.height,
        source: 'history',
      });
      const history = [item, ...state.history.filter((entry) => entry.url !== item.url && entry.id !== item.id)].slice(
        0,
        state.recentHistoryLimit,
      );
      return {
        ...state,
        history,
        selectedHistoryIds: keepItems(
          state.selectedHistoryIds,
          history.map((entry) => entry.id),
        ),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'history/remove':
      return {
        ...state,
        history: state.history.filter((item) => item.id !== action.id),
        selectedHistoryIds: removeItem(state.selectedHistoryIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'history/mark-pinned':
      return {
        ...state,
        history: updateRecordPinned(state.history, action.id, action.pinnedAt, action.pinnedRecordId),
        lastUpdatedAt: Date.now(),
      };
    case 'history/delete-all':
      return { ...state, history: [], selectedHistoryIds: [], lastUpdatedAt: Date.now() };
    case 'selection/select-visible':
      return {
        ...state,
        selectedHistoryIds: state.history.map((item) => item.id),
        selectedBookmarkIds: state.bookmarks.map((item) => item.id),
        recall: { ...state.recall, selectedIds: state.recall.open ? state.recall.candidates.map((candidate) => candidate.id) : [] },
        lastUpdatedAt: Date.now(),
      };
    case 'history-selection/toggle':
      return { ...state, selectedHistoryIds: toggleItem(state.selectedHistoryIds, action.id), lastUpdatedAt: Date.now() };
    case 'history-selection/select':
      return {
        ...state,
        selectedHistoryIds: action.mode === 'add' ? addItems(state.selectedHistoryIds, action.ids) : uniqueItems(action.ids),
        lastUpdatedAt: Date.now(),
      };
    case 'history-selection/clear':
      return { ...state, selectedHistoryIds: [], lastUpdatedAt: Date.now() };
    case 'recall/open':
      return {
        ...state,
        recall: { ...state.recall, open: true, side: action.side, message: undefined, messageIsError: false },
        lastUpdatedAt: Date.now(),
      };
    case 'recall/close':
      return { ...state, recall: { ...state.recall, open: false, selectedIds: [] }, lastUpdatedAt: Date.now() };
    case 'recall/load-start':
      return {
        ...state,
        recall: { ...state.recall, busy: true, message: 'Loading recall records...', messageIsError: false },
        lastUpdatedAt: Date.now(),
      };
    case 'recall/load-complete': {
      const candidates = action.append ? mergeRecordsById(state.recall.candidates, action.candidates) : action.candidates;
      return {
        ...state,
        recall: {
          ...state.recall,
          busy: false,
          candidates,
          selectedIds: keepItems(
            state.recall.selectedIds,
            candidates.map((candidate) => candidate.id),
          ),
          offset: action.offset,
          nextOffset: action.nextOffset,
          hasMore: action.hasMore,
          total: action.total,
          failedCount: action.failedCount,
          message: action.message,
          messageIsError: false,
        },
        lastUpdatedAt: Date.now(),
      };
    }
    case 'recall/error':
      return {
        ...state,
        recall: { ...state.recall, busy: false, message: action.message, messageIsError: true },
        status: 'error',
        message: action.message,
        lastUpdatedAt: Date.now(),
      };
    case 'recall/message-clear':
      if (state.recall.message !== action.message || state.recall.messageIsError) return state;
      return { ...state, recall: { ...state.recall, message: undefined, messageIsError: false }, lastUpdatedAt: Date.now() };
    case 'recall-selection/toggle':
      return {
        ...state,
        recall: { ...state.recall, selectedIds: toggleItem(state.recall.selectedIds, action.id) },
        lastUpdatedAt: Date.now(),
      };
    case 'recall-selection/select':
      return {
        ...state,
        recall: {
          ...state.recall,
          selectedIds: action.mode === 'add' ? addItems(state.recall.selectedIds, action.ids) : uniqueItems(action.ids),
        },
        lastUpdatedAt: Date.now(),
      };
    case 'recall-selection/clear':
      return { ...state, recall: { ...state.recall, selectedIds: [] }, lastUpdatedAt: Date.now() };
    case 'recall/clear-results':
      return {
        ...state,
        recall: {
          ...state.recall,
          candidates: [],
          selectedIds: [],
          offset: 0,
          nextOffset: 0,
          hasMore: false,
          total: 0,
          failedCount: 0,
          message: undefined,
          messageIsError: false,
        },
        lastUpdatedAt: Date.now(),
      };
    case 'recall/complete':
      return {
        ...state,
        recall: {
          ...state.recall,
          busy: false,
          selectedIds: [],
          message: action.message,
          messageIsError: action.records.length === 0 || action.failedCount > 0,
        },
        status: action.records.length === 0 ? 'error' : 'ready',
        message: action.message,
        lastUpdatedAt: Date.now(),
      };
    case 'pin/current':
    case 'bookmark/current': {
      if (!state.target.selectedUrl) return state;
      const bookmarks = [
        {
          id: state.target.selectedUrl,
          url: state.target.selectedUrl,
          label: state.target.selectedUrl,
          timestamp: new Date().toISOString(),
          source: 'bookmark' as const,
        },
        ...state.bookmarks.filter((item) => item.url !== state.target.selectedUrl),
      ];
      return {
        ...state,
        bookmarks,
        selectedBookmarkIds: keepItems(
          state.selectedBookmarkIds,
          bookmarks.map((item) => item.id),
        ),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'bookmark/load': {
      const bookmark = state.bookmarks.find((item) => item.id === action.id);
      return bookmark ? { ...state, message: `Loaded bookmark: ${bookmark.url}`, lastUpdatedAt: Date.now() } : state;
    }
    case 'bookmark/remove':
      return {
        ...state,
        bookmarks: state.bookmarks.filter((item) => item.id !== action.id),
        history: unlinkHistoryFromBookmark(state.history, action.id),
        recall: removeRecallCandidate(state.recall, action.id),
        selectedBookmarkIds: removeItem(state.selectedBookmarkIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmark/clear':
      return {
        ...state,
        bookmarks: state.bookmarks.filter((item) => item.id !== action.id),
        selectedBookmarkIds: removeItem(state.selectedBookmarkIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmark-selection/toggle':
      return { ...state, selectedBookmarkIds: toggleItem(state.selectedBookmarkIds, action.id), lastUpdatedAt: Date.now() };
    case 'bookmark-selection/single':
      return { ...state, selectedBookmarkIds: [action.id], selectedHistoryIds: [], lastUpdatedAt: Date.now() };
    case 'bookmark-selection/clear':
      return { ...state, selectedBookmarkIds: [], lastUpdatedAt: Date.now() };
    case 'bookmark-selection/select':
      return {
        ...state,
        selectedBookmarkIds: action.mode === 'add' ? addItems(state.selectedBookmarkIds, action.ids) : uniqueItems(action.ids),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/page-loaded':
      return {
        ...state,
        bookmarks: action.bookmarks,
        history: syncHistoryWithBookmarks(state.history, action.bookmarks),
        selectedBookmarkIds: keepItems(
          state.selectedBookmarkIds,
          action.bookmarks.map((bookmark) => bookmark.id),
        ),
        bookmarkOffset: action.offset,
        bookmarkLimit: action.limit,
        bookmarkTotal: action.total,
        hasOlderBookmarks: action.hasOlder,
        hasNewerBookmarks: action.hasNewer,
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/toggle-scope':
      return {
        ...state,
        bookmarkVisibilityScope: state.bookmarkVisibilityScope === 'global' ? 'site' : 'global',
        bookmarkOffset: 0,
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/update-display-order':
      return { ...state, queueDisplayOrder: action.order, bookmarkOffset: 0, lastUpdatedAt: Date.now() };
    case 'history/update-display-order':
      return { ...state, recentDisplayOrder: action.order, lastUpdatedAt: Date.now() };
    case 'capture/start':
      return {
        ...state,
        captureInProgress: true,
        captureResult: null,
        captureRetryRequest: action.request ?? null,
        lastUpdatedAt: Date.now(),
      };
    case 'capture/complete': {
      const now = new Date();
      const retryable =
        (action.result.status === 'failed' || action.result.status === 'remote-only') && action.result.reason === 'permission-needed';
      const updated = {
        ...state,
        captureInProgress: false,
        captureResult: action.result,
        captureRetryRequest: retryable ? state.captureRetryRequest : null,
        lastUpdatedAt: now.getTime(),
      };
      if (!isCapturedResult(action.result) || !action.sourceRecordId) return updated;
      const capturedAt = now.toISOString();
      return {
        ...updated,
        history: updateRecordCapture(updated.history, action.sourceRecordId, action.result, capturedAt),
        bookmarks: updateRecordCapture(updated.bookmarks, action.sourceRecordId, action.result, capturedAt),
        message: `Captured ${(action.result.byteLength / 1024).toFixed(1)} KB image.`,
      };
    }
    case 'capture/clear':
      return { ...state, captureResult: null, captureRetryRequest: null, lastUpdatedAt: Date.now() };
    case 'capture/delete':
      return {
        ...state,
        history: clearRecordCapture(state.history, action.id, action.blobId),
        bookmarks: clearRecordCapture(state.bookmarks, action.id, action.blobId),
        recall: { ...state.recall, candidates: clearRecordCapture(state.recall.candidates, action.id, action.blobId) },
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/clear-visible': {
      const visibleIds = state.bookmarks.map((bookmark) => bookmark.id);
      return {
        ...state,
        bookmarks: [],
        selectedBookmarkIds: state.selectedBookmarkIds.filter((id) => !visibleIds.includes(id)),
        bookmarkOffset: 0,
        bookmarkTotal: 0,
        hasOlderBookmarks: false,
        hasNewerBookmarks: false,
        lastUpdatedAt: Date.now(),
      };
    }
    case 'history/pin':
    case 'history/load':
    case 'history/download':
    case 'history/select':
    case 'gallery/open':
    case 'bookmarks/page-front':
    case 'bookmarks/page-back':
    case 'bookmarks/reload':
    case 'bookmarks/refresh-thumbnails':
    case 'bookmarks/delete-visible':
    case 'capture/request':
    case 'capture/cleanup-orphans':
    case 'capture/preview':
    case 'recall/load-more':
    case 'recall/selected':
    case 'recall/delete-all':
      return state;
    default:
      return assertNeverAction(action);
  }
}
