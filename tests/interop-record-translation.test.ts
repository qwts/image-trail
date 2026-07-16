import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import type { InteropReviewCategory } from '../extension/src/core/interop/contract.js';
import { parseInteropEnvelope } from '../extension/src/core/interop/messages.js';
import type { InteropAlbum, InteropRecord } from '../extension/src/core/interop/records.js';
import { IndexedDbAlbumStore } from '../extension/src/data/albums-controller.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { InteropRecordTranslationStore } from '../extension/src/data/interop/record-translation.js';
import { DataStore } from '../extension/src/data/schema.js';
import { deleteImageTrailDb, requestToPromise, transactionDone } from './indexeddb-test-helpers.js';

interface CanonicalRecordFixture {
  readonly record: InteropRecord;
  readonly albums: readonly InteropAlbum[];
  readonly reviewCategory: InteropReviewCategory;
}

function recordFixture(name: 'valid-record-message.json' | 'round-trip-record-message.json'): CanonicalRecordFixture {
  const parsed = parseInteropEnvelope(JSON.parse(readFileSync(`contracts/interop/v1/fixtures/${name}`, 'utf8')) as unknown);
  assert.equal(parsed.payload.kind, 'record');
  if (parsed.payload.kind !== 'record') throw new Error('Expected record fixture.');
  assert.ok(parsed.payload.reviewCategory === 'eligible' || parsed.payload.reviewCategory === 'metadata-only');
  return {
    record: parsed.payload.record,
    albums: parsed.payload.albums,
    reviewCategory: parsed.payload.reviewCategory,
  };
}

test('canonical Overlook records persist as encrypted durable pins and export exactly', async () => {
  await deleteImageTrailDb();
  const fixture = recordFixture('valid-record-message.json');
  const translator = new InteropRecordTranslationStore();
  const bookmarks = new IndexedDbBookmarkStore();
  const albums = new IndexedDbAlbumStore();
  try {
    const preview = await translator.preview(fixture);
    assert.deepEqual(
      {
        category: preview.category,
        existingPinId: preview.existingPinId,
        sourceUrlAvailable: preview.sourceUrlAvailable,
        originalBytesAvailable: preview.originalBytesAvailable,
        thumbnailBytesAvailable: preview.thumbnailBytesAvailable,
      },
      {
        category: 'metadata-only',
        existingPinId: null,
        sourceUrlAvailable: true,
        originalBytesAvailable: false,
        thumbnailBytesAvailable: false,
      },
    );

    const imported = await translator.importRecord(fixture);
    assert.equal(imported.persisted, true);
    assert.ok(imported.pinId);

    const page = await bookmarks.loadPage({ offset: 0, limit: 10 });
    assert.equal(page.total, 1);
    assert.equal(page.items[0]?.id, imported.pinId);
    assert.equal(page.items[0]?.url, fixture.record.sourceUrl);
    assert.equal(page.items[0]?.thumbnail, undefined);
    assert.equal(page.items[0]?.storedOriginal, undefined);
    assert.equal(page.items[0]?.source, 'favorites');

    const albumSnapshot = await albums.listSnapshot();
    assert.equal(albumSnapshot.albums[0]?.name, fixture.albums[0]?.name);
    assert.deepEqual(
      albumSnapshot.memberships.map((membership) => membership.recordId),
      [imported.pinId],
    );

    assert.deepEqual(await translator.exportRecord(fixture.record.identity.interopId), fixture);
    await bookmarks.save(page.items[0]!);
    assert.deepEqual(await translator.exportRecord(fixture.record.identity.interopId), fixture);

    const db = await openImageTrailDb();
    assert.ok(db.db);
    const transaction = db.db.transaction([DataStore.Bookmarks, DataStore.History], 'readonly');
    const rawBookmarks = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.Bookmarks).getAll());
    const historyCount = await requestToPromise(transaction.objectStore(DataStore.History).count());
    await transactionDone(transaction);
    db.db.close();
    const raw = JSON.stringify(rawBookmarks);
    assert.equal(raw.includes('Example image'), false);
    assert.equal(raw.includes('https://example.test/photo.jpg'), false);
    assert.equal(raw.includes('thumbnail-123'), false);
    assert.equal(historyCount, 0, 'interop translation must not persist Recents/history rows');
  } finally {
    await translator.close();
    await bookmarks.close();
    await albums.close();
  }
});

