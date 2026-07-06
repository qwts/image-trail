import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IndexedDbAlbumStore } from '../extension/src/data/albums-controller.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

test('IndexedDbAlbumStore creates, renames, and deletes ordered albums', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbAlbumStore();
  try {
    const album = await store.createAlbum('  Trip   photos  ');
    assert.ok(album);
    assert.equal(album.name, 'Trip photos');

    const renamed = await store.renameAlbum(album.id, 'Archive');
    assert.equal(renamed?.name, 'Archive');

    const deleted = await store.deleteAlbum(album.id);
    assert.equal(deleted, true);
    assert.equal((await store.listSnapshot()).albums.length, 0);
  } finally {
    await store.close();
  }
});

test('IndexedDbAlbumStore keeps membership ordered and idempotent without moving queue records', async () => {
  await deleteImageTrailDb();
  const albums = new IndexedDbAlbumStore();
  const bookmarks = new IndexedDbBookmarkStore();
  try {
    await bookmarks.save(record('https://example.test/older.jpg', '2026-07-01T00:00:00.000Z'));
    await bookmarks.save(record('https://example.test/newer.jpg', '2026-07-01T00:00:01.000Z'));
    const before = await bookmarks.loadPage({ offset: 0, limit: 10 });
    const album = await albums.createAlbum('Favorites');
    assert.ok(album);

    const added = await albums.addRecords(album.id, [before.items[1]!.id, before.items[0]!.id, before.items[0]!.id]);
    assert.equal(added.length, 2);

    const snapshot = await albums.listSnapshot();
    assert.deepEqual(
      snapshot.memberships.map((membership) => membership.recordId),
      [before.items[1]!.id, before.items[0]!.id],
    );
    assert.deepEqual(
      snapshot.memberships.map((membership) => membership.position),
      [0, 1],
    );

    const after = await bookmarks.loadPage({ offset: 0, limit: 10 });
    assert.deepEqual(
      after.items.map((item) => item.id),
      before.items.map((item) => item.id),
    );
    assert.deepEqual(
      after.items.map((item) => item.queueUpdatedAt),
      before.items.map((item) => item.queueUpdatedAt),
    );
  } finally {
    await albums.close();
    await bookmarks.close();
  }
});

test('IndexedDbAlbumStore imports backup memberships through durable id remaps', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbAlbumStore();
  try {
    const result = await store.importBackupEntries(
      [
        {
          id: 'backup-album',
          name: 'Restored',
          createdAt: '2026-07-01T00:00:00.000Z',
          updatedAt: '2026-07-01T00:00:01.000Z',
          recordIds: ['old-a', 'missing', 'old-b'],
        },
      ],
      new Map([
        ['old-a', 'local-a'],
        ['old-b', 'local-b'],
      ]),
    );

    assert.deepEqual(result, { importedAlbumCount: 1, importedMembershipCount: 2, skippedMembershipCount: 1 });
    const snapshot = await store.listSnapshot();
    assert.equal(snapshot.albums[0]?.name, 'Restored');
    assert.deepEqual(
      snapshot.memberships.map((membership) => membership.recordId),
      ['local-a', 'local-b'],
    );
  } finally {
    await store.close();
  }
});

function record(url: string, timestamp: string) {
  return createDisplayRecord({ id: url, url, timestamp, source: 'bookmark' });
}
