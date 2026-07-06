import test from 'node:test';
import assert from 'node:assert/strict';

import { createAlbumMessageRegistry } from '../extension/src/background/handlers/album-handlers.js';
import { createBookmarkMessageRegistry } from '../extension/src/background/handlers/bookmark-message-handlers.js';
import {
  MessageType,
  createAddAlbumRecordsMessage,
  createCreateAlbumMessage,
  createDeleteAlbumMessage,
  createImportAlbumBackupMessage,
  createLoadAlbumsMessage,
  createLoadBookmarksMessage,
  createRemoveAlbumRecordMessage,
  createRemoveBookmarkMessage,
  createRemoveBookmarksMessage,
  createRemoveRecallBookmarksMessage,
  createRenameAlbumMessage,
  createSaveBookmarkMessage,
} from '../extension/src/background/messages.js';
import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';

const record: ImageDisplayRecord = {
  id: 'pin-1',
  url: 'https://images.example.test/pin-1.jpg',
  timestamp: '2026-07-01T00:00:00.000Z',
};

test('bookmark mutations publish library changes after successful writes', async () => {
  const notifications: unknown[] = [];
  const registry = createBookmarkMessageRegistry({
    bookmarkStore: {
      loadPage: async (input) => ({ items: [], offset: input.offset, limit: input.limit, total: 0, hasOlder: false, hasNewer: false }),
      loadByIds: async () => [],
      findByUrl: async () => null,
      save: async (saved) => saved,
      remove: async () => undefined,
      removeMany: async (ids) => ({ removedCount: ids.length }),
      removeRecallPage: async () => ({ removedCount: 1 }),
    },
    notifyLibraryChange: (change) => notifications.push(change),
  });

  await registry[MessageType.LoadBookmarks].handle(createLoadBookmarksMessage({ offset: 0, limit: 10 }));
  assert.deepEqual(notifications, []);
  await registry[MessageType.SaveBookmark].handle(createSaveBookmarkMessage(record));
  await registry[MessageType.RemoveBookmark].handle(createRemoveBookmarkMessage(record));
  await registry[MessageType.RemoveBookmarks].handle(createRemoveBookmarksMessage(['pin-1', 'pin-2']));
  await registry[MessageType.RemoveRecallBookmarks].handle(createRemoveRecallBookmarksMessage({ offset: 0, scope: 'global' }));

  assert.deepEqual(notifications, [
    { topic: 'bookmarks', reason: 'bookmark-saved', recordIds: ['pin-1'] },
    { topic: 'bookmarks', reason: 'bookmark-removed', recordIds: ['pin-1'] },
    { topic: 'bookmarks', reason: 'bookmarks-removed', recordIds: ['pin-1', 'pin-2'] },
    { topic: 'bookmarks', reason: 'recall-bookmarks-removed' },
  ]);
});

test('album mutations publish library changes after successful writes', async () => {
  const notifications: unknown[] = [];
  const album = {
    id: 'album-1',
    schemaVersion: 1 as const,
    name: 'Reference',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  };
  const membership = {
    id: 'album-1:pin-1',
    schemaVersion: 1 as const,
    albumId: 'album-1',
    recordId: 'pin-1',
    position: 0,
    addedAt: '2026-07-01T00:00:01.000Z',
  };
  const registry = createAlbumMessageRegistry({
    albumStore: {
      listSnapshot: async () => ({ albums: [album], memberships: [] }),
      createAlbum: async () => album,
      renameAlbum: async () => album,
      deleteAlbum: async () => true,
      addRecords: async () => [membership],
      removeRecord: async () => true,
      importBackupEntries: async () => ({ importedAlbumCount: 1, importedMembershipCount: 1, skippedMembershipCount: 0 }),
    },
    notifyLibraryChange: (change) => notifications.push(change),
  });

  await registry[MessageType.LoadAlbums].handle(createLoadAlbumsMessage());
  assert.deepEqual(notifications, []);
  await registry[MessageType.CreateAlbum].handle(createCreateAlbumMessage('Reference'));
  await registry[MessageType.RenameAlbum].handle(createRenameAlbumMessage('album-1', 'Renamed'));
  await registry[MessageType.AddAlbumRecords].handle(createAddAlbumRecordsMessage('album-1', ['pin-1']));
  await registry[MessageType.RemoveAlbumRecord].handle(createRemoveAlbumRecordMessage('album-1', 'pin-1'));
  await registry[MessageType.DeleteAlbum].handle(createDeleteAlbumMessage('album-1'));
  await registry[MessageType.ImportAlbumBackup].handle(
    createImportAlbumBackupMessage({ albums: [], recordIdMap: [{ sourceId: 'pin-1', targetId: 'pin-1' }] }),
  );

  assert.deepEqual(notifications, [
    { topic: 'albums', reason: 'album-created', albumIds: ['album-1'] },
    { topic: 'albums', reason: 'album-renamed', albumIds: ['album-1'] },
    { topic: 'albums', reason: 'album-records-added', albumIds: ['album-1'], recordIds: ['pin-1'] },
    { topic: 'albums', reason: 'album-record-removed', albumIds: ['album-1'], recordIds: ['pin-1'] },
    { topic: 'albums', reason: 'album-deleted', albumIds: ['album-1'] },
    { topic: 'albums', reason: 'album-backup-imported' },
  ]);
});
