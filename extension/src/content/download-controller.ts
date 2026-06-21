import { createDownloadImageMessage, isDownloadImageResultMessage } from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export interface ImageDownloadRequest {
  readonly url: string;
  readonly fileName: string;
  readonly saveAs: boolean;
}

export async function requestImageDownload(
  request: ImageDownloadRequest,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }> {
  const response = await sendRuntimeMessage(createDownloadImageMessage(request.url, request.fileName, request.saveAs));
  if (!isDownloadImageResultMessage(response)) return { ok: false, message: 'Image download could not be started.' };
  return response.payload.ok ? { ok: true } : { ok: false, message: response.payload.message };
}
