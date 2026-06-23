import {
  createLoadParsedFieldStateBySourceMessage,
  createLoadParsedFieldStateMessage,
  createSaveParsedFieldStateMessage,
  isLoadParsedFieldStateBySourceResultMessage,
  isLoadParsedFieldStateResultMessage,
  isSaveParsedFieldStateResultMessage,
} from '../background/messages.js';
import type { ParsedFieldStateRecord, ParsedFieldStateStore } from '../core/types.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionParsedFieldStateStore implements ParsedFieldStateStore {
  async load(hostname: string, pageUrl: string): Promise<ParsedFieldStateRecord | null> {
    const response = await sendRuntimeMessage(createLoadParsedFieldStateMessage(hostname, pageUrl));
    return isLoadParsedFieldStateResultMessage(response) && response.payload.ok ? response.payload.record : null;
  }

  async loadForSource(hostname: string, sourceUrl: string): Promise<ParsedFieldStateRecord | null> {
    const response = await sendRuntimeMessage(createLoadParsedFieldStateBySourceMessage(hostname, sourceUrl));
    return isLoadParsedFieldStateBySourceResultMessage(response) && response.payload.ok ? response.payload.record : null;
  }

  async save(record: ParsedFieldStateRecord): Promise<void> {
    const response = await sendRuntimeMessage(createSaveParsedFieldStateMessage(record));
    if (response === null || (isSaveParsedFieldStateResultMessage(response) && response.payload.ok)) return;
    throw new Error('Invalid parsed field state save response from background.');
  }
}
