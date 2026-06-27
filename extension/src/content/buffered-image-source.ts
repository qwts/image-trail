import {
  createFetchBufferedImageSourceMessage,
  createProbeImageSourceMessage,
  isFetchBufferedImageSourceResultMessage,
  isProbeImageSourceResultMessage,
} from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export type ProbeBufferedImageResult =
  | { readonly ok: true; readonly status: number; readonly finalUrl: string }
  | { readonly ok: false; readonly status?: number; readonly message: string };

export type FetchDecodedBufferedImageResult =
  | { readonly ok: true; readonly blobUrl: string; readonly imgElement: HTMLImageElement; readonly sha256: string | null }
  | { readonly ok: false; readonly message: string };

export async function probeBufferedImageSource(url: string, timeoutMs = 8000): Promise<ProbeBufferedImageResult> {
  try {
    console.debug('Image Trail buffered HEAD probe via extension service worker.', { url });
    const response = await sendRuntimeMessage(createProbeImageSourceMessage(url, document.location.href, timeoutMs));
    if (isProbeImageSourceResultMessage(response)) {
      if (!response.payload.ok) {
        console.error('Image Trail buffered HEAD probe failed in the extension service worker.', {
          url,
          status: response.payload.status,
          message: response.payload.message,
        });
      }
      return response.payload;
    }
  } catch (error) {
    console.error('Image Trail buffered HEAD probe failed in the extension service worker.', { url, error });
  }
  return { ok: false, message: 'Image probe failed.' };
}

export async function fetchDecodedBufferedImageSource(url: string): Promise<FetchDecodedBufferedImageResult> {
  try {
    const response = await sendRuntimeMessage(createFetchBufferedImageSourceMessage(url, document.location.href));
    if (!isFetchBufferedImageSourceResultMessage(response)) return { ok: false, message: 'Buffered image fetch failed.' };
    if (!response.payload.ok) return { ok: false, message: response.payload.message };
    const blobUrl = URL.createObjectURL(new Blob([response.payload.bytes], { type: response.payload.mimeType }));
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
