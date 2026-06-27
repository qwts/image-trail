import {
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createRemoveRecentHistoryMessage,
  isAddRecentHistoryResultMessage,
  isLoadRecentHistoryResultMessage,
  isRemoveRecentHistoryResultMessage,
} from '../background/messages.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class RecentHistoryStore {
  async load(pageUrl = window.location.href, options: { readonly includeRetained?: boolean } = {}): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createLoadRecentHistoryMessage(pageUrl, options));
    return isLoadRecentHistoryResultMessage(response) ? response.payload.items : [];
  }

  async add(item: ImageDisplayRecord, pageUrl = window.location.href): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createAddRecentHistoryMessage(pageUrl, item));
    return isAddRecentHistoryResultMessage(response) ? response.payload.items : [item];
  }

  async remove(id: string, pageUrl = window.location.href): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createRemoveRecentHistoryMessage(pageUrl, id));
    return isRemoveRecentHistoryResultMessage(response) ? response.payload.items : [];
  }
}
