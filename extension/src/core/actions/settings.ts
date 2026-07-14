import type { PanelState } from '../types.js';
import { BACKUP_HISTORY_LIMIT } from '../cloud/pcloud-provider.js';
import { assertNeverAction } from './routing.js';
import type { PanelActionForDomain } from './routing.js';

type SettingsAction = PanelActionForDomain<'settings'>;

function keepItems(items: readonly string[], allowedItems: readonly string[]): readonly string[] {
  if (items.length === 0) return items;
  const allowed = new Set(allowedItems);
  return items.filter((item) => allowed.has(item));
}

function failedPCloudConnectionState(
  state: PanelState,
  status: Extract<SettingsAction, { readonly name: 'pcloud-backup/upload-error' | 'pcloud-backup/restore-error' }>['status'],
) {
  return status
    ? status.connected
      ? 'connected'
      : 'disconnected'
    : state.pcloudBackup.apiHost
      ? 'connected'
      : state.pcloudBackup.connectionState === 'busy'
        ? 'connected'
        : state.pcloudBackup.connectionState;
}

function pCloudBackupHistoryUpdate(backupHistory: PanelState['pcloudBackup']['backupHistory']) {
  if (backupHistory === undefined) return {};
  const latestBackup = backupHistory[0];
  return {
    backupHistory,
    lastBackupAt: latestBackup?.completedAt,
    lastBackupFileName: latestBackup?.fileName,
    lastBackupSizeBytes: latestBackup?.sizeBytes,
    lastBackupSha256: latestBackup?.sha256,
    lastBackupOriginalCount: undefined,
    lastBackupOriginalBytes: undefined,
    lastBackupMissingOriginalCount: undefined,
  };
}

