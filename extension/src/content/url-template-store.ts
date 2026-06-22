import type { GrabSourcePattern, UrlTemplateRecord } from '../core/url/templates.js';
import {
  createDeleteGrabSourcePatternMessage,
  createDeleteUrlTemplateMessage,
  createListGrabSourcePatternsMessage,
  createListUrlTemplatesMessage,
  createSaveGrabSourcePatternMessage,
  createSaveUrlTemplateMessage,
  isDeleteGrabSourcePatternResultMessage,
  isDeleteUrlTemplateResultMessage,
  isListGrabSourcePatternsResultMessage,
  isListUrlTemplatesResultMessage,
  isSaveGrabSourcePatternResultMessage,
  isSaveUrlTemplateResultMessage,
} from '../background/messages.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionUrlTemplateStore {
  async load(hostname: string): Promise<readonly UrlTemplateRecord[]> {
    const response = await sendRuntimeMessage(createListUrlTemplatesMessage(hostname));
    return isListUrlTemplatesResultMessage(response) && response.payload.ok ? response.payload.templates : [];
  }

  async loadGrabSourcePatterns(hostname: string): Promise<readonly GrabSourcePattern[]> {
    const response = await sendRuntimeMessage(createListGrabSourcePatternsMessage(hostname));
    return isListGrabSourcePatternsResultMessage(response) && response.payload.ok ? response.payload.patterns : [];
  }

  async save(template: UrlTemplateRecord): Promise<void> {
    const response = await sendRuntimeMessage(createSaveUrlTemplateMessage(template));
    if (!isSaveUrlTemplateResultMessage(response) || !response.payload.ok) {
      throw new Error('Invalid URL template save response from background.');
    }
  }

  async saveGrabSourcePattern(pattern: GrabSourcePattern): Promise<void> {
    const response = await sendRuntimeMessage(createSaveGrabSourcePatternMessage(pattern));
    if (!isSaveGrabSourcePatternResultMessage(response) || !response.payload.ok) {
      throw new Error('Invalid grab source pattern save response from background.');
    }
  }

  async remove(hostname: string, id: string): Promise<void> {
    const response = await sendRuntimeMessage(createDeleteUrlTemplateMessage(hostname, id));
    if (!isDeleteUrlTemplateResultMessage(response) || !response.payload.ok) {
      throw new Error('Invalid URL template delete response from background.');
    }
  }

  async removeGrabSourcePattern(hostname: string, id: string): Promise<void> {
    const response = await sendRuntimeMessage(createDeleteGrabSourcePatternMessage(hostname, id));
    if (!isDeleteGrabSourcePatternResultMessage(response) || !response.payload.ok) {
      throw new Error('Invalid grab source pattern delete response from background.');
    }
  }
}
