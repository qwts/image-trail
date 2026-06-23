import {
  createImportUrlReviewStatusMessage,
  createListUrlReviewStatusMessage,
  createSaveUrlReviewStatusMessage,
  createClearUrlReviewStatusMessage,
  isClearUrlReviewStatusResultMessage,
  isImportUrlReviewStatusResultMessage,
  isListUrlReviewStatusResultMessage,
  isSaveUrlReviewStatusResultMessage,
} from '../background/messages.js';
import type { UrlReviewStatusRecord, UrlReviewStatusStore } from '../core/types.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionUrlReviewStatusStore implements UrlReviewStatusStore {
  async list(hostname: string): Promise<readonly UrlReviewStatusRecord[]> {
    const response = await sendRuntimeMessage(createListUrlReviewStatusMessage(hostname));
    return isListUrlReviewStatusResultMessage(response) && response.payload.ok ? response.payload.records : [];
  }

  async save(record: UrlReviewStatusRecord): Promise<void> {
    const response = await sendRuntimeMessage(createSaveUrlReviewStatusMessage(record));
    if (response === null || (isSaveUrlReviewStatusResultMessage(response) && response.payload.ok)) return;
    throw new Error('Invalid URL review status save response from background.');
  }

  async importMany(records: readonly UrlReviewStatusRecord[]): Promise<number> {
    const response = await sendRuntimeMessage(createImportUrlReviewStatusMessage(records));
    return isImportUrlReviewStatusResultMessage(response) && response.payload.ok ? response.payload.importedCount : 0;
  }

  async clear(hostname: string): Promise<number> {
    const response = await sendRuntimeMessage(createClearUrlReviewStatusMessage(hostname));
    return isClearUrlReviewStatusResultMessage(response) && response.payload.ok ? response.payload.deletedCount : 0;
  }
}