export function reduceSettingsAction(state: PanelState, action: SettingsAction): PanelState {
  switch (action.name) {
    case 'settings/toggle':
      return {
        ...state,
        activeDestination: state.activeDestination === 'settings' ? null : 'settings',
        helpOpen: false,
        recall: state.activeDestination === 'recall' ? { ...state.recall, selectedIds: [] } : state.recall,
        lastUpdatedAt: Date.now(),
      };
    case 'settings/update-visible-bookmark-soft-max':
      return { ...state, bookmarkLimit: action.value, bookmarkOffset: 0, lastUpdatedAt: Date.now() };
    case 'settings/update-recent-history-retention': {
      const history = state.history.slice(0, action.limit);
      return {
        ...state,
        recentHistoryLimit: action.limit,
        recentHistoryRetainedLimit: action.retainedLimit,
        recentHistoryOverflowBehavior: action.overflowBehavior,
        history,
        selectedHistoryIds: keepItems(
          state.selectedHistoryIds,
          history.map((item) => item.id),
        ),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'settings/update-recent-sparse-row-display-mode':
      return { ...state, recentSparseRowDisplayMode: action.mode, lastUpdatedAt: Date.now() };
    case 'settings/update-pin-save-storage-preference':
      return { ...state, pinSaveStoragePreference: action.value, lastUpdatedAt: Date.now() };
    case 'settings/update-privacy-mode':
      return { ...state, privacyModeEnabled: action.enabled, lastUpdatedAt: Date.now() };
    case 'settings/update-metadata-policy':
      return { ...state, searchableMetadataPolicy: action.policy, lastUpdatedAt: Date.now() };
    case 'settings/update-build-info-overlay-visibility':
      return { ...state, buildInfoOverlayVisible: action.visible, lastUpdatedAt: Date.now() };
    case 'settings/update-url-review-status-retention':
      return {
        ...state,
        urlReviewStatusLimit: action.limit,
        clearUrlReviewStatusAfterExport: action.clearAfterExport,
        lastUpdatedAt: Date.now(),
      };
    case 'settings/update-request-throttle':
      return {
        ...state,
        requestThrottleMs: action.minimumIntervalMs,
        requestThrottleMaxRequests: action.maxRequests,
        requestThrottleWindowMs: action.windowMs,
        lastUpdatedAt: Date.now(),
      };
    case 'settings/update-neighbor-preload':
      return {
        ...state,
        neighborPreloadEnabled: action.enabled,
        neighborPreloadRadius: action.radius,
        neighborPreloadCacheLimit: action.cacheLimit,
        neighborPreloadProbeMethod: action.probeMethod,
        loadFailureFeedback: action.loadFailureFeedback,
        lastUpdatedAt: Date.now(),
      };
    case 'blob-key/status':
      return {
        ...state,
        blobKeyUnlocked: action.unlocked,
        blobKeyAvailable: action.unlocked || action.hasKey === true,
        blobKeyReference: action.unlocked ? (action.keyReference ?? state.blobKeyReference) : null,
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/start':
      return {
        ...state,
        importExportBusy: true,
        importExportMessage: 'Import/export is running...',
        importExportMessageIsError: false,
        importRestorePreview: undefined,
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/complete':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.message,
        importExportMessageIsError: false,
        importRestorePreview: undefined,
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/error':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.message,
        importExportMessageIsError: true,
        importRestorePreview: undefined,
        message: action.message,
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
    case 'import/restore-preview-ready':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.preview.message,
        importExportMessageIsError: action.preview.messageIsError === true,
        importRestorePreview: action.preview,
        message: action.preview.message ?? 'Restore preview loaded.',
        status: action.preview.messageIsError ? 'error' : 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'import/cancel-restore-preview':
      return {
        ...state,
        importExportBusy: false,
        importRestorePreview: undefined,
        importExportMessage: 'Restore preview canceled.',
        importExportMessageIsError: false,
        message: 'Restore preview canceled.',
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/status': {
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: action.status.connected ? 'connected' : 'disconnected',
          apiHost: action.status.apiHost,
          connectedAt: action.status.connectedAt,
          accountPremium: action.status.accountPremium,
          quotaBytes: action.status.quotaBytes,
          usedQuotaBytes: action.status.usedQuotaBytes,
          ...pCloudBackupHistoryUpdate(action.status.backupHistory),
          pendingOperation: undefined,
          message: action.status.message,
          messageIsError: action.status.messageIsError === true,
        },
        lastUpdatedAt: Date.now(),
      };
    }
    case 'pcloud-backup/busy':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'busy',
          pendingOperation: action.pendingOperation,
          message: action.message,
          messageIsError: false,
        },
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/message':
      return {
        ...state,
        pcloudBackup: { ...state.pcloudBackup, message: action.message, messageIsError: false },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/upload-complete':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'connected',
          pendingOperation: undefined,
          apiHost: action.apiHost,
          lastBackupAt: action.historyRecord.completedAt,
          lastBackupFileName: action.historyRecord.fileName,
          lastBackupSizeBytes: action.historyRecord.sizeBytes,
          lastBackupSha256: action.historyRecord.sha256,
          lastBackupOriginalCount: action.originalCount,
          lastBackupOriginalBytes: action.originalBytes,
          lastBackupMissingOriginalCount: action.missingOriginalCount,
          backupHistory: [
            action.historyRecord,
            ...(state.pcloudBackup.backupHistory ?? []).filter(
              (record) => record.completedAt !== action.historyRecord.completedAt || record.sha256 !== action.historyRecord.sha256,
            ),
          ].slice(0, BACKUP_HISTORY_LIMIT),
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/upload-error':
    case 'pcloud-backup/restore-error':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: failedPCloudConnectionState(state, action.status),
          pendingOperation: undefined,
          apiHost: action.status ? action.status.apiHost : state.pcloudBackup.apiHost,
          connectedAt: action.status ? action.status.connectedAt : state.pcloudBackup.connectedAt,
          accountPremium: action.status ? action.status.accountPremium : state.pcloudBackup.accountPremium,
          quotaBytes: action.status ? action.status.quotaBytes : state.pcloudBackup.quotaBytes,
          usedQuotaBytes: action.status ? action.status.usedQuotaBytes : state.pcloudBackup.usedQuotaBytes,
          message: action.message,
          messageIsError: true,
        },
        message: action.message,
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/restore-candidates-loaded':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'connected',
          pendingOperation: undefined,
          apiHost: action.apiHost,
          restoreCandidates: action.candidates,
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/restore-downloaded':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'connected',
          pendingOperation: undefined,
          apiHost: action.apiHost,
          lastRestoreFileName: action.fileName,
          lastRestoreSizeBytes: action.sizeBytes,
          lastRestoreSha256: action.sha256,
          lastRestoreDownloadedAt: action.downloadedAt,
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/error':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'error',
          pendingOperation: undefined,
          message: action.message,
          messageIsError: true,
        },
        message: action.message,
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
    case 'storage/update':
      return { ...state, storageUsage: action.usage, lastUpdatedAt: Date.now() };
    case 'settings/reset-panel-position':
    case 'settings/update-workspace-layout-restore':
    case 'settings/reset-workspace-layout':
    case 'neighbor-preload/manual':
    case 'blob-key/setup':
    case 'blob-key/unlock':
    case 'blob-key/clear':
    case 'blob-key/export':
    case 'blob-key/import':
    case 'cloud-backup/connect':
    case 'cloud-backup/backup-now':
    case 'cloud-backup/choose-restore':
    case 'cloud-backup/preview-restore':
    case 'cloud-backup/retry':
    case 'cloud-backup/disconnect':
    case 'export/history':
    case 'export/bookmarks':
    case 'export/image':
    case 'export/encrypted-image':
    case 'export/url-review-status':
    case 'clear/url-review-status':
    case 'import/history':
    case 'import/bookmarks':
    case 'import/image':
    case 'import/encrypted-image':
    case 'import/url-review-status':
    case 'import/confirm-restore-preview':
      return state;
    default:
      return assertNeverAction(action);
  }
}
