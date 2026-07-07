import type { PanelAction, PanelState } from '../core/types.js';
import type { UrlField } from '../core/url/types.js';
import { createEncryptionView } from './components/encryption-view.js';
import {
  createCloudBackupView,
  createImageTransferView,
  createImportExportView,
  type CloudBackupProviderState,
  type ImportExportViewState,
} from './components/import-export-view.js';
import { createSettingsView } from './components/settings-view.js';
import { formatCloudBackupBytes } from './panel/record-export-helpers.js';
import { recallDeleteCountForQueue } from './recall-delete-count.js';

/** URL derivation the Settings surface needs from the render pass (template learning fields). */
export interface SettingsUrlContext {
  readonly fields: readonly UrlField[];
  readonly activeTemplateId: string | null;
}

/**
 * Assembles the full Settings section (settings groups + encryption/transfer/cloud-backup/
 * import-export utility children) from panel state. Shared by the attached panel path and the
 * detached-window renderer so Settings behaves identically in both hosts.
 */
export function createSettingsSection(
  state: PanelState,
  urlContext: SettingsUrlContext,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const importExportState: ImportExportViewState = {
    busy: state.importExportBusy,
    currentImageUrl: state.target.selectedUrl,
    selectedHistoryCount: state.selectedHistoryIds.length,
    selectedBookmarkCount: state.selectedBookmarkIds.length + state.recall.selectedIds.length,
    selectedImageDownloadCount: selectedRecordCount(state),
    visibleImageSelectionCount: visibleImageSelectionCount(state),
    imageDownloadAvailable:
      state.selectedHistoryIds.length + state.selectedBookmarkIds.length + state.recall.selectedIds.length > 0 ||
      !!state.target.selectedUrl ||
      state.history.length > 0,
    encryptedImageTransferAvailable:
      state.blobKeyUnlocked &&
      (state.selectedHistoryIds.length + state.selectedBookmarkIds.length + state.recall.selectedIds.length > 0 ||
        !!state.target.selectedUrl ||
        state.history.length > 0),
    blobKeyUnlocked: state.blobKeyUnlocked,
    lastMessage: state.importExportMessage,
    lastMessageIsError: state.importExportMessageIsError,
    restorePreview: state.importRestorePreview,
  };
  const cloudBackupState: CloudBackupProviderState = {
    provider: 'pcloud',
    connectionState: state.pcloudBackup.connectionState,
    apiHost: state.pcloudBackup.apiHost,
    folderPath: '/Image Trail/backups',
    lastBackupAt: state.pcloudBackup.lastBackupAt,
    lastBackupName: state.pcloudBackup.lastBackupFileName,
    lastBackupSize:
      state.pcloudBackup.lastBackupSizeBytes === undefined ? undefined : formatCloudBackupBytes(state.pcloudBackup.lastBackupSizeBytes),
    lastBackupOriginalCount: state.pcloudBackup.lastBackupOriginalCount,
    lastBackupOriginalBytes:
      state.pcloudBackup.lastBackupOriginalBytes === undefined
        ? undefined
        : formatCloudBackupBytes(state.pcloudBackup.lastBackupOriginalBytes),
    lastBackupMissingOriginalCount: state.pcloudBackup.lastBackupMissingOriginalCount,
    lastBackupSha256: state.pcloudBackup.lastBackupSha256,
    restoreCandidates: state.pcloudBackup.restoreCandidates?.map((candidate) => ({
      fileId: candidate.fileId,
      fileName: candidate.fileName,
      size: formatCloudBackupBytes(candidate.sizeBytes),
      modifiedAt: candidate.modifiedAt,
    })),
    restoreCandidateName: state.pcloudBackup.lastRestoreFileName,
    restoreCandidateSize:
      state.pcloudBackup.lastRestoreSizeBytes === undefined ? undefined : formatCloudBackupBytes(state.pcloudBackup.lastRestoreSizeBytes),
    restoreCandidateSha256: state.pcloudBackup.lastRestoreSha256,
    restoreDownloadedAt: state.pcloudBackup.lastRestoreDownloadedAt,
    restorePreview: state.importRestorePreview,
    pendingOperation: state.pcloudBackup.pendingOperation,
    message: state.pcloudBackup.message,
    messageIsError: state.pcloudBackup.messageIsError,
  };

  return createSettingsView(
    state.bookmarkLimit,
    {
      limit: state.recentHistoryLimit,
      retainedLimit: state.recentHistoryRetainedLimit,
      overflowBehavior: state.recentHistoryOverflowBehavior,
    },
    state.privacyModeEnabled,
    state.searchableMetadataPolicy,
    state.urlTemplates,
    state.grabSourcePatterns,
    urlContext.activeTemplateId,
    urlContext.fields,
    {
      pinSaveStoragePreference: state.pinSaveStoragePreference,
      blobKeyUnlocked: state.blobKeyUnlocked,
      blobKeyAvailable: state.blobKeyAvailable,
    },
    {
      visibleQueueCount: state.bookmarks.length,
      recallCount: recallDeleteCountForQueue(state),
      busy: state.importExportBusy || state.recall.busy,
    },
    state.storageUsage,
    {
      identity: state.buildIdentity,
      overlayVisible: state.buildInfoOverlayVisible,
    },
    {
      limit: state.urlReviewStatusLimit,
      clearAfterExport: state.clearUrlReviewStatusAfterExport,
    },
    {
      minimumIntervalMs: state.requestThrottleMs,
      maxRequests: state.requestThrottleMaxRequests,
      windowMs: state.requestThrottleWindowMs,
    },
    {
      enabled: state.neighborPreloadEnabled,
      radius: state.neighborPreloadRadius,
      cacheLimit: state.neighborPreloadCacheLimit,
      probeMethod: state.neighborPreloadProbeMethod,
      feedback: state.loadFailureFeedback,
    },
    state.restoreWorkspaceLayoutEnabled,
    [
      createEncryptionView(
        {
          unlocked: state.blobKeyUnlocked,
          keyReference: state.blobKeyReference,
          hasKey: state.blobKeyAvailable,
          busy: state.importExportBusy,
          abandonedOriginalCount: state.storageUsage?.orphanedBlobCount ?? 0,
        },
        dispatch,
      ),
      createImageTransferView(importExportState, dispatch),
      createCloudBackupView(cloudBackupState, dispatch),
      createImportExportView(importExportState, dispatch),
    ],
    dispatch,
  );
}

function selectedRecordCount(state: PanelState): number {
  return state.selectedHistoryIds.length + state.selectedBookmarkIds.length + state.recall.selectedIds.length;
}

function visibleImageSelectionCount(state: PanelState): number {
  return state.history.length + state.bookmarks.length + (state.recall.open ? state.recall.candidates.length : 0);
}
