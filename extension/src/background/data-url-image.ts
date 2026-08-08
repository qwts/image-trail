import { DEFAULT_MAX_ORIGINAL_BYTES } from '../core/image/capture-result.js';
import { alignFilenameWithVerifiedExtension, sanitizeFilename } from '../core/image/downloads.js';
import { inspectSpecializedMedia } from '../core/media/inspect-media.js';
import type { StoredMediaInfo } from '../core/media/media-info.js';
import type { BlobPayloadMetadata } from '../data/crypto/binary-envelope.js';
import type { FetchImageResult } from './fetch-image.js';

const MAX_ENCODED_MEDIA_DATA_URL_LENGTH = 4 * Math.ceil(DEFAULT_MAX_ORIGINAL_BYTES / 3) + 128;
const IMAGE_MIME_TYPE = /^image\/[a-z0-9.+-]+$/u;
const DATA_URL_MIME_TYPE =
  /^(?:image\/[a-z0-9.+-]+|video\/(?:mp2t|mp4|quicktime|webm|x-matroska|x-msvideo|mpeg)|audio\/(?:mp4|webm|x-matroska|x-msvideo|mpeg))$/u;

export type OpenedImageDataResult =
  | {
      readonly ok: true;
      readonly dataUrl: string;
      readonly mimeType: string;
      readonly byteLength: number;
      readonly capturedAt: string;
      readonly fileName?: string | undefined;
      readonly sha256?: string | undefined;
      readonly width?: number | undefined;
      readonly height?: number | undefined;
      readonly mediaInfo?: StoredMediaInfo | undefined;
    }
  | { readonly ok: false; readonly reason: 'corrupt-original'; readonly message: string };

export function isSupportedMediaDataUrl(value: string): boolean {
  const mimeType = /^data:((?:image|video|audio)\/[a-z0-9.+-]+)[;,]/iu.exec(value)?.[1]?.toLowerCase();
  return mimeType !== undefined && DATA_URL_MIME_TYPE.test(mimeType);
}

export function dataUrlToImageBytes(dataUrl: string, fileName = ''): FetchImageResult {
  if (dataUrl.length > MAX_ENCODED_MEDIA_DATA_URL_LENGTH) return oversizedDataUrl();
  const match = /^data:((?:image|video|audio)\/[a-z0-9.+-]+);base64,([a-z0-9+/=\s]+)$/iu.exec(dataUrl);
  if (!match) return invalidDataUrl();

  const mimeType = match[1]!.toLowerCase();
  if (!DATA_URL_MIME_TYPE.test(mimeType)) return invalidDataUrl();
  const base64 = match[2]!.replace(/\s/gu, '');
  if (Math.floor((base64.length * 3) / 4) > DEFAULT_MAX_ORIGINAL_BYTES) return oversizedDataUrl();

  try {
    const binary = atob(base64);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    if (bytes.byteLength > DEFAULT_MAX_ORIGINAL_BYTES) return oversizedDataUrl();

    const media = inspectSpecializedMedia(bytes, mimeType, fileName);
    if (media.status === 'invalid') {
      return {
        ok: false,
        reason: media.reason === 'probe-limit' ? 'too-large' : IMAGE_MIME_TYPE.test(mimeType) ? 'not-image' : 'not-media',
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
          ...(fileName ? { fileName: verifiedMediaFileName(fileName, media.mediaInfo.kind, media.extension) } : {}),
        }
      : { ok: true, bytes: bytes.buffer, mimeType, byteLength: bytes.byteLength };
  } catch {
    return invalidDataUrl();
  }
}

function verifiedMediaFileName(fileName: string, kind: StoredMediaInfo['kind'], extension: string | undefined): string {
  const fallbackBase = kind === 'gif' || kind === 'webp' ? 'image' : 'media';
  const verifiedExtension = extension ?? (kind === 'mpeg-ts' ? 'ts' : kind);
  return alignFilenameWithVerifiedExtension(fileName, verifiedExtension, fallbackBase);
}

export function openedImageDataFromPayload(bytes: ArrayBuffer, metadata: BlobPayloadMetadata): OpenedImageDataResult {
  if (bytes.byteLength !== metadata.byteLength) {
    return { ok: false, reason: 'corrupt-original', message: 'Encrypted original byte length does not match its authenticated metadata.' };
  }
  const media = inspectSpecializedMedia(bytes, metadata.mimeType, metadata.fileName ?? metadata.sourceUrl);
  if (media.status === 'invalid') return { ok: false, reason: 'corrupt-original', message: media.message };
  if (media.status === 'unclassified' && !IMAGE_MIME_TYPE.test(metadata.mimeType)) {
    return { ok: false, reason: 'corrupt-original', message: 'Encrypted original MIME type is invalid.' };
  }

  const mimeType = media.status === 'supported' ? media.mimeType : metadata.mimeType;
  const width = media.status === 'supported' ? media.width : positiveInteger(metadata.width);
  const height = media.status === 'supported' ? media.height : positiveInteger(metadata.height);
  const fileName = openedMediaFileName(metadata.fileName, media);
  return {
    ok: true,
    dataUrl: imageDataUrlFromBytes(bytes, mimeType),
    mimeType,
    byteLength: bytes.byteLength,
    capturedAt: metadata.capturedAt,
    ...(fileName ? { fileName } : {}),
    ...(metadata.sha256 ? { sha256: metadata.sha256 } : {}),
    ...(width ? { width } : {}),
    ...(height ? { height } : {}),
    ...(media.status === 'supported' ? { mediaInfo: media.mediaInfo } : {}),
  };
}

function openedMediaFileName(fileName: string | undefined, media: ReturnType<typeof inspectSpecializedMedia>): string | undefined {
  if (!fileName) return undefined;
  return media.status === 'supported'
    ? verifiedMediaFileName(fileName, media.mediaInfo.kind, media.extension)
    : sanitizeFilename(fileName, 'media', 240);
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
  return { ok: false, reason: 'not-media', message: 'Imported media data could not be decoded.' };
}

function oversizedDataUrl(): FetchImageResult {
  return {
    ok: false,
    reason: 'too-large',
    message: `Media exceeds the ${DEFAULT_MAX_ORIGINAL_BYTES / (1024 * 1024)} MB size limit.`,
  };
}
