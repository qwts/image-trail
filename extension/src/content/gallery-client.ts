import type { OpenGalleryResultMessage } from '../background/gallery-messages.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../background/message-protocol.js';
import { sendRuntimeMessage } from './runtime-message.js';

export async function openGalleryTab(): Promise<OpenGalleryResultMessage['payload']> {
  const response = await sendRuntimeMessage({ type: MessageType.OpenGallery, version: MESSAGE_PROTOCOL_VERSION, payload: {} });
  if (isOpenGalleryResult(response)) return response.payload;
  return { ok: false, message: 'Gallery tab could not be opened.' };
}

function isOpenGalleryResult(value: unknown): value is OpenGalleryResultMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { type?: unknown; version?: unknown; payload?: unknown };
  return (
    candidate.type === MessageType.OpenGalleryResult &&
    candidate.version === MESSAGE_PROTOCOL_VERSION &&
    isOpenGalleryPayload(candidate.payload)
  );
}

function isOpenGalleryPayload(value: unknown): value is OpenGalleryResultMessage['payload'] {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { ok?: unknown; url?: unknown; message?: unknown };
  if (candidate.ok === true) return typeof candidate.url === 'string';
  if (candidate.ok === false) return typeof candidate.message === 'string';
  return false;
}
