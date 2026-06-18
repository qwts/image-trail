import type { CaptureFailureReason } from '../core/image/capture-result.js';
import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';

const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/avif',
  'image/bmp',
  'image/x-icon',
  'image/vnd.microsoft.icon',
]);

export interface FetchImageSuccess {
  readonly ok: true;
  readonly bytes: ArrayBuffer;
  readonly mimeType: string;
  readonly byteLength: number;
}

export interface FetchImageFailure {
  readonly ok: false;
  readonly reason: CaptureFailureReason;
  readonly message: string;
}

export type FetchImageResult = FetchImageSuccess | FetchImageFailure;

export async function fetchImageBytes(url: string, maxBytes: number = DEFAULT_MAX_ORIGINAL_BYTES): Promise<FetchImageResult> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { ok: false, reason: 'network-error', message: 'Network request failed.' };
  }

  if (response.status === 401) {
    return { ok: false, reason: 'auth-required', message: 'Authentication required.' };
  }
  if (response.status === 403) {
    return { ok: false, reason: 'fetch-forbidden', message: 'Access forbidden by server.' };
  }
  if (!response.ok) {
    return { ok: false, reason: 'network-error', message: `HTTP ${response.status} ${response.statusText}` };
  }

  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return { ok: false, reason: 'not-image', message: `Response content-type "${contentType}" is not an image.` };
  }

  const declaredLength = response.headers.get('content-length');
  if (declaredLength && parseInt(declaredLength, 10) > maxBytes) {
    return { ok: false, reason: 'too-large', message: `Declared size ${declaredLength} bytes exceeds limit.` };
  }

  let bytes: ArrayBuffer;
  try {
    if (!response.body) {
      // Fallback for environments where ReadableStream is unavailable.
      bytes = await response.arrayBuffer();
    } else {
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return { ok: false, reason: 'too-large', message: `Actual size exceeds limit of ${maxBytes} bytes.` };
        }
        chunks.push(value);
      }

      // Concatenate chunks into a single ArrayBuffer.
      const merged = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      bytes = merged.buffer;
    }
  } catch {
    return { ok: false, reason: 'network-error', message: 'Failed to read response body.' };
  }

  if (bytes.byteLength > maxBytes) {
    return { ok: false, reason: 'too-large', message: `Actual size ${bytes.byteLength} bytes exceeds limit.` };
  }

  return { ok: true, bytes, mimeType: contentType, byteLength: bytes.byteLength };
}
