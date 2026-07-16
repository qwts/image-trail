import type { PanelDataLoadController } from '../panel-data-load-controller.js';
import type { PanelSettingsController } from '../panel-settings-controller.js';
import type { RecordLibraryController } from '../record-library-controller.js';
import type { PanelActionDeps } from './deps.js';

type LibrarySettingsActionDeps = Pick<
  PanelActionDeps,
  | 'bookmarkCurrentImage'
  | 'removeRecentHistory'
  | 'deleteRecentHistory'
  | 'pinRecentHistory'
  | 'loadBookmark'
  | 'removeBookmark'
  | 'loadBookmarkPage'
  | 'loadRecentHistory'
  | 'refreshBookmarkThumbnails'
  | 'deleteVisibleBookmarks'
  | 'deleteRecallBookmarks'
  | 'updateVisibleBookmarkSoftMax'
  | 'updateRecentHistoryRetention'
  | 'updateRecentSparseRowDisplayMode'
  | 'updateDownArrowAction'
  | 'updatePinSaveStoragePreference'
  | 'updateBlobKeyInactivityTimeout'
  | 'updateUrlReviewStatusRetention'
  | 'updateRequestThrottle'
  | 'updateNeighborPreload'
  | 'preloadMoreNeighbors'
>;

export function createLibrarySettingsActionDeps(input: {
  readonly library: RecordLibraryController;
  readonly dataLoad: PanelDataLoadController;
  readonly settings: PanelSettingsController;
}): LibrarySettingsActionDeps {
  return {
    bookmarkCurrentImage: () => input.library.bookmarkCurrentImage(),
    removeRecentHistory: (id) => input.library.removeRecentHistory(id),
    deleteRecentHistory: () => input.library.deleteRecentHistory(),
    pinRecentHistory: (id) => input.library.pinRecentHistory(id),
    loadBookmark: (id) => input.library.loadBookmark(id),
    removeBookmark: (id) => input.library.removeBookmark(id),
    loadBookmarkPage: (offset, options) => input.dataLoad.loadBookmarkPage(offset, options),
    loadRecentHistory: (options) => input.dataLoad.loadRecentHistory(options),
    refreshBookmarkThumbnails: () => input.library.refreshBookmarkThumbnails(),
    deleteVisibleBookmarks: () => input.library.deleteVisibleBookmarks(),
    deleteRecallBookmarks: () => input.library.deleteRecallBookmarks(),
    updateVisibleBookmarkSoftMax: (value) => input.settings.updateVisibleBookmarkSoftMax(value),
    updateRecentHistoryRetention: (value) => input.settings.updateRecentHistoryRetention(value),
    updateRecentSparseRowDisplayMode: (mode) => input.settings.updateRecentSparseRowDisplayMode(mode),
    updateDownArrowAction: (value) => input.settings.updateDownArrowAction(value),
    updatePinSaveStoragePreference: (value) => input.settings.updatePinSaveStoragePreference(value),
    updateBlobKeyInactivityTimeout: (value) => input.settings.updateBlobKeyInactivityTimeout(value),
    updateUrlReviewStatusRetention: (limit, clearAfterExport) => input.settings.updateUrlReviewStatusRetention(limit, clearAfterExport),
    updateRequestThrottle: (interval, maxRequests, windowMs) => input.settings.updateRequestThrottle(interval, maxRequests, windowMs),
    updateNeighborPreload: (enabled, radius, cacheLimit, probeMethod, feedback) =>
      input.settings.updateNeighborPreload(enabled, radius, cacheLimit, probeMethod, feedback),
    preloadMoreNeighbors: (radius, cacheLimit) => input.settings.preloadMoreNeighbors(radius, cacheLimit),
  };
}
