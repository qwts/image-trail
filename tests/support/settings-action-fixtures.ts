export const settingsActionFixtures = {
  'settings/update-visible-bookmark-soft-max': { name: 'settings/update-visible-bookmark-soft-max', value: 10 },
  'settings/update-blob-key-inactivity-timeout': { name: 'settings/update-blob-key-inactivity-timeout', value: 10 },
  'settings/update-recent-history-retention': {
    name: 'settings/update-recent-history-retention',
    limit: 20,
    retainedLimit: 40,
    overflowBehavior: 'drop-oldest',
  },
  'settings/update-recent-sparse-row-display-mode': { name: 'settings/update-recent-sparse-row-display-mode', mode: 'compact' },
  'history/update-display-order': { name: 'history/update-display-order', order: 'oldest-first' },
  'history/update-scope': { name: 'history/update-scope', scope: 'all' },
  'history/review-session': { name: 'history/review-session' },
  'history/finish-session-review': { name: 'history/finish-session-review' },
  'bookmarks/update-display-order': { name: 'bookmarks/update-display-order', order: 'back-first' },
  'settings/update-pin-save-storage-preference': { name: 'settings/update-pin-save-storage-preference', value: 'encrypted' },
  'settings/update-privacy-mode': { name: 'settings/update-privacy-mode', enabled: true },
  'settings/update-metadata-policy': {
    name: 'settings/update-metadata-policy',
    policy: { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' },
  },
  'settings/update-build-info-overlay-visibility': { name: 'settings/update-build-info-overlay-visibility', visible: false },
  'settings/update-url-review-status-retention': {
    name: 'settings/update-url-review-status-retention',
    limit: 100,
    clearAfterExport: false,
  },
  'settings/update-backup-reminder': { name: 'settings/update-backup-reminder', enabled: true, intervalDays: 30 },
  'backup-reminder/snooze': { name: 'backup-reminder/snooze' },
  'settings/update-request-throttle': {
    name: 'settings/update-request-throttle',
    minimumIntervalMs: 100,
    maxRequests: 5,
    windowMs: 1000,
  },
  'settings/update-neighbor-preload': {
    name: 'settings/update-neighbor-preload',
    enabled: true,
    radius: 2,
    cacheLimit: 10,
    probeMethod: 'get',
    loadFailureFeedback: 'mute',
  },
  'settings/update-down-arrow-action': { name: 'settings/update-down-arrow-action', value: 'download' },
  'neighbor-preload/manual': { name: 'neighbor-preload/manual', radius: 2, cacheLimit: 10 },
  'settings/reset-panel-position': { name: 'settings/reset-panel-position' },
} as const;

export function settingsActionDeps(record: (name: string) => void, recordAsync: (name: string) => Promise<void>) {
  return {
    updateVisibleBookmarkSoftMax: () => recordAsync('updateVisibleBookmarkSoftMax'),
    updateBlobKeyInactivityTimeout: (value: SessionInactivityTimeoutMinutes) => record(`updateBlobKeyInactivityTimeout:${String(value)}`),
    updateRecentHistoryRetention: () => recordAsync('updateRecentHistoryRetention'),
    updateRecentSparseRowDisplayMode: () => record('updateRecentSparseRowDisplayMode'),
    updateDownArrowAction: (value: string) => record(`updateDownArrowAction:${value}`),
    updatePinSaveStoragePreference: () => record('updatePinSaveStoragePreference'),
    updateUrlReviewStatusRetention: () => recordAsync('updateUrlReviewStatusRetention'),
    updateBackupReminder: () => record('updateBackupReminder'),
    snoozeBackupReminder: () => record('snoozeBackupReminder'),
    updateRequestThrottle: () => record('updateRequestThrottle'),
    updateNeighborPreload: () => record('updateNeighborPreload'),
    preloadMoreNeighbors: () => record('preloadMoreNeighbors'),
    resetPanelPosition: () => recordAsync('resetPanelPosition'),
  };
}
import type { SessionInactivityTimeoutMinutes } from '../../extension/src/core/secure-session-policy.js';
