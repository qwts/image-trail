import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createSessionKey } from '../extension/src/data/crypto/keyring.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { openFreshImageTrailDb } from './indexeddb-test-helpers.js';

test('BookmarksRepository reads sealed storage metrics without opening bookmark envelopes', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const session = await createSessionKey('bookmark', 'bookmark-usage-key', '2026-06-20T00:00:00.000Z');
  const thumbnail = 'data:image/png;base64,dGh1bWJuYWls';

  const encrypted = await repository.sealAndPut(
    'bookmark-usage',
    {
      url: 'https://example.test/usage.jpg',
      thumbnail,
      bookmarkedAt: '2026-06-20T00:00:00.000Z',
      sourceCompatibility: 'favorites',
    },
    session.key,
    session.reference,
  );

  const originalOpenRecord = BookmarksRepository.prototype.openRecord;
  let openedRecords = 0;
  BookmarksRepository.prototype.openRecord = function countedOpenRecord(record, key): ReturnType<BookmarksRepository['openRecord']> {
    openedRecords += 1;
    return originalOpenRecord.call(this, record, key);
  };
  try {
    const usage = await repository.getStorageUsage(session.key);
    assert.equal(usage.blobCount, 1);
    assert.ok(usage.totalBytes > 0);
    assert.deepEqual(usage.thumbnails, { count: 1, totalBytes: new TextEncoder().encode(thumbnail).byteLength });
    assert.equal(encrypted.encryptedByteLength, usage.totalBytes);
    assert.equal(encrypted.inlineThumbnailByteLength, usage.thumbnails?.totalBytes);
    assert.equal(openedRecords, 0);
  } finally {
    BookmarksRepository.prototype.openRecord = originalOpenRecord;
  }
});

test('BookmarksRepository backfills legacy storage metrics once without resealing or reordering', async (t) => {
  const db = await openFreshImageTrailDb();
  t.after(() => db.close());
  const repository = new BookmarksRepository(db);
  const session = await createSessionKey('bookmark', 'bookmark-legacy-usage-key', '2026-06-20T00:00:00.000Z');
  const thumbnail = 'data:image/png;base64,bGVnYWN5LXRodW1ibmFpbA==';
  const sealed = await repository.sealAndPut(
    'bookmark-legacy-usage',
    {
      url: 'https://example.test/legacy-usage.jpg',
      thumbnail,
      bookmarkedAt: '2026-06-20T00:00:00.000Z',
      sourceCompatibility: 'favorites',
    },
    session.key,
    session.reference,
    '2026-06-20T00:00:00.000Z',
    undefined,
    '2026-06-20T00:00:01.000Z',
  );
  await repository.putEncrypted({
    uuid: sealed.uuid,
    url: sealed.url,
    queueUpdatedAt: sealed.queueUpdatedAt,
    envelope: sealed.envelope,
  });

  const originalOpenRecord = BookmarksRepository.prototype.openRecord;
  let openedRecords = 0;
  BookmarksRepository.prototype.openRecord = function countedOpenRecord(record, key): ReturnType<BookmarksRepository['openRecord']> {
    openedRecords += 1;
    return originalOpenRecord.call(this, record, key);
  };
  try {
    const first = await repository.getStorageUsage(session.key);
    const second = await repository.getStorageUsage(session.key);
    const backfilled = await repository.getEncrypted(sealed.uuid);

    assert.deepEqual(second, first);
    assert.equal(openedRecords, 1);
    assert.equal(backfilled?.queueUpdatedAt, sealed.queueUpdatedAt);
    assert.deepEqual(backfilled?.envelope, sealed.envelope);
    assert.equal(backfilled?.encryptedByteLength, first.totalBytes);
    assert.equal(backfilled?.inlineThumbnailByteLength, first.thumbnails?.totalBytes);
  } finally {
    BookmarksRepository.prototype.openRecord = originalOpenRecord;
  }
});
