import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createAndActivateWrappedBlobKey, lockBlobKey } from '../extension/src/data/crypto/blob-keyring.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { EncryptedPinsRepository } from '../extension/src/data/repositories/encrypted-pins-repository.js';
import { EncryptedPinThumbnailsRepository } from '../extension/src/data/repositories/encrypted-pin-thumbnails-repository.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

test('IndexedDbBookmarkStore caches merged protected metadata and hydrates only visible thumbnails', async () => {
  await deleteImageTrailDb();
  const active = (
    await createAndActivateWrappedBlobKey({
      password: 'pin-merge-cache-password',
      uuid: 'pin-merge-cache-key',
      now: '2026-06-21T00:00:00.000Z',
    })
  ).active;
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => active });
  try {
    for (let index = 0; index < 3; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://secret.example.test/cache-${index}.jpg`,
          url: `https://secret.example.test/cache-${index}.jpg`,
          label: `cache-${index}.jpg`,
          thumbnail: `data:image/png;base64,${btoa(`thumb-${index}`)}`,
          timestamp: `2026-06-21T00:00:0${index + 1}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const originalOpenBookmark = BookmarksRepository.prototype.openRecord;
    const originalOpenPin = EncryptedPinsRepository.prototype.openRecord;
    const originalOpenThumbnail = EncryptedPinThumbnailsRepository.prototype.openRecord;
    let openedBookmarkMetadata = 0;
    let openedPinMetadata = 0;
    let openedThumbnails = 0;
    BookmarksRepository.prototype.openRecord = function countedOpenBookmarkRecord(
      record,
      key,
    ): ReturnType<BookmarksRepository['openRecord']> {
      openedBookmarkMetadata += 1;
      return originalOpenBookmark.call(this, record, key);
    };
    EncryptedPinsRepository.prototype.openRecord = function countedOpenPinRecord(
      record,
      key,
    ): ReturnType<EncryptedPinsRepository['openRecord']> {
      openedPinMetadata += 1;
      return originalOpenPin.call(this, record, key);
    };
    EncryptedPinThumbnailsRepository.prototype.openRecord = function countedOpenThumbnailRecord(
      record,
      key,
    ): ReturnType<EncryptedPinThumbnailsRepository['openRecord']> {
      openedThumbnails += 1;
      return originalOpenThumbnail.call(this, record, key);
    };
    try {
      const firstPage = await store.loadPage({ offset: 0, limit: 1 });
      const secondPage = await store.loadPage({ offset: 1, limit: 1 });

      assert.equal(firstPage.items.length, 1);
      assert.equal(secondPage.items.length, 1);
      assert.ok(firstPage.items[0]?.thumbnail);
      assert.ok(secondPage.items[0]?.thumbnail);
      assert.equal(openedBookmarkMetadata, 3);
      assert.equal(openedPinMetadata, 3);
      assert.equal(openedThumbnails, 2);
    } finally {
      BookmarksRepository.prototype.openRecord = originalOpenBookmark;
      EncryptedPinsRepository.prototype.openRecord = originalOpenPin;
      EncryptedPinThumbnailsRepository.prototype.openRecord = originalOpenThumbnail;
    }
  } finally {
    await store.close();
    lockBlobKey();
  }
});

test('IndexedDbBookmarkStore caches the locked plain snapshot between Queue pages', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore({ getActiveBlobKey: () => null });
  const originalOpenBookmark = BookmarksRepository.prototype.openRecord;
  try {
    for (let index = 0; index < 3; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/locked-cache-${index}.jpg`,
          url: `https://example.test/locked-cache-${index}.jpg`,
          timestamp: `2026-06-21T00:00:0${index + 1}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    let openedBookmarkMetadata = 0;
    BookmarksRepository.prototype.openRecord = function countedOpenBookmarkRecord(
      record,
      key,
    ): ReturnType<BookmarksRepository['openRecord']> {
      openedBookmarkMetadata += 1;
      return originalOpenBookmark.call(this, record, key);
    };

    const firstPage = await store.loadPage({ offset: 0, limit: 1 });
    const secondPage = await store.loadPage({ offset: 1, limit: 1 });

    assert.equal(firstPage.items.length, 1);
    assert.equal(secondPage.items.length, 1);
    assert.equal(openedBookmarkMetadata, 3);
  } finally {
    BookmarksRepository.prototype.openRecord = originalOpenBookmark;
    await store.close();
  }
});
