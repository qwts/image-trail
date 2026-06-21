import {
  createDownloadImageMessage,
  createExportEncryptedImageMessage,
  createImportEncryptedImageMessage,
  isDownloadImageResultMessage,
  isExportEncryptedImageResultMessage,
  isImportEncryptedImageResultMessage,
} from '../background/messages.js';
import type { ExportEncryptedImageResultMessage, ImportEncryptedImageResultMessage } from '../background/messages.js';
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

export interface EncryptedImageExportRequest {
  readonly url: string;
  readonly fileName: string;
  readonly blobId?: string;
}

export async function requestEncryptedImageExport(
  request: EncryptedImageExportRequest,
): Promise<ExportEncryptedImageResultMessage['payload']> {
  const response = await sendRuntimeMessage(createExportEncryptedImageMessage(request.url, request.fileName, request.blobId));
  if (isExportEncryptedImageResultMessage(response)) return response.payload;
  return { ok: false, reason: 'unknown', message: 'Encrypted image export could not be started.' };
}

export async function requestEncryptedImageImport(fileContent: string): Promise<ImportEncryptedImageResultMessage['payload']> {
  const response = await sendRuntimeMessage(createImportEncryptedImageMessage(fileContent));
  if (isImportEncryptedImageResultMessage(response)) return response.payload;
  return { ok: false, reason: 'unknown', message: 'Encrypted image import could not be started.' };
}
