import { MessageType } from '../message-protocol.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import { createOpenGalleryResultMessage, type OpenGalleryMessage, type OpenGalleryResultMessage } from '../gallery-messages.js';
import type { ExtensionRequest, ExtensionResponse } from '../messages.js';

const GALLERY_PAGE_FILE = 'src/gallery/gallery.html';

type GalleryRequestType = typeof MessageType.OpenGallery;

async function openGalleryPage(): Promise<OpenGalleryResultMessage['payload']> {
  try {
    const url = chrome.runtime.getURL(GALLERY_PAGE_FILE);
    const tab = await chrome.tabs.create({ url });
    return { ok: true, url, tabId: tab.id };
  } catch {
    return { ok: false, message: 'Gallery tab could not be opened.' };
  }
}

export function createGalleryMessageRegistry(): Record<GalleryRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  return {
    [MessageType.OpenGallery]: defineMessage({
      requestSchema: requestSchemas.emptyPayloadSchema,
      handle: (_message: OpenGalleryMessage) => openGalleryPage(),
      respond: (payload) => createOpenGalleryResultMessage(payload),
      fallback: () => createOpenGalleryResultMessage({ ok: false, message: 'Gallery tab could not be opened.' }),
    }),
  };
}
