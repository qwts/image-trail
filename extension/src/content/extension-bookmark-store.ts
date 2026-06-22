import {
  createLoadBookmarksMessage,
  createLoadBookmarksByIdsMessage,
  createRemoveBookmarkMessage,
  createRemoveBookmarksMessage,
  createRemoveRecallBookmarksMessage,
  createSaveBookmarkMessage,
  isLoadBookmarksResultMessage,
  isLoadBookmarksByIdsResultMessage,
  isRemoveBookmarkResultMessage,
  isRemoveBookmarksResultMessage,
  isRemoveRecallBookmarksResultMessage,
  isSaveBookmarkResultMessage,
} from '../background/messages.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import type { BookmarkStore } from '../core/types.js';
import { DEFAULT_LOCAL_SETTINGS } from '../data/local-settings.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionBookmarkStore implements BookmarkStore {
  async load(): Promise<readonly ImageDisplayRecord[]> {
    return (await this.loadPage({ offset: 0, limit: DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax })).items;
  }

  async loadPage(input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }): Promise<{
    readonly items: readonly ImageDisplayRecord[];
    readonly offset: number;
    readonly limit: number;
    readonly total: number;
    readonly hasOlder: boolean;
    readonly hasNewer: boolean;
  }> {
    const response = await sendRuntimeMessage(createLoadBookmarksMessage(input));
    if (isLoadBookmarksResultMessage(response)) return response.payload;
    return { items: [], offset: input.offset, limit: input.limit, total: 0, hasOlder: false, hasNewer: false };
  }

  async save(record: ImageDisplayRecord): Promise<ImageDisplayRecord> {
    const result = await this.saveResult(record);
    return result.ok ? result.record : record;
  }

  async saveResult(
    record: ImageDisplayRecord,
  ): Promise<{ readonly ok: true; readonly record: ImageDisplayRecord } | { readonly ok: false; readonly message: string }> {
    const response = await sendRuntimeMessage(createSaveBookmarkMessage(record));
    if (isSaveBookmarkResultMessage(response)) return response.payload;
    return { ok: false, message: 'Bookmark save failed.' };
  }

  async loadByIds(ids: readonly string[]): Promise<readonly ImageDisplayRecord[]> {
    if (ids.length === 0) return [];
    const response = await sendRuntimeMessage(createLoadBookmarksByIdsMessage(ids));
    if (isLoadBookmarksByIdsResultMessage(response)) return response.payload.items;
    return [];
  }

  async remove(record: ImageDisplayRecord): Promise<void> {
    const response = await sendRuntimeMessage(createRemoveBookmarkMessage(record));
    if (response === null) return;
    if (!isRemoveBookmarkResultMessage(response)) {
      throw new Error('Invalid bookmark removal response from background.');
    }
  }

  async removeMany(ids: readonly string[]): Promise<{ readonly removedCount: number }> {
    const response = await sendRuntimeMessage(createRemoveBookmarksMessage(ids));
    if (isRemoveBookmarksResultMessage(response) && response.payload.ok) return { removedCount: response.payload.removedCount };
    return { removedCount: 0 };
  }

  async removeRecallPage(input: {
    readonly offset: number;
    readonly scope?: 'global' | 'site';
    readonly currentPageUrl?: string;
  }): Promise<{ readonly removedCount: number }> {
    const response = await sendRuntimeMessage(createRemoveRecallBookmarksMessage(input));
    if (isRemoveRecallBookmarksResultMessage(response) && response.payload.ok) return { removedCount: response.payload.removedCount };
    return { removedCount: 0 };
  }
}
