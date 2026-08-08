import type { ActionEntries, AnyActionDef } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type LibraryActionName =
  | 'pin/current'
  | 'history/remove'
  | 'history/delete-all'
  | 'history/pin'
  | 'bookmark/load'
  | 'bookmark/remove'
  | 'bookmark/clear'
  | 'bookmarks/clear-visible'
  | 'bookmarks/page-front'
  | 'bookmarks/page-back'
  | 'bookmarks/toggle-scope'
  | 'bookmarks/reload'
  | 'bookmarks/refresh-thumbnails'
  | 'bookmarks/delete-visible'
  | 'selection/select-visible'
  | 'history-selection/toggle'
  | 'history-selection/select'
  | 'history-selection/clear'
  | 'history/update-scope'
  | 'history/review-session'
  | 'history/finish-session-review'
  | 'bookmark-selection/toggle'
  | 'bookmark-selection/single'
  | 'bookmark-selection/select'
  | 'bookmark-selection/clear'
  | 'gallery/open';

function clearMatchingCaptureRetry(deps: PanelActionDeps, sourceType: 'history' | 'bookmark', sourceRecordIds?: readonly string[]): void {
  const request = deps.getState().captureRetryRequest;
  if (!request || request.sourceType !== sourceType) return;
  if (sourceRecordIds && (!request.sourceRecordId || !sourceRecordIds.includes(request.sourceRecordId))) return;
  deps.reduce({ name: 'capture/clear' });
}

function updateHistoryScopeAction(deps: PanelActionDeps): ActionEntries<'history/update-scope'>['history/update-scope'] {
  return {
    handle(action) {
      if (deps.getState().recentHistoryScope === action.scope) return;
      deps.reduce(action);
      void deps.loadRecentHistory({ render: false }).then(() => deps.render());
    },
  };
}

function reviewRecentSessionAction(deps: PanelActionDeps, includeRetained: boolean): AnyActionDef {
  return {
    handle(action) {
      if (deps.getState().reviewingRecentSession === includeRetained) return;
      deps.reduce(action);
      void deps.loadRecentHistory({ includeRetained, render: false }).then(() => deps.render());
    },
  };
}

function actionDef(handle: AnyActionDef['handle']): AnyActionDef {
  return { handle };
}

function primaryLibraryActions(deps: PanelActionDeps): Pick<ActionEntries<LibraryActionName>, 'pin/current'> {
  const bookmarkCurrent = actionDef(() => void deps.bookmarkCurrentImage());
  return { 'pin/current': bookmarkCurrent };
}

/** Recent history, bookmarks, and row selection. Bodies moved verbatim from the panel dispatch chain. */
export function buildLibraryActionEntries(deps: PanelActionDeps): ActionEntries<LibraryActionName> {
  const reduceAndRender: AnyActionDef = {
    handle(action) {
      deps.reduce(action);
      deps.render();
    },
  };
  const reduceAndRefreshRecall: AnyActionDef = {
    handle(action) {
      deps.reduce(action);
      deps.renderPanelAndRefreshRecall();
    },
  };
  return {
    ...primaryLibraryActions(deps),
    'history/remove': {
      handle(action) {
        clearMatchingCaptureRetry(deps, 'history', [action.id]);
        void deps.removeRecentHistory(action.id);
      },
    },
    'history/delete-all': {
      handle() {
        clearMatchingCaptureRetry(deps, 'history');
        void deps.deleteRecentHistory();
      },
    },
    'history/update-scope': updateHistoryScopeAction(deps),
    'history/review-session': reviewRecentSessionAction(deps, true),
    'history/finish-session-review': reviewRecentSessionAction(deps, false),
    'history/pin': {
      handle(action) {
        void deps.pinRecentHistory(action.id);
      },
    },
    'bookmark/load': {
      handle(action) {
        void deps.loadBookmark(action.id);
      },
    },
    'bookmark/remove': {
      handle(action) {
        clearMatchingCaptureRetry(deps, 'bookmark', [action.id]);
        void deps.removeBookmark(action.id);
      },
    },
    'gallery/open': {
      handle() {
        void deps.openDestination('gallery');
      },
    },
    'bookmark/clear': reduceAndRefreshRecall,
    'bookmarks/clear-visible': reduceAndRefreshRecall,
    'bookmarks/page-front': {
      handle() {
        const state = deps.getState();
        const delta = state.queueDisplayOrder === 'front-first' ? -state.bookmarkLimit : state.bookmarkLimit;
        void deps.loadBookmarkPage(Math.max(0, state.bookmarkOffset + delta));
      },
    },
    'bookmarks/page-back': {
      handle() {
        const state = deps.getState();
        const delta = state.queueDisplayOrder === 'front-first' ? state.bookmarkLimit : -state.bookmarkLimit;
        void deps.loadBookmarkPage(Math.max(0, state.bookmarkOffset + delta));
      },
    },
    'bookmarks/toggle-scope': {
      handle(action) {
        deps.reduce(action);
        deps.saveLocalSettings({ ...deps.getLocalSettings(), bookmarkVisibilityScope: deps.getState().bookmarkVisibilityScope });
        void deps.loadBookmarkPage(0, { render: false }).then(() => deps.renderPanelAndRefreshRecall());
      },
    },
    'bookmarks/reload': {
      handle() {
        void deps.loadBookmarkPage(0, { render: false }).then(() => deps.renderPanelAndRefreshRecall());
      },
    },
    'bookmarks/refresh-thumbnails': {
      handle() {
        void deps.refreshBookmarkThumbnails();
      },
    },
    'bookmarks/delete-visible': {
      handle() {
        clearMatchingCaptureRetry(
          deps,
          'bookmark',
          deps.getState().bookmarks.map((bookmark) => bookmark.id),
        );
        void deps.deleteVisibleBookmarks();
      },
    },
    'selection/select-visible': reduceAndRender,
    'history-selection/toggle': reduceAndRender,
    'history-selection/select': reduceAndRender,
    'history-selection/clear': reduceAndRender,
    'bookmark-selection/toggle': reduceAndRender,
    'bookmark-selection/single': reduceAndRender,
    'bookmark-selection/select': reduceAndRender,
    'bookmark-selection/clear': reduceAndRender,
  };
}