test('a duplicate canonical record can attach later verified bytes without moving its queue position', async () => {
  await deleteImageTrailDb();
  const fixture = recordFixture('valid-record-message.json');
  const translator = new InteropRecordTranslationStore();
  const bookmarks = new IndexedDbBookmarkStore();
  try {
    const imported = await translator.importRecord(fixture);
    const before = await bookmarks.loadPage({ offset: 0, limit: 10 });
    const verifiedThumbnailDataUrl = 'data:image/jpeg;base64,bGF0ZXItY3VzdG9keQ==';
    const enriched = await translator.importRecord({ ...fixture, verifiedThumbnailDataUrl });
    const after = await bookmarks.loadPage({ offset: 0, limit: 10 });

    assert.equal(enriched.category, 'duplicate');
    assert.equal(enriched.persisted, true);
    assert.equal(enriched.pinId, imported.pinId);
    assert.equal(after.items[0]?.thumbnail, verifiedThumbnailDataUrl);
    assert.equal(after.items[0]?.queueUpdatedAt, before.items[0]?.queueUpdatedAt);
  } finally {
    await translator.close();
    await bookmarks.close();
  }
});

test('photos without semantic web URLs use an explicit internal identity and never fabricate favorites provenance', async () => {
  await deleteImageTrailDb();
  const fixture = recordFixture('round-trip-record-message.json');
  const record: InteropRecord = {
    ...fixture.record,
    identity: {
      ...fixture.record.identity,
      interopId: 'd4afe837-aa95-4d84-932c-035f7f8c9815',
      origin: { product: 'overlook', localId: 'photo-without-url' },
    },
    sourceUrl: null,
    sourceCompatibility: null,
    albumIds: [],
  };
  const verifiedThumbnailDataUrl = 'data:image/jpeg;base64,c2VjcmV0LXRodW1ibmFpbA==';
  const input = { record, albums: [], reviewCategory: 'metadata-only' as const, verifiedThumbnailDataUrl };
  const translator = new InteropRecordTranslationStore();
  const bookmarks = new IndexedDbBookmarkStore();
  try {
    const imported = await translator.importRecord(input);
    assert.equal(imported.persisted, true);
    assert.equal(imported.displayUrl, `image-trail-interop:${record.identity.interopId}`);

    const global = await bookmarks.loadPage({ offset: 0, limit: 10, scope: 'global' });
    assert.equal(global.items[0]?.url, imported.displayUrl);
    assert.equal(global.items[0]?.source, 'bookmark');
    assert.equal(global.items[0]?.thumbnail, verifiedThumbnailDataUrl);
    const site = await bookmarks.loadPage({
      offset: 0,
      limit: 10,
      scope: 'site',
      currentPageUrl: 'https://example.test/page',
    });
    assert.equal(site.total, 0);

    const exported = await translator.exportRecord(record.identity.interopId);
    assert.equal(exported?.record.sourceUrl, null);
    assert.equal(exported?.record.sourceCompatibility, null);

    const db = await openImageTrailDb();
    assert.ok(db.db);
    const transaction = db.db.transaction(DataStore.Bookmarks, 'readonly');
    const rawBookmarks = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.Bookmarks).getAll());
    await transactionDone(transaction);
    db.db.close();
    assert.equal(JSON.stringify(rawBookmarks).includes('c2VjcmV0LXRodW1ibmFpbA=='), false);
  } finally {
    await translator.close();
    await bookmarks.close();
  }
});

