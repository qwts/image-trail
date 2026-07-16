import { reducePanelAction } from '../../core/actions.js';
import type { BookmarkStore, PanelState, UrlReviewStatusStore } from '../../core/types.js';
import type { CaptureStore } from '../../content/capture-controller.js';
import { encryptedBlobIdForRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import { selectImageDownloadUrls } from '../../core/image/downloads.js';
import type {
  connectPCloudProvider,
  disconnectPCloudProvider,
  loadPCloudProviderStatus,
  uploadPCloudBackup,
} from '../../content/pcloud-provider-client.js';
import {
  exportEncryptedBookmarks,
  exportEncryptedFullBackup,
  exportEncryptedHistory,
  exportPlainBookmarks,
  exportPlainHistory,
  exportUrlReviewStatus as exportUrlReviewStatusFile,
  storedBlobRecordFromPortable,
  type AlbumBackupEntry,
  type FullBackupBlobKeyBackup,
  type PlaintextLocalSettings,
} from '../../content/panel-services.js';
import { hostnameFromLocation } from '../panel-position.js';
import {
  downloadTextFile,
  downloadUrlsInSeries,
  encryptedImageExportResultMessage,
  exportEncryptedImagesInSeries,
  filenameForExportedImage,
  filenameForExportedImageRecord,
  imageDownloadResultMessage,
} from './export-download.js';
import {
  bookmarkRecordToExportEntry,
  historyRecordToExportEntry,
  isLockedPrivatePin,
  originalBlobIdsForFullBackup,
  pcloudBackupFileName,
  pcloudBackupUploadMessage,
  PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
  selectedRecords,
} from './record-export-helpers.js';
import { SecureSessionUiController } from './secure-session-ui-controller.js';

/**
 * Collaborator that owns the blob-key, pCloud backup, and data/image export flows extracted from
 * ImageTrailPanel (epic #290). The pure builders it calls already live in record-export-helpers.ts,
 * export-download.ts, and panel-services.ts; this controller only orchestrates the stores, the panel
 * state reducer, and the pCloud provider client.
 *
 * Every external interaction routes through the injected {@link RecallExportControllerDeps} callbacks,
 * which the panel wires as lazy arrow closures over `this`. The pCloud client functions are injected
 * (rather than imported directly) so the backup flow is testable with fakes. The sibling
 * RecallRestoreController reaches this controller's `loadAllBookmarksForExport` and
 * `refreshBlobKeyStatus` through its own deps.
 */
export interface RecallExportControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  getLocalSettings(): PlaintextLocalSettings;
  findSelectedImage(handleId: string): HTMLImageElement | null;
  bookmarkStore(): BookmarkStore | null;
  albumStore(): { readonly listBackupEntries: () => Promise<readonly AlbumBackupEntry[]> } | null;
  captureStore(): CaptureStore | null;
  urlReviewStatusStore(): UrlReviewStatusStore | null;
  loadPCloudProviderStatus: typeof loadPCloudProviderStatus;
  connectPCloudProvider: typeof connectPCloudProvider;
  disconnectPCloudProvider: typeof disconnectPCloudProvider;
  uploadPCloudBackup: typeof uploadPCloudBackup;
}

export class RecallExportController {
  private readonly secureSession: SecureSessionUiController;

  constructor(private readonly deps: RecallExportControllerDeps) {
    this.secureSession = new SecureSessionUiController(deps);
  }

  async setupBlobKey(password: string): Promise<void> {
    return this.secureSession.setup(password);
  }

  async unlockBlobKey(password: string): Promise<void> {
    return this.secureSession.unlock(password);
  }

  async lockBlobKey(): Promise<void> {
    return this.secureSession.lock();
  }

