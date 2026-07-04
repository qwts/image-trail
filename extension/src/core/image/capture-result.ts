export type CaptureFailureReason =
  | 'permission-needed'
  | 'fetch-forbidden'
  | 'not-image'
  | 'too-large'
  | 'network-error'
  | 'auth-required'
  | 'canvas-tainted'
  | 'encryption-locked'
  | 'unknown';

export type CaptureStatus = 'captured' | 'remote-only' | 'failed';

export type CaptureResult =
  | {
      readonly status: 'captured';
      readonly blobId: string;
      readonly mimeType: string;
      readonly byteLength: number;
    }
  | { readonly status: 'remote-only'; readonly reason: CaptureFailureReason; readonly message: string; readonly origin?: string }
  | { readonly status: 'failed'; readonly reason: CaptureFailureReason; readonly message: string; readonly origin?: string };

export interface StoredOriginalReference {
  readonly blobId: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly capturedAt: string;
}

export interface StorageUsageBucketSummary {
  readonly count: number;
  readonly totalBytes: number;
}

export interface StorageUsageSummary {
  readonly blobCount: number;
  readonly totalBytes: number;
  readonly orphanedBlobCount?: number;
  readonly originals?: StorageUsageBucketSummary;
  readonly queueRecords?: StorageUsageBucketSummary;
  readonly thumbnails?: StorageUsageBucketSummary;
}

export const DEFAULT_MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

export function isCapturedResult(result: CaptureResult): result is CaptureResult & { status: 'captured' } {
  return result.status === 'captured';
}

export function isFailedResult(result: CaptureResult): result is CaptureResult & { status: 'remote-only' | 'failed' } {
  return result.status === 'remote-only' || result.status === 'failed';
}

export function captureFailureMessage(reason: CaptureFailureReason, origin?: string): string {
  switch (reason) {
    case 'permission-needed':
      return origin ? `Permission needed for ${origin}.` : 'Permission needed to fetch this image.';
    case 'fetch-forbidden':
      return 'The server refused access to this image.';
    case 'not-image':
      return 'The URL did not return image data.';
    case 'too-large':
      return `Image exceeds the ${DEFAULT_MAX_ORIGINAL_BYTES / (1024 * 1024)} MB size limit.`;
    case 'network-error':
      return 'A network error occurred while fetching the image.';
    case 'auth-required':
      return 'Authentication is required to access this image.';
    case 'canvas-tainted':
      return 'The image is tainted by cross-origin restrictions.';
    case 'encryption-locked':
      return 'Image capture is locked until encrypted blob storage is unlocked.';
    case 'unknown':
      return 'An unknown error occurred during capture.';
  }
}