test('interop previews deterministically distinguish duplicate, conflict, unsupported, and skipped records', async () => {
  await deleteImageTrailDb();
  const fixture = recordFixture('round-trip-record-message.json');
  const translator = new InteropRecordTranslationStore();
  try {
    const imported = await translator.importRecord(fixture);
    assert.equal(imported.persisted, true);

    const duplicate = await translator.preview(fixture);
    assert.equal(duplicate.category, 'duplicate');
    assert.equal(duplicate.existingPinId, imported.pinId);

    const conflict = await translator.preview({
      ...fixture,
      record: { ...fixture.record, title: 'Divergent title' },
    });
    assert.equal(conflict.category, 'conflict');
    assert.equal(conflict.existingPinId, imported.pinId);

    const secondIdentity: InteropRecord = {
      ...fixture.record,
      identity: {
        ...fixture.record.identity,
        interopId: 'cfbd5f0d-9c39-49bd-8f2a-9c34606788ca',
        origin: { product: 'overlook', localId: 'content-duplicate' },
      },
      albumIds: [],
    };
    assert.equal((await translator.preview({ record: secondIdentity, albums: [], reviewCategory: 'eligible' })).category, 'duplicate');

    const unsupported: InteropRecord = {
      ...secondIdentity,
      identity: {
        ...secondIdentity.identity,
        interopId: 'a6837cd7-a5b2-4527-95cb-c350c9fd5509',
        origin: { product: 'overlook', localId: 'unsupported' },
        contentHash: null,
      },
    };
    const unsupportedResult = await translator.importRecord({ record: unsupported, albums: [], reviewCategory: 'unsupported' });
    assert.equal(unsupportedResult.category, 'unsupported');
    assert.equal(unsupportedResult.persisted, false);

    const skipped = await translator.importRecord({
      record: {
        ...unsupported,
        identity: { ...unsupported.identity, interopId: '4205f18e-6425-4cb5-a9d4-5cb76df41904' },
        deletedAt: '2026-07-16T12:00:00Z',
      },
      albums: [],
      reviewCategory: 'eligible',
    });
    assert.equal(skipped.category, 'skipped');
    assert.equal(skipped.persisted, false);
  } finally {
    await translator.close();
  }
});

test('canonical queue timestamps remain ordered and native album membership follows canonical positions', async () => {
  await deleteImageTrailDb();
  const fixture = recordFixture('valid-record-message.json');
  const secondId = 'b38e3e15-b80c-4207-b37d-d2b65a811eea';
  const album = fixture.albums[0]!;
  const secondRecord: InteropRecord = {
    ...fixture.record,
    identity: { ...fixture.record.identity, interopId: secondId, origin: { product: 'overlook', localId: 'second' } },
    timestamps: { ...fixture.record.timestamps, bookmarkedAt: '2026-07-16T09:01:00.000Z' },
  };
  const orderedAlbum: InteropAlbum = {
    ...album,
    members: [
      { ...album.members[0]!, recordInteropId: secondId, position: 0 },
      { ...album.members[0]!, recordInteropId: fixture.record.identity.interopId, position: 1 },
    ],
  };
  const translator = new InteropRecordTranslationStore();
  const bookmarks = new IndexedDbBookmarkStore();
  const albums = new IndexedDbAlbumStore();
  try {
    const first = await translator.importRecord({ ...fixture, albums: [orderedAlbum] });
    const second = await translator.importRecord({ ...fixture, record: secondRecord, albums: [orderedAlbum] });
    const queue = await bookmarks.loadPage({ offset: 0, limit: 10 });
    assert.deepEqual(
      queue.items.map((item) => item.id),
      [second.pinId, first.pinId],
    );

    const snapshot = await albums.listSnapshot();
    assert.deepEqual(
      snapshot.memberships.map((membership) => membership.recordId),
      [second.pinId, first.pinId],
    );
  } finally {
    await translator.close();
    await bookmarks.close();
    await albums.close();
  }
});

test('translation rejects malformed records and mismatched byte custody claims before writing', async () => {
  await deleteImageTrailDb();
  const fixture = recordFixture('valid-record-message.json');
  const translator = new InteropRecordTranslationStore();
  try {
    await assert.rejects(
      translator.importRecord({ ...fixture, record: { ...fixture.record, sourceUrl: 'not-a-url' } as InteropRecord }),
      /url/u,
    );
    await assert.rejects(
      translator.importRecord({ ...fixture, verifiedThumbnailDataUrl: 'https://example.test/thumb.jpg' }),
      /thumbnail bytes/u,
    );
    await assert.rejects(
      translator.importRecord({
        ...fixture,
        verifiedOriginal: {
          blobId: 'local-original',
          mimeType: 'image/png',
          byteLength: 99,
          capturedAt: '2026-07-16T09:00:00.000Z',
        },
      }),
      /original custody/u,
    );

    const bookmarks = new IndexedDbBookmarkStore();
    try {
      await bookmarks.save(
        createDisplayRecord({
          id: 'https://example.test/native.jpg',
          url: 'https://example.test/native.jpg',
          timestamp: '2026-07-16T08:00:00.000Z',
          source: 'bookmark',
        }),
      );
      assert.equal((await bookmarks.loadPage({ offset: 0, limit: 10 })).total, 1);
    } finally {
      await bookmarks.close();
    }
  } finally {
    await translator.close();
  }
});
