import type { CaptureResult, StorageUsageSummary } from '../core/image/capture-result.js';
import {
  createCaptureImageMessage,
  createCleanupOrphanedBlobsMessage,
  createCreateDataUrlPreviewMessage,
  createCreateBlobPreviewMessage,
  createDeleteBlobMessage,
  createExportOriginalBlobsMessage,
  createImportOriginalBlobsMessage,
  createRetrieveBlobMessage,
  createBlobKeyStatusMessage,
  createClearBlobKeyMessage,
  createSetupBlobKeyMessage,
  createExportBlobKeyBackupMessage,
  createGrantPermissionAndCaptureMessage,
  createImportBlobKeyBackupMessage,
  createStorageUsageRequestMessage,
  createUnlockBlobKeyMessage,
  isBlobKeyStatusResultMessage,
  isBlobKeyResultMessage,
  isCaptureResultMessage,
  isCleanupOrphanedBlobsResultMessage,
  isCreateBlobPreviewResultMessage,
  isExportBlobKeyBackupResultMessage,
  isExportOriginalBlobsResultMessage,
  isImportOriginalBlobsResultMessage,
  isImportBlobKeyBackupResultMessage,
  isRetrieveBlobResultMessage,
} from '../background/messages.js';
import type { CaptureSourceType } from '../background/messages.js';
import type {
  BlobKeyResultMessage,
  BlobKeyStatusResultMessage,
  CreateBlobPreviewResultMessage,
  ExportBlobKeyBackupResultMessage,
  ImportBlobKeyBackupResultMessage,
  RetrieveBlobResultMessage,
} from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export interface CaptureStore {
  readonly requestCapture: (url: string, sourceType: CaptureSourceType, sourceRecordId?: string) => Promise<CaptureResult>;
  readonly requestDeleteBlob: (blobId: string) => Promise<{ deleted: boolean; usage: StorageUsageSummary }>;
  readonly requestCleanupOrphanedBlobs: () => Promise<{ deletedCount: number; usage: StorageUsageSummary }>;
  readonly requestRetrieveBlob: (blobId: string) => Promise<RetrieveBlobResultMessage['payload']>;
  readonly requestOriginalBlobRecords: (
    blobIds: readonly string[],
  ) => Promise<import('../background/messages.js').ExportOriginalBlobsResultMessage['payload']>;
  readonly importOriginalBlobRecords: (
    records: readonly import('../data/import-export/full-backup.js').PortableStoredBlobRecord[],
  ) => Promise<import('../background/messages.js').ImportOriginalBlobsResultMessage['payload']>;
  readonly requestBlobPreview: (blobId: string) => Promise<CreateBlobPreviewResultMessage['payload']>;
  readonly requestDataUrlPreview: (dataUrl: string) => Promise<CreateBlobPreviewResultMessage['payload']>;
  readonly requestStorageUsage: () => Promise<StorageUsageSummary>;
  readonly requestPermissionAndRetry: (url: string, sourceType: CaptureSourceType, sourceRecordId?: string) => Promise<CaptureResult>;
  readonly requestBlobKeyStatus: () => Promise<BlobKeyStatusResultMessage['payload']>;
  readonly setupBlobKey: (password: string) => Promise<BlobKeyResultMessage['payload']>;
  readonly unlockBlobKey: (password: string, keyReference?: string) => Promise<BlobKeyResultMessage['payload']>;
  readonly clearBlobKey: () => Promise<BlobKeyResultMessage['payload']>;
  readonly exportBlobKeyBackup: (password: string, keyReference?: string) => Promise<ExportBlobKeyBackupResultMessage['payload']>;
  readonly importBlobKeyBackup: (fileContent: string, password: string) => Promise<ImportBlobKeyBackupResultMessage['payload']>;
}

