import type { ActionEntries, AnyActionDef } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type LibraryActionName =
  | 'pin/current'
  | 'bookmark/current'
  | 'history/remove'
  | 'history/delete-all'
  | 'history/pin'
  | 'bookmark/load'
  | 'bookmark/remove'
  | 'bookmark/clear'
  | 'bookmarks/clear-visible'
  | 'bookmarks/older'
  | 'bookmarks/newer'
  | 'bookmarks/toggle-scope'
  | 'bookmarks/reload'
  | 'bookmarks/refresh-thumbnails'
  | 'bookmarks/delete-visible'
  | 'selection/select-visible'
  | 'history-selection/toggle'
  | 'history-selection/select'
  | 'history-selection/clear'
  | 'bookmark-selection/toggle'
  | 'bookmark-selection/single'
  | 'bookmark-selection/select'
  | 'bookmark-selection/clear';

/** Recent history, bookmarks, and row selection. Bodies moved verbatim from the panel dispatch chain. */
export function buildLibraryActionEntries(deps: PanelActionDeps): ActionEntries<LibraryActionName> {
  const bookmarkCurrent: AnyActionDef = {
    handle() {
      void deps.bookmarkCurrentImage();
    },
  };
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
    'pin/current': bookmarkCurrent,
    'bookmark/current': bookmarkCurrent,
    'history/remove': {
      handle(action) {
        void deps.removeRecentHistory(action.id);
      },
    },
    'history/delete-all': {
      handle() {
        void deps.deleteRecentHistory();
      },
    },
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
        void deps.removeBookmark(action.id);
      },
    },
    'bookmark/clear': reduceAndRefreshRecall,
    'bookmarks/clear-visible': reduceAndRefreshRecall,
    'bookmarks/older': {
      handle() {
        void deps.loadBookmarkPage(deps.getState().bookmarkOffset + deps.getState().bookmarkLimit);
      },
    },
    'bookmarks/newer': {
      handle() {
        void deps.loadBookmarkPage(Math.max(0, deps.getState().bookmarkOffset - deps.getState().bookmarkLimit));
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
