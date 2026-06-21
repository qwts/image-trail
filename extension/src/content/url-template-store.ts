import type { UrlTemplateRecord } from '../core/url/templates.js';
import {
  createDeleteUrlTemplateMessage,
  createListUrlTemplatesMessage,
  createSaveUrlTemplateMessage,
  isDeleteUrlTemplateResultMessage,
  isListUrlTemplatesResultMessage,
  isSaveUrlTemplateResultMessage,
} from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionUrlTemplateStore {
  async load(hostname: string): Promise<readonly UrlTemplateRecord[]> {
    const response = await sendRuntimeMessage(createListUrlTemplatesMessage(hostname));
    return isListUrlTemplatesResultMessage(response) && response.payload.ok ? response.payload.templates : [];
  }

  async save(template: UrlTemplateRecord): Promise<void> {
    const response = await sendRuntimeMessage(createSaveUrlTemplateMessage(template));
    if (!isSaveUrlTemplateResultMessage(response) || !response.payload.ok) {
      throw new Error('Invalid URL template save response from background.');
    }
  }

  async remove(hostname: string, id: string): Promise<void> {
    const response = await sendRuntimeMessage(createDeleteUrlTemplateMessage(hostname, id));
    if (!isDeleteUrlTemplateResultMessage(response) || !response.payload.ok) {
      throw new Error('Invalid URL template delete response from background.');
    }
  }
}
