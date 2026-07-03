import type { ActionEntries, AnyActionDef } from '../action-dispatch.js';
import type { PanelActionDeps } from './deps.js';

export type TransferActionName =
  | 'capture/request'
  | 'capture/delete'
  | 'capture/cleanup-orphans'
  | 'capture/preview'
  | 'blob-key/setup'
  | 'blob-key/unlock'
  | 'blob-key/clear'
  | 'blob-key/export'
  | 'blob-key/import'
  | 'cloud-backup/connect'
  | 'cloud-backup/retry'
  | 'cloud-backup/disconnect'
  | 'cloud-backup/backup-now'
  | 'cloud-backup/choose-restore'
  | 'cloud-backup/preview-restore'
  | 'export/history'
  | 'export/bookmarks'
  | 'export/image'
  | 'export/encrypted-image'
  | 'export/url-review-status'
  | 'clear/url-review-status'
  | 'import/history'
  | 'import/bookmarks'
  | 'import/url-review-status'
  | 'import/confirm-restore-preview'
  | 'import/cancel-restore-preview'
  | 'import/image'
  | 'import/encrypted-image';

/**
 * Capture, blob-key, cloud backup, and export/import flows — thin delegation to the
 * RecallExport/RecallRestore controllers extracted by #297, moved verbatim from the panel dispatch chain.
 */
export function buildTransferActionEntries(deps: PanelActionDeps): ActionEntries<TransferActionName> {
  const connectPCloud: AnyActionDef = {
    handle() {
      void deps.recallExport().connectPCloudBackup();
    },
  };
  return {
    'capture/request': {
      handle(action) {
        void deps.captureImage(action.url, action.sourceType, action.sourceRecordId);
      },
    },
    'capture/delete': {
      handle(action) {
        void deps.deleteCapturedBlob(action.id, action.blobId);
      },
    },
    'capture/cleanup-orphans': {
      handle() {
        void deps.cleanupOrphanedBlobs();
      },
    },
    'capture/preview': {
      handle(action) {
        void deps.previewRecord(action.url, action.blobId, action.scrollAnchorId);
      },
    },
    'blob-key/setup': {
      handle(action) {
        void deps.recallExport().setupBlobKey(action.password);
      },
    },
    'blob-key/unlock': {
      handle(action) {
        void deps.recallExport().unlockBlobKey(action.password);
      },
    },
    'blob-key/clear': {
      handle() {
        void deps.recallExport().clearBlobKey();
      },
    },
    'blob-key/export': {
      handle(action) {
        void deps.recallExport().exportBlobKeyBackup(action.password);
      },
    },
    'blob-key/import': {
      handle(action) {
        void deps.recallExport().importBlobKeyBackup(action.fileContent, action.password);
      },
    },
    'cloud-backup/connect': connectPCloud,
    'cloud-backup/retry': connectPCloud,
    'cloud-backup/disconnect': {
      handle() {
        void deps.recallExport().disconnectPCloudBackup();
      },
    },
    'cloud-backup/backup-now': {
      handle(action) {
        void deps.recallExport().backupPCloudNow(action.password);
      },
    },
    'cloud-backup/choose-restore': {
      handle() {
        void deps.recallRestore().choosePCloudRestoreFile();
      },
    },
    'cloud-backup/preview-restore': {
      handle(action) {
        void deps.recallRestore().previewPCloudRestoreFile(action.fileId, action.fileName, action.password);
      },
    },
    'export/history': {
      handle(action) {
        void deps.recallExport().exportHistory(action.password, action.plaintext);
      },
    },
    'export/bookmarks': {
      handle(action) {
        void deps.recallExport().exportBookmarks(action.password, action.plaintext);
      },
    },
    'export/image': {
      handle(action) {
        void deps.recallExport().exportImage(action.saveAs === true);
      },
    },
    'export/encrypted-image': {
      handle() {
        void deps.recallExport().exportEncryptedImages();
      },
    },
    'export/url-review-status': {
      handle() {
        void deps.recallExport().exportUrlReviewStatus();
      },
    },
    'clear/url-review-status': {
      handle(action) {
        void deps.clearUrlReviewStatus(action.scope ?? 'hostname');
      },
    },
    'import/history': {
      handle(action) {
        void deps.recallRestore().previewHistoryImport(action.fileContent, action.password, action.fileName);
      },
    },
    'import/bookmarks': {
      handle(action) {
        void deps.recallRestore().previewBookmarksImport(action.fileContent, action.password, action.fileName);
      },
    },
    'import/url-review-status': {
      handle(action) {
        deps.recallRestore().previewUrlReviewStatusImport(action.fileContent, action.fileName);
      },
    },
    'import/confirm-restore-preview': {
      handle() {
        void deps.recallRestore().confirmRestorePreview();
      },
    },
    'import/cancel-restore-preview': {
      handle() {
        deps.recallRestore().cancelRestorePreview();
      },
    },
    'import/image': {
      handle(action) {
        void deps.recallRestore().importImages(action.files);
      },
    },
    'import/encrypted-image': {
      handle(action) {
        void deps.recallRestore().importEncryptedImages(action.files);
      },
    },
  };
}
