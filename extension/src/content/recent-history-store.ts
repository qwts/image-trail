import {
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createRemoveRecentHistoryMessage,
  isAddRecentHistoryResultMessage,
  isLoadRecentHistoryResultMessage,
  isRemoveRecentHistoryResultMessage,
} from '../background/messages.js';
import type { ImageDisplayRecord } from '../core/display-records.js';

export class RecentHistoryStore {
  async load(pageUrl = window.location.href): Promise<readonly ImageDisplayRecord[]> {
    const response = await chrome.runtime.sendMessage(createLoadRecentHistoryMessage(pageUrl));
    return isLoadRecentHistoryResultMessage(response) ? response.payload.items : [];
  }

  async add(item: ImageDisplayRecord, pageUrl = window.location.href): Promise<readonly ImageDisplayRecord[]> {
    const response = await chrome.runtime.sendMessage(createAddRecentHistoryMessage(pageUrl, item));
    return isAddRecentHistoryResultMessage(response) ? response.payload.items : [item];
  }

  async remove(id: string, pageUrl = window.location.href): Promise<readonly ImageDisplayRecord[]> {
    const response = await chrome.runtime.sendMessage(createRemoveRecentHistoryMessage(pageUrl, id));
    return isRemoveRecentHistoryResultMessage(response) ? response.payload.items : [];
  }
}
