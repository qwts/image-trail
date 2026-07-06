import { reducePanelAction } from '../../core/actions.js';
import type { BookmarkStore, ImportedEncryptedImageFile, ImportedImageFile, PanelState, UrlReviewStatusStore } from '../../core/types.js';
import type { CaptureStore } from '../../content/capture-controller.js';
import type { RecentHistoryStore } from '../../content/recent-history-store.js';
import type { ImageDisplayRecord } from '../../core/display-records.js';
import { requestEncryptedImageImport } from '../../content/download-controller.js';
import type { downloadPCloudBackup, listPCloudBackups } from '../../content/pcloud-provider-client.js';
import {
  importBookmarks as importBookmarkRecords,
  importEncryptedHistory,
  importUrlReviewStatus as importUrlReviewStatusFile,
  type AlbumBackupEntry,
  type PlaintextLocalSettings,
} from '../../content/panel-services.js';
import {
  bookmarkEntriesOriginalReferenceCount,
  bookmarkPayloadToDisplayRecord,
  createBookmarksRestorePreview,
  createHistoryRestorePreview,
  createRestoreDuplicateSummary,
  createUrlReviewStatusRestorePreview,
  fullBackupRestoreDetail,
  historyPayloadToDisplayRecord,
  restoreImportCompleteMessage,
  type BookmarkImportResult,
  type HistoryImportResult,
  type UrlReviewStatusImportResult,
} from './restore-import-preview.js';

/**
 * Tagged union of a decrypted, deduped import awaiting user confirmation. Owned by
 * {@link RecallRestoreController} as the backing value for the preview → confirm → import state machine.
 */
export type PendingRestoreImport =
  | { readonly kind: 'history'; readonly result: HistoryImportResult; readonly duplicateCount: number }
  | {
      readonly kind: 'bookmarks';
      readonly result: BookmarkImportResult;
      readonly duplicateCount: number;
      readonly duplicateRecordIdsByUuid: ReadonlyMap<string, string>;
      readonly password: string;
    }
  | { readonly kind: 'url-review-status'; readonly result: UrlReviewStatusImportResult };

/**
 * Collaborator that owns the file/pCloud restore-preview flows, the `pendingRestoreImport`
 * preview → confirm → import state machine, and image imports extracted from ImageTrailPanel (epic
 * #290). The pure builders it calls live in restore-import-preview.ts; this controller orchestrates the
 * stores, the panel state reducer, and the pCloud provider client (injected for testability).
 *
 * Two callbacks reach the sibling RecallExportController: `loadAllBookmarks` (dedup source for a
 * bookmarks preview) and `refreshBlobKeyStatus` (after a full-backup original restore). Both are wired
 * as lazy arrow closures over the panel's `this`, so the cross-controller cycle is safe at runtime.
 */
export interface RecallRestoreControllerDeps {
  getState(): PanelState;
  setState(state: PanelState): void;
  render(): void;
  renderPanelAndRefreshRecall(): void;
  loadBookmarkPage(offset: number, options?: { readonly render?: boolean }): Promise<void>;
  loadRecentHistory(options?: { readonly render?: boolean }): Promise<void>;
  refreshStorageUsage(options?: { readonly render?: boolean }): Promise<void>;
  addImportedImage(file: ImportedImageFile): Promise<boolean>;
  getLocalSettings(): PlaintextLocalSettings;
  bookmarkStore(): BookmarkStore | null;
  albumStore(): {
    readonly importBackupEntries: (
      albums: readonly AlbumBackupEntry[],
      recordIdMap: ReadonlyMap<string, string>,
    ) => Promise<{
      readonly importedAlbumCount: number;
      readonly importedMembershipCount: number;
      readonly skippedMembershipCount: number;
    }>;
  } | null;
  captureStore(): CaptureStore | null;
  recentHistoryStore(): RecentHistoryStore | null;
  urlReviewStatusStore(): UrlReviewStatusStore | null;
  listPCloudBackups: typeof listPCloudBackups;
  downloadPCloudBackup: typeof downloadPCloudBackup;
  loadAllBookmarks(): Promise<readonly ImageDisplayRecord[]>;
  refreshBlobKeyStatus(): Promise<void>;
}

export class RecallRestoreController {
  private pendingRestoreImport: PendingRestoreImport | null = null;

  constructor(private readonly deps: RecallRestoreControllerDeps) {}