  async clearBlobKey(): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore) return;
    const result = await captureStore.clearBlobKey();
    this.deps.setState(
      reducePanelAction(
        { ...this.deps.getState(), message: result.message, status: result.ok ? 'ready' : 'error', lastUpdatedAt: Date.now() },
        { name: 'blob-key/status', unlocked: false, keyReference: null, hasKey: false },
      ),
    );
    this.deps.render();
  }

  async refreshBlobKeyStatus(): Promise<void> {
    return this.secureSession.refresh();
  }

  async refreshPCloudProviderStatus(): Promise<void> {
    const status = await this.deps.loadPCloudProviderStatus();
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/status', status }));
    this.deps.render();
  }

  async connectPCloudBackup(): Promise<void> {
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/busy',
        pendingOperation: 'connecting',
        message: 'Requesting pCloud access...',
      }),
    );
    this.deps.render();
    const result = await this.deps.connectPCloudProvider();
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/status', status: result.status }));
    if (!result.ok) {
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/error', message: result.message }));
    }
    this.deps.render();
  }

  async disconnectPCloudBackup(): Promise<void> {
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/busy',
        pendingOperation: 'disconnecting',
        message: 'Disconnecting pCloud...',
      }),
    );
    this.deps.render();
    const result = await this.deps.disconnectPCloudProvider();
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/status', status: result.status }));
    if (!result.ok) {
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/error', message: result.message }));
    }
    this.deps.render();
  }

  async backupPCloudNow(password: string): Promise<void> {
    if (this.deps.getState().pcloudBackup.connectionState === 'busy') return;
    if (password.length < 4) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'pcloud-backup/upload-error',
          message: 'Enter a cloud backup password with at least 4 characters before uploading.',
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/busy',
        pendingOperation: 'backing-up',
        message: 'Creating encrypted backup...',
      }),
    );
    this.deps.render();

    const bookmarks = await this.loadAllBookmarksForExport();
    const albums = (await this.deps.albumStore()?.listBackupEntries()) ?? [];
    if (bookmarks.some(isLockedPrivatePin)) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/upload-error', message: PRIVATE_PIN_EXPORT_LOCKED_MESSAGE }),
      );
      this.deps.render();
      return;
    }
    if (bookmarks.length === 0 && albums.length === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'pcloud-backup/upload-error',
          message: 'No durable pins, bookmarks, or albums to back up.',
        }),
      );
      this.deps.render();
      return;
    }

    const originalBlobIds = originalBlobIdsForFullBackup(bookmarks);
    const captureStore = this.deps.captureStore();
    const originalBlobResult =
      originalBlobIds.length > 0 && captureStore
        ? await captureStore.requestOriginalBlobRecords(originalBlobIds)
        : { ok: true as const, records: [], missingBlobIds: originalBlobIds };
    if (!originalBlobResult.ok) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/upload-error', message: originalBlobResult.message }),
      );
      this.deps.render();
      return;
    }
    const originalBlobRecords = originalBlobResult.records.map(storedBlobRecordFromPortable);

    const blobKeyBackupResult = await this.exportBlobKeyBackupsForOriginalRecords(originalBlobRecords, password);
    if (!blobKeyBackupResult.ok) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/upload-error', message: blobKeyBackupResult.message }),
      );
      this.deps.render();
      return;
    }

    const now = new Date().toISOString();
    const exportResult = await exportEncryptedFullBackup({
      bookmarks: bookmarks.map(bookmarkRecordToExportEntry),
      albums,
      originalBlobs: originalBlobRecords,
      blobKeyBackups: blobKeyBackupResult.backups,
      missingOriginalBlobIds: originalBlobResult.missingBlobIds,
      password,
      now,
    });
    if (!exportResult.status.ok || !exportResult.fileContent) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/upload-error', message: exportResult.status.message }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/busy',
        pendingOperation: 'backing-up',
        message: 'Uploading encrypted backup to pCloud...',
      }),
    );
    this.deps.render();

    const upload = await this.deps.uploadPCloudBackup({
      fileName: pcloudBackupFileName(now),
      fileContent: exportResult.fileContent,
    });
    if (!upload.ok) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'pcloud-backup/upload-error', message: upload.message, status: upload.status }),
      );
      this.deps.render();
      return;
    }
    const originalBytes = originalBlobRecords.reduce((total, record) => total + record.encryptedByteLength, 0);
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/upload-complete',
        apiHost: upload.apiHost,
        originalCount: originalBlobRecords.length,
        originalBytes,
        missingOriginalCount: originalBlobResult.missingBlobIds.length,
        historyRecord: upload.historyRecord,
        message: pcloudBackupUploadMessage(
          upload.message,
          originalBlobRecords.length,
          originalBytes,
          originalBlobResult.missingBlobIds.length,
        ),
      }),
    );
    this.deps.render();
  }

  private async exportBlobKeyBackupsForOriginalRecords(
    originalBlobRecords: readonly ReturnType<typeof storedBlobRecordFromPortable>[],
    password: string,
  ): Promise<
    { readonly ok: true; readonly backups: readonly FullBackupBlobKeyBackup[] } | { readonly ok: false; readonly message: string }
  > {
    if (originalBlobRecords.length === 0) return { ok: true, backups: [] };
    const captureStore = this.deps.captureStore();
    if (!captureStore) return { ok: false, message: 'Encrypted original storage is unavailable; no bookmarks were backed up.' };

    const backups: FullBackupBlobKeyBackup[] = [];
    const keyReferences = [...new Set(originalBlobRecords.map((record) => record.key.reference))].sort();
    for (const keyReference of keyReferences) {
      const backup = await captureStore.exportBlobKeyBackup(password, keyReference);
      if (!backup.ok) return { ok: false, message: backup.message };
      backups.push({ keyReference: backup.keyReference, fileContent: backup.fileContent });
    }
    return { ok: true, backups };
  }

  async exportHistory(password: string, plaintext: boolean): Promise<void> {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const history = selectedRecords(this.deps.getState().history, this.deps.getState().selectedHistoryIds);
    const entries = history.map(historyRecordToExportEntry);
    const result = plaintext ? exportPlainHistory({ entries }) : await exportEncryptedHistory({ entries, password });
    this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
  }

  async exportBookmarks(password: string, plaintext: boolean): Promise<void> {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const selectedBookmarks = [
      ...(this.deps.getState().selectedBookmarkIds.length > 0
        ? selectedRecords(this.deps.getState().bookmarks, this.deps.getState().selectedBookmarkIds)
        : []),
      ...(this.deps.getState().recall.selectedIds.length > 0 ? this.selectedRecallRecords() : []),
    ];
    const bookmarks = selectedBookmarks.length > 0 ? selectedBookmarks : await this.loadAllBookmarksForExport();
    if (bookmarks.some(isLockedPrivatePin)) {
      this.finishExport(
        undefined,
        undefined,
        'Unlock encrypted storage before exporting private pins so the backup includes their metadata and thumbnails.',
        false,
      );
      return;
    }
    const entries = bookmarks.map(bookmarkRecordToExportEntry);
    const result = plaintext ? exportPlainBookmarks({ entries }) : await exportEncryptedBookmarks({ entries, password });
    this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
  }

  async exportUrlReviewStatus(): Promise<void> {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const hostname = hostnameFromLocation();
    const urlReviewStatusStore = this.deps.urlReviewStatusStore();
    const records = hostname && urlReviewStatusStore ? await urlReviewStatusStore.list(hostname) : [];
    const result = exportUrlReviewStatusFile({ records });
    if (!result.status.ok || !result.fileContent || !result.fileName) {
      this.finishExport(result.fileContent, result.fileName, result.status.message, result.status.ok);
      return;
    }
    downloadTextFile(result.fileContent, result.fileName);
    let message = result.status.message;
    if (this.deps.getLocalSettings().clearUrlReviewStatusAfterExport && hostname && urlReviewStatusStore) {
      const deletedCount = await urlReviewStatusStore.clear({ scope: 'hostname', hostname });
      message = `${message} Cleared ${deletedCount} current-site record${deletedCount === 1 ? '' : 's'} after export.`;
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/complete', message }));
    this.deps.render();
  }

  private finishExport(fileContent: string | undefined, fileName: string | undefined, message: string, ok: boolean): void {
    if (!ok || !fileContent || !fileName) {
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message }));
      this.deps.render();
      return;
    }
    downloadTextFile(fileContent, fileName);
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/complete', message }));
    this.deps.render();
  }

  async exportBlobKeyBackup(password: string): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore || this.deps.getState().importExportBusy) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await captureStore.exportBlobKeyBackup(password, this.deps.getState().blobKeyReference ?? undefined);
    this.finishExport(result.ok ? result.fileContent : undefined, result.ok ? result.fileName : undefined, result.message, result.ok);
  }

  async importBlobKeyBackup(fileContent: string, password: string): Promise<void> {
    const captureStore = this.deps.captureStore();
    if (!captureStore || this.deps.getState().importExportBusy) return;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await captureStore.importBlobKeyBackup(fileContent, password);
    if (!result.ok) {
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: result.message }));
      this.deps.render();
      return;
    }
    await this.refreshBlobKeyStatus();
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/complete', message: result.message }));
    await this.deps.loadBookmarkPage(this.deps.getState().bookmarkOffset, { render: false });
    this.deps.renderPanelAndRefreshRecall();
  }

  async exportImage(saveAs: boolean): Promise<void> {
    if (this.deps.getState().importExportBusy) return;
    const selectedRecordsForDownload = this.selectedImageDownloadRecords();
    if (selectedRecordsForDownload.some(isLockedPrivatePin)) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
        }),
      );
      this.deps.render();
      return;
    }
    const urls =
      selectedRecordsForDownload.length > 0
        ? []
        : selectImageDownloadUrls({
            history: this.deps.getState().history,
            bookmarks: this.deps.getState().bookmarks,
            selectedHistoryIds: this.deps.getState().selectedHistoryIds,
            selectedBookmarkIds: this.deps.getState().selectedBookmarkIds,
            currentImageUrl: this.selectedImageExportUrl(),
          });
    if (selectedRecordsForDownload.length === 0 && urls.length === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: 'Select an image before exporting.' }),
      );
      this.deps.render();
      return;
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const downloads =
      selectedRecordsForDownload.length > 0
        ? await this.selectedRecordImageDownloads(selectedRecordsForDownload)
        : urls.map((url) => ({ url, fileName: filenameForExportedImage(url) }));
    const result = await downloadUrlsInSeries(downloads, saveAs);
    const message = imageDownloadResultMessage(result);
    if (result.started === 0) {
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message }));
      this.deps.render();
      return;
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/complete', message }));
    this.deps.render();
  }

  private selectedImageDownloadRecords(): readonly ImageDisplayRecord[] {
    return [
      ...(this.deps.getState().selectedHistoryIds.length > 0
        ? selectedRecords(this.deps.getState().history, this.deps.getState().selectedHistoryIds)
        : []),
      ...(this.deps.getState().selectedBookmarkIds.length > 0
        ? selectedRecords(this.deps.getState().bookmarks, this.deps.getState().selectedBookmarkIds)
        : []),
      ...(this.deps.getState().recall.selectedIds.length > 0 ? this.selectedRecallRecords() : []),
    ];
  }

  private selectedRecallRecords(): readonly ImageDisplayRecord[] {
    return selectedRecords(this.deps.getState().recall.candidates, this.deps.getState().recall.selectedIds);
  }

  private async selectedRecordImageDownloads(
    records: readonly ImageDisplayRecord[],
  ): Promise<readonly { readonly url: string; readonly fileName: string }[]> {
    const downloads: { readonly url: string; readonly fileName: string }[] = [];
    for (const record of records) {
      downloads.push({
        url: await this.recordImageDownloadUrl(record),
        fileName: filenameForExportedImageRecord(record),
      });
    }
    return downloads;
  }

  private async recordImageDownloadUrl(record: ImageDisplayRecord): Promise<string> {
    const blobId = encryptedBlobIdForRecord(record);
    const captureStore = this.deps.captureStore();
    if (!blobId || !captureStore || !this.deps.getState().blobKeyUnlocked) return record.url;
    const retrieved = await captureStore.requestRetrieveBlob(blobId);
    if (!retrieved.ok && retrieved.reason === 'encryption-locked') await this.refreshBlobKeyStatus();
    return retrieved.ok ? retrieved.dataUrl : record.url;
  }

  async exportEncryptedImages(): Promise<void> {
    if (this.deps.getState().importExportBusy) return;
    if (!this.deps.getState().blobKeyUnlocked) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Unlock encrypted originals before exporting encrypted images.',
        }),
      );
      this.deps.render();
      return;
    }
    if (this.selectedImageDownloadRecords().some(isLockedPrivatePin)) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: PRIVATE_PIN_EXPORT_LOCKED_MESSAGE,
        }),
      );
      this.deps.render();
      return;
    }
    const targets = this.encryptedImageExportTargets();
    if (targets.length === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Select an image before exporting encrypted images.',
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await exportEncryptedImagesInSeries(targets);
    if (result.encryptionLocked) await this.refreshBlobKeyStatus();
    const message = encryptedImageExportResultMessage(result);
    if (result.started === 0) {
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message }));
      this.deps.render();
      return;
    }
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/complete', message }));
    this.deps.render();
  }

  private encryptedImageExportTargets(): readonly {
    readonly url: string;
    readonly fileName: string;
    readonly blobId?: string | undefined;
  }[] {
    const selected = this.selectedImageDownloadRecords();
    if (selected.length > 0) {
      return selected.map((record) => ({
        url: record.url,
        fileName: filenameForExportedImageRecord(record),
        blobId: encryptedBlobIdForRecord(record),
      }));
    }
    const urls = selectImageDownloadUrls({
      history: this.deps.getState().history,
      bookmarks: this.deps.getState().bookmarks,
      selectedHistoryIds: this.deps.getState().selectedHistoryIds,
      selectedBookmarkIds: this.deps.getState().selectedBookmarkIds,
      currentImageUrl: this.selectedImageExportUrl(),
    });
    return urls.map((url) => ({ url, fileName: filenameForExportedImage(url) }));
  }

  private selectedImageExportUrl(): string | null {
    const selectedUrl = this.deps.getState().target.selectedUrl;
    if (selectedUrl && selectedUrl !== 'data:') return selectedUrl;
    const selectedHandleId = this.deps.getState().target.selectedHandleId;
    const image = selectedHandleId ? this.deps.findSelectedImage(selectedHandleId) : null;
    return image?.currentSrc || image?.src || null;
  }

  async loadAllBookmarksForExport(): Promise<readonly ImageDisplayRecord[]> {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore) return this.deps.getState().bookmarks;
    const all: ImageDisplayRecord[] = [];
    let offset = 0;
    const limit = 100;
    for (;;) {
      const page = await bookmarkStore.loadPage({ offset, limit, scope: 'global', currentPageUrl: window.location.href });
      all.push(...page.items);
      if (!page.hasOlder) return all;
      offset = page.offset + page.limit;
    }
  }
}
