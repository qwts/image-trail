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
  | 'bookmark-selection/toggle'
  | 'bookmark-selection/single'
  | 'bookmark-selection/select'
  | 'bookmark-selection/clear'
  | 'gallery/open';

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
    'gallery/open': {
      handle() {
        void deps.openGallery();
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
