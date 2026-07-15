import {
  createAddRecentHistoryMessage,
  createLoadRecentHistoryMessage,
  createRemoveRecentHistoryMessage,
  createUpdateRecentHistoryMessage,
  isAddRecentHistoryResultMessage,
  isLoadRecentHistoryResultMessage,
  isRemoveRecentHistoryResultMessage,
  isUpdateRecentHistoryResultMessage,
} from '../background/messages.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import type { RecentHistoryScope } from '../core/recent-history-scope.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class RecentHistoryStore {
  async load(
    pageUrl = window.location.href,
    options: { readonly includeRetained?: boolean; readonly scope?: RecentHistoryScope } = {},
  ): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createLoadRecentHistoryMessage(pageUrl, options));
    return isLoadRecentHistoryResultMessage(response) ? response.payload.items : [];
  }

  async add(
    item: ImageDisplayRecord,
    pageUrl = window.location.href,
    options: { readonly scope?: RecentHistoryScope } = {},
  ): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createAddRecentHistoryMessage(pageUrl, item, options));
    return isAddRecentHistoryResultMessage(response) ? response.payload.items : [item];
  }

  async update(
    item: ImageDisplayRecord,
    pageUrl = window.location.href,
    options: { readonly scope?: RecentHistoryScope } = {},
  ): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createUpdateRecentHistoryMessage(pageUrl, item, options));
    return isUpdateRecentHistoryResultMessage(response) ? response.payload.items : [];
  }

  async remove(
    id: string,
    pageUrl = window.location.href,
    options: { readonly scope?: RecentHistoryScope } = {},
  ): Promise<readonly ImageDisplayRecord[]> {
    const response = await sendRuntimeMessage(createRemoveRecentHistoryMessage(pageUrl, id, options));
    return isRemoveRecentHistoryResultMessage(response) ? response.payload.items : [];
  }
}