export class CaptureController implements CaptureStore {
  async requestCapture(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): Promise<CaptureResult> {
    const response = await sendRuntimeMessage(createCaptureImageMessage(url, sourceType, sourceRecordId));
    if (isCaptureResultMessage(response)) {
      return response.payload;
    }
    return { status: 'failed', reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestPermissionAndRetry(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): Promise<CaptureResult> {
    const response = await sendRuntimeMessage(createGrantPermissionAndCaptureMessage(url, sourceType, sourceRecordId));
    if (isCaptureResultMessage(response)) {
      return response.payload;
    }
    return { status: 'failed', reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestDeleteBlob(blobId: string): Promise<{ deleted: boolean; usage: StorageUsageSummary }> {
    const response = await sendRuntimeMessage(createDeleteBlobMessage(blobId));
    if (response && typeof response === 'object' && 'payload' in response) {
      return (response as { payload: { deleted: boolean; usage: StorageUsageSummary } }).payload;
    }
    return { deleted: false, usage: { totalBytes: 0, blobCount: 0 } };
  }

  async requestCleanupOrphanedBlobs(): Promise<{ deletedCount: number; usage: StorageUsageSummary }> {
    const response = await sendRuntimeMessage(createCleanupOrphanedBlobsMessage());
    if (isCleanupOrphanedBlobsResultMessage(response)) return response.payload;
    return { deletedCount: 0, usage: { totalBytes: 0, blobCount: 0 } };
  }

  async requestRetrieveBlob(blobId: string): Promise<RetrieveBlobResultMessage['payload']> {
    const response = await sendRuntimeMessage(createRetrieveBlobMessage(blobId));
    if (isRetrieveBlobResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestOriginalBlobRecords(
    blobIds: readonly string[],
  ): Promise<import('../background/messages.js').ExportOriginalBlobsResultMessage['payload']> {
    const response = await sendRuntimeMessage(createExportOriginalBlobsMessage(blobIds));
    if (isExportOriginalBlobsResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async importOriginalBlobRecords(
    records: readonly import('../data/import-export/full-backup.js').PortableStoredBlobRecord[],
  ): Promise<import('../background/messages.js').ImportOriginalBlobsResultMessage['payload']> {
    const response = await sendRuntimeMessage(createImportOriginalBlobsMessage(records));
    if (isImportOriginalBlobsResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestBlobPreview(blobId: string): Promise<CreateBlobPreviewResultMessage['payload']> {
    const response = await sendRuntimeMessage(createCreateBlobPreviewMessage(blobId));
    if (isCreateBlobPreviewResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestDataUrlPreview(dataUrl: string): Promise<CreateBlobPreviewResultMessage['payload']> {
    const response = await sendRuntimeMessage(createCreateDataUrlPreviewMessage(dataUrl));
    if (isCreateBlobPreviewResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestStorageUsage(): Promise<StorageUsageSummary> {
    const response = await sendRuntimeMessage(createStorageUsageRequestMessage());
    if (response && typeof response === 'object' && 'payload' in response) {
      return (response as { payload: StorageUsageSummary }).payload;
    }
    return { totalBytes: 0, blobCount: 0 };
  }

  async requestBlobKeyStatus(): Promise<BlobKeyStatusResultMessage['payload']> {
    const response = await sendRuntimeMessage(createBlobKeyStatusMessage());
    if (isBlobKeyStatusResultMessage(response)) return response.payload;
    return { unlocked: false, keyReference: null, hasKey: false };
  }

  async setupBlobKey(password: string): Promise<BlobKeyResultMessage['payload']> {
    const response = await sendRuntimeMessage(createSetupBlobKeyMessage(password));
    if (isBlobKeyResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async unlockBlobKey(password: string, keyReference?: string): Promise<BlobKeyResultMessage['payload']> {
    const response = await sendRuntimeMessage(createUnlockBlobKeyMessage(password, keyReference));
    if (isBlobKeyResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async clearBlobKey(): Promise<BlobKeyResultMessage['payload']> {
    const response = await sendRuntimeMessage(createClearBlobKeyMessage());
    if (isBlobKeyResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async exportBlobKeyBackup(password: string, keyReference?: string): Promise<ExportBlobKeyBackupResultMessage['payload']> {
    const response = await sendRuntimeMessage(createExportBlobKeyBackupMessage(password, keyReference));
    if (isExportBlobKeyBackupResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async importBlobKeyBackup(fileContent: string, password: string): Promise<ImportBlobKeyBackupResultMessage['payload']> {
    const response = await sendRuntimeMessage(createImportBlobKeyBackupMessage(fileContent, password));
    if (isImportBlobKeyBackupResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }
}
