export const DEFAULT_MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;
export const HARD_MAX_ORIGINAL_BYTES = 100 * 1024 * 1024;

export type CaptureFailureReason =
  | 'permission-needed'
  | 'permission-denied'
  | 'fetch-forbidden'
  | 'not-image'
  | 'too-large'
  | 'network-error'
  | 'auth-required'
  | 'canvas-tainted'
  | 'unknown';

export type CaptureStatus = 'captured' | 'remote-only' | 'failed';

export interface StoredOriginalReference {
  readonly blobId: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly capturedAt: string;
}

export interface CaptureSuccess {
  readonly ok: true;
  readonly status: 'captured';
  readonly url: string;
  readonly original: StoredOriginalReference;
  readonly storageUsage: StorageUsageSnapshot;
}

export interface CaptureFailure {
  readonly ok: false;
  readonly status: 'remote-only' | 'failed';
  readonly url: string;
  readonly reason: CaptureFailureReason;
  readonly message: string;
  readonly storageUsage?: StorageUsageSnapshot;
}

export type CaptureResult = CaptureSuccess | CaptureFailure;

export interface StorageUsageSnapshot {
  readonly originalBytes: number;
  readonly originalCount: number;
  readonly remoteOnlyCount: number;
  readonly failedCount: number;
  readonly updatedAt: string;
}

export function normalizeOriginalByteLimit(limit = DEFAULT_MAX_ORIGINAL_BYTES): number {
  if (!Number.isFinite(limit) || limit <= 0) return DEFAULT_MAX_ORIGINAL_BYTES;
  return Math.min(Math.floor(limit), HARD_MAX_ORIGINAL_BYTES);
}

export function isImageMimeType(contentType: string | null): boolean {
  return contentType?.split(';', 1)[0]?.trim().toLowerCase().startsWith('image/') ?? false;
}

export function classifyHttpFailure(status: number): CaptureFailureReason {
  if (status === 401 || status === 403) return 'auth-required';
  if (status >= 400) return 'fetch-forbidden';
  return 'unknown';
}

export function tooLargeMessage(byteLength: number, limit: number): string {
  return `Original is ${byteLength} bytes, above the ${limit} byte capture limit.`;
}
