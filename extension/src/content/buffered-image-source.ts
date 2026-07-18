import {
  createFetchBufferedImageSourceMessage,
  createProbeImageSourceMessage,
  isFetchBufferedImageSourceResultMessage,
  isProbeImageSourceResultMessage,
} from '../background/messages.js';
import type { ImageProbeMethod, ImageRequestIntent } from '../core/image/request-policy.js';
import { sendRuntimeMessage } from './runtime-message.js';

export type ProbeBufferedImageResult =
  | { readonly ok: true; readonly status: number; readonly finalUrl: string }
  | { readonly ok: false; readonly status?: number; readonly message: string };

export type FetchDecodedBufferedImageResult =
  | { readonly ok: true; readonly blobUrl: string; readonly imgElement: HTMLImageElement; readonly sha256: string | null }
  | { readonly ok: false; readonly message: string };

const BASE64_IMAGE_DATA_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/]*={0,2})$/iu;

export function imageBlobFromDataUrl(dataUrl: string, expectedMimeType: string): Blob | null {
  const match = BASE64_IMAGE_DATA_URL_PATTERN.exec(dataUrl);
  if (!match || match[1]?.toLowerCase() !== expectedMimeType.toLowerCase()) return null;
  try {
    const decoded = atob(match[2] ?? '');
    const bytes = new Uint8Array(decoded.length);
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
    return new Blob([bytes], { type: expectedMimeType });
  } catch {
    return null;
  }
}

export async function probeBufferedImageSource(
  url: string,
  timeoutMs = 8000,
  options: { readonly contextKey?: string; readonly probeMethod?: ImageProbeMethod } = {},
): Promise<ProbeBufferedImageResult> {
  try {
    console.debug('Image Trail buffered probe via extension service worker.', { url, probeMethod: options.probeMethod ?? 'get' });
    const response = await sendRuntimeMessage(createProbeImageSourceMessage(url, document.location.href, timeoutMs, options));
    if (isProbeImageSourceResultMessage(response)) {
      if (!response.payload.ok) {
        console.debug('Image Trail buffered probe found an unavailable candidate.', {
          url,
          status: response.payload.status,
          message: response.payload.message,
        });
      }
      return response.payload;
    }
  } catch (error) {
    console.error('Image Trail buffered probe failed in the extension service worker.', { url, error });
  }
  return { ok: false, message: 'Image probe failed.' };
}

export async function fetchDecodedBufferedImageSource(
  url: string,
  options: { readonly intent?: ImageRequestIntent; readonly contextKey?: string } = {},
): Promise<FetchDecodedBufferedImageResult> {
  try {
    const response = await sendRuntimeMessage(createFetchBufferedImageSourceMessage(url, document.location.href, options));
    if (!isFetchBufferedImageSourceResultMessage(response)) return { ok: false, message: 'Buffered image fetch failed.' };
    if (!response.payload.ok) return { ok: false, message: response.payload.message };
    const blob = imageBlobFromDataUrl(response.payload.dataUrl, response.payload.mimeType);
    if (!blob || blob.size !== response.payload.byteLength) return { ok: false, message: 'Buffered image fetch failed.' };
    const blobUrl = URL.createObjectURL(blob);
    const imgElement = new Image();
    imgElement.src = blobUrl;
    try {
      await imgElement.decode();
    } catch {
      URL.revokeObjectURL(blobUrl);
      return { ok: false, message: 'Image decode failed.' };
    }
    return { ok: true, blobUrl, imgElement, sha256: response.payload.sha256 ?? null };
  } catch {
    return { ok: false, message: 'Buffered image fetch failed.' };
  }
}
