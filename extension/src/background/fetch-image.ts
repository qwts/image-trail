import {
  classifyHttpFailure,
  DEFAULT_MAX_ORIGINAL_BYTES,
  isImageMimeType,
  normalizeOriginalByteLimit,
  tooLargeMessage,
  type CaptureFailure,
} from '../core/image/image-metadata.js';
import { sha256Hex } from '../core/image/fingerprints.js';
import type { StoredImageBlobRecord } from '../data/repositories/blobs-repository.js';
import { ensureOriginPermission, type HostPermissionAdapter } from './permissions.js';

export interface CapturedImageBytes {
  readonly ok: true;
  readonly record: StoredImageBlobRecord;
}

export type FetchImageResult = CapturedImageBytes | CaptureFailure;

export interface FetchImageOptions {
  readonly now?: string;
  readonly maxBytes?: number;
  readonly fetcher?: typeof fetch;
  readonly permissions?: HostPermissionAdapter;
  readonly requestPermission?: boolean;
}

export async function fetchImageForCapture(url: string, options: FetchImageOptions = {}): Promise<FetchImageResult> {
  const now = options.now ?? new Date().toISOString();
  const maxBytes = normalizeOriginalByteLimit(options.maxBytes ?? DEFAULT_MAX_ORIGINAL_BYTES);
  const fetcher = options.fetcher ?? fetch;

  if (options.requestPermission) {
    const permitted = await ensureOriginPermission(url, options.permissions);
    if (!permitted) return failure(url, 'remote-only', 'permission-denied', 'Origin permission was not granted.');
  }

  let response: Response;
  try {
    response = await fetcher(url, { credentials: 'include', cache: 'no-store' });
  } catch {
    return failure(
      url,
      'remote-only',
      options.requestPermission ? 'network-error' : 'permission-needed',
      'Image bytes could not be fetched.',
    );
  }

  if (!response.ok) {
    const reason = classifyHttpFailure(response.status);
    return failure(url, 'remote-only', reason, `Image fetch failed with HTTP ${response.status}.`);
  }

  const contentType = response.headers.get('content-type');
  if (!isImageMimeType(contentType)) return failure(url, 'failed', 'not-image', 'Fetched resource is not image data.');

  const declaredLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    return failure(url, 'remote-only', 'too-large', tooLargeMessage(declaredLength, maxBytes));
  }

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > maxBytes) return failure(url, 'remote-only', 'too-large', tooLargeMessage(bytes.byteLength, maxBytes));

  const sha256 = await sha256Hex(bytes);
  return {
    ok: true,
    record: {
      uuid: crypto.randomUUID(),
      kind: 'original',
      sourceUrl: url,
      mimeType: contentType?.split(';', 1)[0].trim().toLowerCase() ?? 'image/unknown',
      byteLength: bytes.byteLength,
      sha256,
      bytes,
      createdAt: now,
    },
  };
}

function failure(url: string, status: CaptureFailure['status'], reason: CaptureFailure['reason'], message: string): CaptureFailure {
  return { ok: false, status, url, reason, message };
}
