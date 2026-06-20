import type { CaptureResult, StorageUsageSummary } from '../core/image/capture-result.js';
import {
  createCaptureImageMessage,
  createCleanupOrphanedBlobsMessage,
  createCreateDataUrlPreviewMessage,
  createCreateBlobPreviewMessage,
  createDeleteBlobMessage,
  createRetrieveBlobMessage,
  createBlobKeyStatusMessage,
  createSetupBlobKeyMessage,
  createGrantPermissionAndCaptureMessage,
  createStorageUsageRequestMessage,
  createUnlockBlobKeyMessage,
  isBlobKeyStatusResultMessage,
  isBlobKeyResultMessage,
  isCaptureResultMessage,
  isCleanupOrphanedBlobsResultMessage,
  isCreateBlobPreviewResultMessage,
  isRetrieveBlobResultMessage,
} from '../background/messages.js';
import type { CaptureSourceType } from '../background/messages.js';
import type {
  BlobKeyResultMessage,
  BlobKeyStatusResultMessage,
  CreateBlobPreviewResultMessage,
  RetrieveBlobResultMessage,
} from '../background/messages.js';

export interface CaptureStore {
  readonly requestCapture: (url: string, sourceType: CaptureSourceType, sourceRecordId?: string) => Promise<CaptureResult>;
  readonly requestDeleteBlob: (blobId: string) => Promise<{ deleted: boolean; usage: StorageUsageSummary }>;
  readonly requestCleanupOrphanedBlobs: () => Promise<{ deletedCount: number; usage: StorageUsageSummary }>;
  readonly requestRetrieveBlob: (blobId: string) => Promise<RetrieveBlobResultMessage['payload']>;
  readonly requestBlobPreview: (blobId: string) => Promise<CreateBlobPreviewResultMessage['payload']>;
  readonly requestDataUrlPreview: (dataUrl: string) => Promise<CreateBlobPreviewResultMessage['payload']>;
  readonly requestStorageUsage: () => Promise<StorageUsageSummary>;
  readonly requestPermissionAndRetry: (url: string, sourceType: CaptureSourceType, sourceRecordId?: string) => Promise<CaptureResult>;
  readonly requestBlobKeyStatus: () => Promise<BlobKeyStatusResultMessage['payload']>;
  readonly setupBlobKey: (password: string) => Promise<BlobKeyResultMessage['payload']>;
  readonly unlockBlobKey: (password: string, keyReference?: string) => Promise<BlobKeyResultMessage['payload']>;
}

export class CaptureController implements CaptureStore {
  async requestCapture(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): Promise<CaptureResult> {
    const response = await chrome.runtime.sendMessage(createCaptureImageMessage(url, sourceType, sourceRecordId));
    if (isCaptureResultMessage(response)) {
      return response.payload;
    }
    return { status: 'failed', reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestPermissionAndRetry(url: string, sourceType: CaptureSourceType, sourceRecordId?: string): Promise<CaptureResult> {
    const response = await chrome.runtime.sendMessage(createGrantPermissionAndCaptureMessage(url, sourceType, sourceRecordId));
    if (isCaptureResultMessage(response)) {
      return response.payload;
    }
    return { status: 'failed', reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestDeleteBlob(blobId: string): Promise<{ deleted: boolean; usage: StorageUsageSummary }> {
    const response = await chrome.runtime.sendMessage(createDeleteBlobMessage(blobId));
    if (response && typeof response === 'object' && 'payload' in response) {
      return (response as { payload: { deleted: boolean; usage: StorageUsageSummary } }).payload;
    }
    return { deleted: false, usage: { totalBytes: 0, blobCount: 0 } };
  }

  async requestCleanupOrphanedBlobs(): Promise<{ deletedCount: number; usage: StorageUsageSummary }> {
    const response = await chrome.runtime.sendMessage(createCleanupOrphanedBlobsMessage());
    if (isCleanupOrphanedBlobsResultMessage(response)) return response.payload;
    return { deletedCount: 0, usage: { totalBytes: 0, blobCount: 0 } };
  }

  async requestRetrieveBlob(blobId: string): Promise<RetrieveBlobResultMessage['payload']> {
    const response = await chrome.runtime.sendMessage(createRetrieveBlobMessage(blobId));
    if (isRetrieveBlobResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestBlobPreview(blobId: string): Promise<CreateBlobPreviewResultMessage['payload']> {
    const response = await chrome.runtime.sendMessage(createCreateBlobPreviewMessage(blobId));
    if (isCreateBlobPreviewResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestDataUrlPreview(dataUrl: string): Promise<CreateBlobPreviewResultMessage['payload']> {
    const response = await chrome.runtime.sendMessage(createCreateDataUrlPreviewMessage(dataUrl));
    if (isCreateBlobPreviewResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async requestStorageUsage(): Promise<StorageUsageSummary> {
    const response = await chrome.runtime.sendMessage(createStorageUsageRequestMessage());
    if (response && typeof response === 'object' && 'payload' in response) {
      return (response as { payload: StorageUsageSummary }).payload;
    }
    return { totalBytes: 0, blobCount: 0 };
  }

  async requestBlobKeyStatus(): Promise<BlobKeyStatusResultMessage['payload']> {
    const response = await chrome.runtime.sendMessage(createBlobKeyStatusMessage());
    if (isBlobKeyStatusResultMessage(response)) return response.payload;
    return { unlocked: false, keyReference: null, hasKey: false };
  }

  async setupBlobKey(password: string): Promise<BlobKeyResultMessage['payload']> {
    const response = await chrome.runtime.sendMessage(createSetupBlobKeyMessage(password));
    if (isBlobKeyResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }

  async unlockBlobKey(password: string, keyReference?: string): Promise<BlobKeyResultMessage['payload']> {
    const response = await chrome.runtime.sendMessage(createUnlockBlobKeyMessage(password, keyReference));
    if (isBlobKeyResultMessage(response)) return response.payload;
    return { ok: false, reason: 'unknown', message: 'Invalid response from background.' };
  }
}
