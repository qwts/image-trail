import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';
import { sanitizeFilename } from '../core/image/downloads.js';
import { inspectGifWebpMedia } from '../core/image/gif-webp-media.js';
import type { BlobPayloadMetadata } from '../data/crypto/binary-envelope.js';
import type { FetchImageResult } from './fetch-image.js';

const MAX_ENCODED_IMAGE_DATA_URL_LENGTH = 4 * Math.ceil(DEFAULT_MAX_ORIGINAL_BYTES / 3) + 128;
const IMAGE_MIME_TYPE = /^image\/[a-z0-9.+-]+$/u;

export type OpenedImageDataResult =
  | {
      readonly ok: true;
      readonly dataUrl: string;
      readonly mimeType: string;
      readonly byteLength: number;
      readonly capturedAt: string;
      readonly fileName?: string | undefined;
      readonly width?: number | undefined;
      readonly height?: number | undefined;
      readonly mediaInfo?: import('../core/image/gif-webp-media.js').GifWebpMediaInfo | undefined;
    }
  | { readonly ok: false; readonly reason: 'corrupt-original'; readonly message: string };

export function dataUrlToImageBytes(dataUrl: string): FetchImageResult {
  if (dataUrl.length > MAX_ENCODED_IMAGE_DATA_URL_LENGTH) return oversizedDataUrl();
  const match = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return invalidDataUrl();

  const mimeType = match[1]!.toLowerCase();
  const base64 = match[2]!.replace(/\s/gu, '');
  if (Math.floor((base64.length * 3) / 4) > DEFAULT_MAX_ORIGINAL_BYTES) return oversizedDataUrl();

  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength > DEFAULT_MAX_ORIGINAL_BYTES) return oversizedDataUrl();

    const media = inspectGifWebpMedia(bytes, mimeType);
    if (media.status === 'invalid') {
      return {
        ok: false,
        reason: media.reason === 'probe-limit' ? 'too-large' : 'not-image',
        message: media.message,
      };
    }
    return media.status === 'supported'
      ? {
          ok: true,
          bytes: bytes.buffer,
          mimeType: media.mimeType,
          byteLength: bytes.byteLength,
          width: media.width,
          height: media.height,
          mediaInfo: media.mediaInfo,
        }
      : { ok: true, bytes: bytes.buffer, mimeType, byteLength: bytes.byteLength };
  } catch {
    return invalidDataUrl();
  }
}

export function openedImageDataFromPayload(bytes: ArrayBuffer, metadata: BlobPayloadMetadata): OpenedImageDataResult {
  if (bytes.byteLength !== metadata.byteLength) {
    return { ok: false, reason: 'corrupt-original', message: 'Encrypted original byte length does not match its authenticated metadata.' };
  }
  const media = inspectGifWebpMedia(bytes, metadata.mimeType);
  if (media.status === 'invalid') return { ok: false, reason: 'corrupt-original', message: media.message };
  if (media.status === 'not-gif-webp' && !IMAGE_MIME_TYPE.test(metadata.mimeType)) {
    return { ok: false, reason: 'corrupt-original', message: 'Encrypted original MIME type is invalid.' };
  }

  const mimeType = media.status === 'supported' ? media.mimeType : metadata.mimeType;
  const width = media.status === 'supported' ? media.width : positiveInteger(metadata.width);
  const height = media.status === 'supported' ? media.height : positiveInteger(metadata.height);
  return {
    ok: true,
    dataUrl: imageDataUrlFromBytes(bytes, mimeType),
    mimeType,
    byteLength: bytes.byteLength,
    capturedAt: metadata.capturedAt,
    ...(metadata.fileName ? { fileName: sanitizeFilename(metadata.fileName, 'image', 240) } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(media.status === 'supported' ? { mediaInfo: media.mediaInfo } : {}),
  };
}

export function imageDataUrlFromBytes(bytes: ArrayBuffer | Uint8Array, mimeType: string): string {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunks: string[] = [];
  for (let offset = 0; offset < source.length; offset += 0x8000) {
    chunks.push(String.fromCharCode(...source.subarray(offset, offset + 0x8000)));
  }
  return `data:${mimeType};base64,${btoa(chunks.join(''))}`;
}

function positiveInteger(value: number | undefined): number | undefined {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value : undefined;
}

function invalidDataUrl(): FetchImageResult {
  return { ok: false, reason: 'not-image', message: 'Imported image data could not be decoded.' };
}

function oversizedDataUrl(): FetchImageResult {
  return {
    ok: false,
    reason: 'too-large',
    message: `Image exceeds the ${DEFAULT_MAX_ORIGINAL_BYTES / (1024 * 1024)} MB size limit.`,
  };
}
