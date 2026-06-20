import {
  createLoadBookmarksMessage,
  createRemoveBookmarkMessage,
  createSaveBookmarkMessage,
  isLoadBookmarksResultMessage,
  isRemoveBookmarkResultMessage,
  isSaveBookmarkResultMessage,
} from '../background/messages.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import type { BookmarkStore } from '../core/types.js';
import { DEFAULT_LOCAL_SETTINGS } from '../data/local-settings.js';

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
    const response = await chrome.runtime.sendMessage(createLoadBookmarksMessage(input));
    if (isLoadBookmarksResultMessage(response)) return response.payload;
    return { items: [], offset: input.offset, limit: input.limit, total: 0, hasOlder: false, hasNewer: false };
  }

  async save(record: ImageDisplayRecord): Promise<ImageDisplayRecord> {
    const response = await chrome.runtime.sendMessage(createSaveBookmarkMessage(record));
    if (isSaveBookmarkResultMessage(response) && response.payload.ok) return response.payload.record;
    return record;
  }

  async remove(record: ImageDisplayRecord): Promise<void> {
    const response = await chrome.runtime.sendMessage(createRemoveBookmarkMessage(record));
    if (!isRemoveBookmarkResultMessage(response)) {
      throw new Error('Invalid bookmark removal response from background.');
    }
  }
}