  async choosePCloudRestoreFile(): Promise<void> {
    if (this.deps.getState().pcloudBackup.connectionState === 'busy') return;
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/busy',
        pendingOperation: 'restoring',
        message: 'Checking pCloud backups...',
      }),
    );
    this.deps.render();

    const result = await this.deps.listPCloudBackups();
    if (!result.ok) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'pcloud-backup/restore-error',
          message: result.message,
          status: result.status,
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/restore-candidates-loaded',
        candidates: result.candidates,
        folderPath: result.folderPath,
        apiHost: result.apiHost,
        message: result.message,
      }),
    );
    this.deps.render();
  }

  async previewPCloudRestoreFile(fileId: number, fileName: string, password: string): Promise<void> {
    if (this.deps.getState().pcloudBackup.connectionState === 'busy') return;
    if (password.length < 4) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'pcloud-backup/restore-error',
          message: 'Enter the cloud backup password before previewing this restore file.',
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/busy',
        pendingOperation: 'restoring',
        message: 'Downloading encrypted pCloud backup...',
      }),
    );
    this.deps.render();

    const result = await this.deps.downloadPCloudBackup({ fileId, fileName });
    if (!result.ok) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'pcloud-backup/restore-error',
          message: result.message,
          status: result.status,
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'pcloud-backup/restore-downloaded',
        fileName: result.fileName,
        folderPath: result.folderPath,
        apiHost: result.apiHost,
        sizeBytes: result.sizeBytes,
        sha256: result.sha256,
        downloadedAt: result.downloadedAt,
        message: result.message,
      }),
    );
    await this.previewBookmarksImport(result.fileContent, password, result.fileName);
    this.deps.render();
  }

  async importImages(files: readonly ImportedImageFile[]): Promise<void> {
    if (files.length === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: 'Choose one or more image files to import.' }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    let imported = 0;
    for (const file of files) {
      if (await this.deps.addImportedImage(file)) imported += 1;
    }

    if (imported === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: 'No selected image files could be imported.' }),
      );
    } else {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/complete',
          message: `Imported ${imported} image${imported === 1 ? '' : 's'} into bookmarks and recent history.`,
        }),
      );
    }
    this.deps.render();
  }

  async importEncryptedImages(files: readonly ImportedEncryptedImageFile[]): Promise<void> {
    if (files.length === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Choose one or more encrypted image files to import.',
        }),
      );
      this.deps.render();
      return;
    }
    if (!this.deps.getState().blobKeyUnlocked) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Unlock encrypted originals before importing encrypted images.',
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    let imported = 0;
    let failed = 0;
    let firstFailureMessage: string | null = null;
    for (const file of files) {
      const result = await requestEncryptedImageImport(file.fileContent);
      if (!result.ok) {
        if (result.reason === 'encryption-locked') await this.deps.refreshBlobKeyStatus();
        firstFailureMessage ??= result.message;
        failed += 1;
        continue;
      }
      if (await this.deps.addImportedImage({ name: result.fileName || file.name, dataUrl: result.dataUrl })) imported += 1;
    }

    if (imported === 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: firstFailureMessage ?? 'No encrypted image files could be imported.',
        }),
      );
    } else if (failed > 0) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/complete',
          message: `Imported ${imported} encrypted image${imported === 1 ? '' : 's'}. ${failed} failed.`,
        }),
      );
    } else {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/complete',
          message: `Imported ${imported} encrypted image${imported === 1 ? '' : 's'} into bookmarks and recent history.`,
        }),
      );
    }
    this.deps.render();
  }

  async previewHistoryImport(fileContent: string, password: string, fileName?: string): Promise<void> {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await importEncryptedHistory(fileContent, password);
    if (!result.status.ok) {
      this.pendingRestoreImport = null;
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: result.status.message }));
      this.deps.render();
      return;
    }
    const duplicateSummary = createRestoreDuplicateSummary(result.entries, await this.loadRetainedRecentHistoryForRestoreDuplicateCheck());
    this.pendingRestoreImport = {
      kind: 'history',
      result: { ...result, entries: duplicateSummary.uniqueEntries },
      duplicateCount: duplicateSummary.duplicateCount,
    };
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import/restore-preview-ready',
        preview: createHistoryRestorePreview(result, fileName, duplicateSummary),
      }),
    );
    this.deps.render();
  }

  private async importHistory(result: HistoryImportResult, duplicateCount: number): Promise<void> {
    const recentHistoryStore = this.deps.recentHistoryStore();
    if (!recentHistoryStore) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Recent history storage is unavailable; no records were imported.',
        }),
      );
      this.deps.render();
      return;
    }
    let importedCount = 0;
    for (const entry of result.entries) {
      const record = historyPayloadToDisplayRecord(entry.uuid, entry.payload);
      await recentHistoryStore.add(record, window.location.href);
      importedCount += 1;
    }
    await this.deps.loadRecentHistory();
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import-export/complete',
        message: restoreImportCompleteMessage(
          'record',
          importedCount,
          duplicateCount,
          result.skipped.length,
          result.plaintext,
          'reloaded into extension state',
        ),
      }),
    );
    this.deps.render();
  }

  async previewBookmarksImport(fileContent: string, password: string, fileName?: string): Promise<void> {
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();
    const result = await importBookmarkRecords(fileContent, password);
    if (!result.status.ok) {
      this.pendingRestoreImport = null;
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: result.status.message }));
      this.deps.render();
      return;
    }
    const duplicateSummary = createRestoreDuplicateSummary(result.entries, await this.deps.loadAllBookmarks());
    this.pendingRestoreImport = {
      kind: 'bookmarks',
      result: {
        ...result,
        entries: duplicateSummary.uniqueEntries,
        externalOriginalCount: bookmarkEntriesOriginalReferenceCount(duplicateSummary.uniqueEntries),
      },
      duplicateCount: duplicateSummary.duplicateCount,
      duplicateRecordIdsByUuid: duplicateSummary.duplicateRecordIdsByUuid,
      password,
    };
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import/restore-preview-ready',
        preview: createBookmarksRestorePreview(result, fileName, duplicateSummary),
      }),
    );
    this.deps.render();
  }

  private async importBookmarks(
    result: BookmarkImportResult,
    duplicateCount: number,
    password: string,
    duplicateRecordIdsByUuid: ReadonlyMap<string, string>,
  ): Promise<void> {
    const bookmarkStore = this.deps.bookmarkStore();
    if (!bookmarkStore) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Bookmark storage is unavailable; no bookmarks were imported.',
        }),
      );
      this.deps.render();
      return;
    }
    const fullBackupOriginalRestore = await this.restoreFullBackupOriginals(result, password);
    if (!fullBackupOriginalRestore.ok) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: fullBackupOriginalRestore.message }),
      );
      this.deps.render();
      return;
    }
    let importedCount = 0;
    const recordIdMap = new Map(duplicateRecordIdsByUuid);
    for (const entry of result.entries) {
      const saved = await bookmarkStore.save(bookmarkPayloadToDisplayRecord(entry.uuid, entry.payload));
      recordIdMap.set(entry.uuid, saved.id);
      importedCount += 1;
    }
    const albumRestore = await this.restoreFullBackupAlbums(result, recordIdMap);
    await this.deps.loadBookmarkPage(0, { render: false });
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import-export/complete',
        message:
          restoreImportCompleteMessage(
            'bookmark',
            importedCount,
            duplicateCount,
            result.skipped.length,
            result.plaintext,
            result.fullBackup
              ? fullBackupRestoreDetail(fullBackupOriginalRestore.importedOriginalCount)
              : 'encrypted into bookmark storage',
          ) + albumRestoreCompleteMessage(albumRestore),
      }),
    );
    this.deps.renderPanelAndRefreshRecall();
  }

  private async restoreFullBackupAlbums(
    result: BookmarkImportResult,
    recordIdMap: ReadonlyMap<string, string>,
  ): Promise<{
    readonly importedAlbumCount: number;
    readonly importedMembershipCount: number;
    readonly skippedMembershipCount: number;
    readonly unavailable?: boolean;
  } | null> {
    if (!result.fullBackup || result.albums.length === 0) return null;
    const albumStore = this.deps.albumStore();
    if (!albumStore) {
      return {
        importedAlbumCount: 0,
        importedMembershipCount: 0,
        skippedMembershipCount: result.albums.reduce((sum, album) => sum + album.recordIds.length, 0),
        unavailable: true,
      };
    }
    return albumStore.importBackupEntries(result.albums, recordIdMap);
  }

  private async restoreFullBackupOriginals(
    result: BookmarkImportResult,
    password: string,
  ): Promise<{ readonly ok: true; readonly importedOriginalCount: number } | { readonly ok: false; readonly message: string }> {
    if (!result.fullBackup || result.externalOriginalCount === 0) return { ok: true, importedOriginalCount: 0 };
    const captureStore = this.deps.captureStore();
    if (!captureStore) {
      return { ok: false, message: 'Encrypted original storage is unavailable; no bookmarks were imported.' };
    }
    for (const backup of result.blobKeyBackups) {
      const imported = await captureStore.importBlobKeyBackup(backup.fileContent, password);
      if (!imported.ok) return { ok: false, message: imported.message };
    }
    const blobImport = await captureStore.importOriginalBlobRecords(result.originalBlobs);
    if (!blobImport.ok) return { ok: false, message: blobImport.message };
    await this.deps.refreshBlobKeyStatus();
    await this.deps.refreshStorageUsage();
    return { ok: true, importedOriginalCount: blobImport.importedCount };
  }

  previewUrlReviewStatusImport(fileContent: string, fileName?: string): void {
    const result = importUrlReviewStatusFile(fileContent);
    if (!result.status.ok) {
      this.pendingRestoreImport = null;
      this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/error', message: result.status.message }));
      this.deps.render();
      return;
    }
    this.pendingRestoreImport = { kind: 'url-review-status', result };
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import/restore-preview-ready',
        preview: createUrlReviewStatusRestorePreview(result, fileName),
      }),
    );
    this.deps.render();
  }

  private async importUrlReviewStatus(result: UrlReviewStatusImportResult): Promise<void> {
    const importedCount = await this.deps.urlReviewStatusStore()?.importMany(result.records, {
      maxRecordsPerHost: this.deps.getLocalSettings().urlReviewStatusLimit,
    });
    this.deps.setState(
      reducePanelAction(this.deps.getState(), {
        name: 'import-export/complete',
        message: `${result.status.message} ${importedCount ?? 0} saved to extension state.`,
      }),
    );
    this.deps.render();
  }

  async confirmRestorePreview(): Promise<void> {
    const pending = this.pendingRestoreImport;
    if (!pending) {
      this.deps.setState(
        reducePanelAction(this.deps.getState(), {
          name: 'import-export/error',
          message: 'Choose an import file before confirming restore.',
        }),
      );
      this.deps.render();
      return;
    }

    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import-export/start' }));
    this.deps.render();

    switch (pending.kind) {
      case 'history':
        await this.importHistory(pending.result, pending.duplicateCount);
        break;
      case 'bookmarks':
        await this.importBookmarks(pending.result, pending.duplicateCount, pending.password, pending.duplicateRecordIdsByUuid);
        break;
      case 'url-review-status':
        await this.importUrlReviewStatus(pending.result);
        break;
    }
    this.pendingRestoreImport = null;
  }

  cancelRestorePreview(): void {
    this.pendingRestoreImport = null;
    this.deps.setState(reducePanelAction(this.deps.getState(), { name: 'import/cancel-restore-preview' }));
    this.deps.render();
  }

  private async loadRetainedRecentHistoryForRestoreDuplicateCheck(): Promise<readonly ImageDisplayRecord[]> {
    const recentHistoryStore = this.deps.recentHistoryStore();
    if (!recentHistoryStore) return this.deps.getState().history;
    return recentHistoryStore.load(window.location.href, { includeRetained: true });
  }
}

function albumRestoreCompleteMessage(
  summary: {
    readonly importedAlbumCount: number;
    readonly importedMembershipCount: number;
    readonly skippedMembershipCount: number;
    readonly unavailable?: boolean;
  } | null,
): string {
  if (!summary) return '';
  if (summary.unavailable) return ' Albums were not restored because album storage is unavailable.';
  const restored = ` Restored ${summary.importedAlbumCount} album${summary.importedAlbumCount === 1 ? '' : 's'} with ${summary.importedMembershipCount} membership${summary.importedMembershipCount === 1 ? '' : 's'}.`;
  const skipped =
    summary.skippedMembershipCount > 0
      ? ` Skipped ${summary.skippedMembershipCount} album membership${summary.skippedMembershipCount === 1 ? '' : 's'} without a local record.`
      : '';
  return `${restored}${skipped}`;
}
