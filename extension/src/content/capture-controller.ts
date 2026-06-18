import type { CaptureResult, StorageUsageSummary } from '../core/image/capture-result.js';
import {
  createCaptureImageMessage,
  createDeleteBlobMessage,
  createGrantPermissionAndCaptureMessage,
  createStorageUsageRequestMessage,
  isCaptureResultMessage,
} from '../background/messages.js';
import type { CaptureSourceType } from '../background/messages.js';

export interface CaptureStore {
  readonly requestCapture: (url: string, sourceType: CaptureSourceType, sourceRecordId?: string) => Promise<CaptureResult>;
  readonly requestDeleteBlob: (blobId: string) => Promise<{ deleted: boolean; usage: StorageUsageSummary }>;
  readonly requestStorageUsage: () => Promise<StorageUsageSummary>;
  readonly requestPermissionAndRetry: (url: string, sourceType: CaptureSourceType, sourceRecordId?: string) => Promise<CaptureResult>;
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

  async requestStorageUsage(): Promise<StorageUsageSummary> {
    const response = await chrome.runtime.sendMessage(createStorageUsageRequestMessage());
    if (response && typeof response === 'object' && 'payload' in response) {
      return (response as { payload: StorageUsageSummary }).payload;
    }
    return { totalBytes: 0, blobCount: 0 };
  }
}
