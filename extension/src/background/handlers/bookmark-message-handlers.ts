import type { BookmarkStore } from '../../core/types.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createFindBookmarkByUrlResultMessage,
  createLoadBookmarksByIdsResultMessage,
  createLoadBookmarksResultMessage,
  createRemoveBookmarkResultMessage,
  createRemoveBookmarksResultMessage,
  createRemoveRecallBookmarksResultMessage,
  createSaveBookmarkResultMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type FindBookmarkByUrlMessage,
  type LoadBookmarksByIdsMessage,
  type LoadBookmarksMessage,
  type RemoveBookmarkMessage,
  type RemoveBookmarksMessage,
  type RemoveRecallBookmarksMessage,
  type SaveBookmarkMessage,
} from '../messages.js';

type BookmarkRequestType =
  | typeof MessageType.LoadBookmarks
  | typeof MessageType.LoadBookmarksByIds
  | typeof MessageType.FindBookmarkByUrl
  | typeof MessageType.SaveBookmark
  | typeof MessageType.RemoveBookmark
  | typeof MessageType.RemoveBookmarks
  | typeof MessageType.RemoveRecallBookmarks;

export interface BookmarkMessageHandlerDeps {
  readonly bookmarkStore: Pick<
    BookmarkStore,
    'loadPage' | 'loadByIds' | 'findByUrl' | 'save' | 'remove' | 'removeMany' | 'removeRecallPage'
  >;
}

export function createBookmarkMessageRegistry({
  bookmarkStore,
}: BookmarkMessageHandlerDeps): Record<BookmarkRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  return {
    [MessageType.LoadBookmarks]: defineMessage({
      requestSchema: requestSchemas.loadBookmarksRequestSchema,
      handle: (message: LoadBookmarksMessage) => bookmarkStore.loadPage(message.payload),
      respond: (result) => createLoadBookmarksResultMessage(result),
      fallback: (message) =>
        createLoadBookmarksResultMessage({
          items: [],
          offset: message.payload.offset,
          limit: message.payload.limit,
          total: 0,
          hasOlder: false,
          hasNewer: false,
        }),
    }),
    [MessageType.LoadBookmarksByIds]: defineMessage({
      requestSchema: requestSchemas.loadBookmarksByIdsRequestSchema,
      handle: async (message: LoadBookmarksByIdsMessage) => ({ items: await bookmarkStore.loadByIds(message.payload.ids) }),
      respond: (result) => createLoadBookmarksByIdsResultMessage(result),
      fallback: () => createLoadBookmarksByIdsResultMessage({ items: [] }),
    }),
    [MessageType.FindBookmarkByUrl]: defineMessage({
      requestSchema: requestSchemas.findBookmarkByUrlRequestSchema,
      handle: async (message: FindBookmarkByUrlMessage) => ({ record: await bookmarkStore.findByUrl(message.payload.url) }),
      respond: (result) => createFindBookmarkByUrlResultMessage(result),
      fallback: () => createFindBookmarkByUrlResultMessage({ record: null }),
    }),
    [MessageType.SaveBookmark]: defineMessage({
      requestSchema: requestSchemas.saveBookmarkRequestSchema,
      handle: async (message: SaveBookmarkMessage) => ({ ok: true as const, record: await bookmarkStore.save(message.payload.record) }),
      respond: (result) => createSaveBookmarkResultMessage(result),
      fallback: () => createSaveBookmarkResultMessage({ ok: false, message: 'Bookmark save failed.' }),
    }),
    [MessageType.RemoveBookmark]: defineMessage({
      requestSchema: requestSchemas.removeBookmarkRequestSchema,
      handle: async (message: RemoveBookmarkMessage) => {
        await bookmarkStore.remove(message.payload.record);
        return { ok: true as const };
      },
      respond: (result) => createRemoveBookmarkResultMessage(result),
      fallback: () => createRemoveBookmarkResultMessage({ ok: false }),
    }),
    [MessageType.RemoveBookmarks]: defineMessage({
      requestSchema: requestSchemas.removeBookmarksRequestSchema,
      handle: async (message: RemoveBookmarksMessage) => ({ ok: true as const, ...(await bookmarkStore.removeMany(message.payload.ids)) }),
      respond: (result) => createRemoveBookmarksResultMessage(result),
      fallback: () => createRemoveBookmarksResultMessage({ ok: false, removedCount: 0 }),
    }),
    [MessageType.RemoveRecallBookmarks]: defineMessage({
      requestSchema: requestSchemas.removeRecallBookmarksRequestSchema,
      handle: async (message: RemoveRecallBookmarksMessage) => ({
        ok: true as const,
        ...(await bookmarkStore.removeRecallPage(message.payload)),
      }),
      respond: (result) => createRemoveRecallBookmarksResultMessage(result),
      fallback: () => createRemoveRecallBookmarksResultMessage({ ok: false, removedCount: 0 }),
    }),
  };
}
