import { MESSAGE_PROTOCOL_VERSION, MessageType } from './message-protocol.js';

export interface OpenGalleryMessage {
  readonly type: typeof MessageType.OpenGallery;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface OpenGalleryResultMessage {
  readonly type: typeof MessageType.OpenGalleryResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    { readonly ok: true; readonly url: string; readonly tabId?: number | undefined } | { readonly ok: false; readonly message: string };
}

export function createOpenGalleryResultMessage(payload: OpenGalleryResultMessage['payload']): OpenGalleryResultMessage {
  return { type: MessageType.OpenGalleryResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}
