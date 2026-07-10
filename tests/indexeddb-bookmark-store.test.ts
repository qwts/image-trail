import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../extension/src/core/display-records.js';
import { DEFAULT_LOCAL_SETTINGS } from '../extension/src/data/local-settings.js';
import { deleteImageTrailDb } from './indexeddb-test-helpers.js';

test('IndexedDbBookmarkStore recalls saved bookmarks after a new store instance opens', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    await firstStore.save(
      createDisplayRecord({
        id: 'https://example.test/recalled.jpg',
        url: 'https://example.test/recalled.jpg',
        label: 'recalled.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
  } finally {
    await firstStore.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const page = await reloadedStore.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.url, 'https://example.test/recalled.jpg');
    assert.equal(page.hasOlder, false);
    assert.equal(page.hasNewer, false);
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore applies back-first display order before Queue pagination without changing Recall order', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const saved: ImageDisplayRecord[] = [];
    for (const [id, timestamp] of [
      ['back', '2026-06-19T00:00:00.000Z'],
      ['middle', '2026-06-19T00:00:01.000Z'],
      ['front', '2026-06-19T00:00:02.000Z'],
    ]) {
      saved.push(
        await store.save(
          createDisplayRecord({
            id: `https://example.test/${id}.jpg`,
            url: `https://example.test/${id}.jpg`,
            timestamp,
            source: 'bookmark',
          }),
        ),
      );
    }

    const backFirst = await store.loadPage({ offset: 0, limit: 2, displayOrder: 'back-first' });
    const backFirstNext = await store.loadPage({ offset: 2, limit: 2, displayOrder: 'back-first' });
    const recall = await store.loadRecallPage({ offset: 0, limit: 3, scope: 'global' });

    assert.deepEqual(
      backFirst.items.map((item) => item.id),
      [saved[0]!.id, saved[1]!.id],
    );
    assert.deepEqual(
      backFirstNext.items.map((item) => item.id),
      [saved[2]!.id],
    );
    assert.deepEqual(
      recall.items.map((item) => item.id),
      [saved[2]!.id, saved[1]!.id, saved[0]!.id],
    );
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore reports original blob ids beyond the visible queue page', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const limit = DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax;
    for (let index = 0; index <= limit; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/offscreen-${index}.jpg`,
          url: `https://example.test/offscreen-${index}.jpg`,
          label: `offscreen-${index}.jpg`,
          timestamp: `2026-06-21T00:00:${String(index).padStart(2, '0')}.000Z`,
          source: 'bookmark',
          storedOriginal:
            index === 0
              ? {
                  blobId: 'blob-offscreen-original',
                  mimeType: 'image/jpeg',
                  byteLength: 4,
                  capturedAt: '2026-06-21T00:00:00.000Z',
                }
              : undefined,
        }),
      );
    }

    const visible = await store.load();
    assert.equal(
      visible.some((record) => record.storedOriginal?.blobId === 'blob-offscreen-original'),
      false,
    );
    assert.equal((await store.loadOriginalBlobIds()).has('blob-offscreen-original'), true);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore recalls encrypted bookmark thumbnails after reload', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    await firstStore.save(
      createDisplayRecord({
        id: 'https://example.test/thumbnailed.jpg',
        url: 'https://example.test/thumbnailed.jpg',
        label: 'thumbnailed.jpg',
        thumbnail: 'data:image/jpeg;base64,thumbnail',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
  } finally {
    await firstStore.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const page = await reloadedStore.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.thumbnail, 'data:image/jpeg;base64,thumbnail');
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore round-trips optional bookmark dimensions', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    await firstStore.save(
      createDisplayRecord({
        id: 'https://example.test/dimensions.jpg',
        url: 'https://example.test/dimensions.jpg',
        label: 'dimensions.jpg',
        width: 1200,
        height: 800,
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
  } finally {
    await firstStore.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const page = await reloadedStore.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.items[0]?.width, 1200);
    assert.equal(page.items[0]?.height, 800);
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore preserves captured originals when pinning a recent record', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const recent = createDisplayRecord({
      id: 'recent-001',
      url: 'https://example.test/captured-recent.jpg',
      label: 'captured-recent.jpg',
      thumbnail: 'data:image/jpeg;base64,thumbnail',
      timestamp: '2026-06-19T00:00:00.000Z',
      source: 'history',
      captureStatus: 'captured',
      blobId: 'blob-captured-recent',
      capturedAt: '2026-06-19T00:00:01.000Z',
      storedOriginal: {
        blobId: 'blob-captured-recent',
        mimeType: 'image/jpeg',
        byteLength: 4096,
        capturedAt: '2026-06-19T00:00:01.000Z',
      },
    });

    await store.save(createDisplayRecord({ ...recent, id: recent.url, timestamp: '2026-06-19T00:00:02.000Z', source: 'bookmark' }));

    const page = await store.loadPage({ offset: 0, limit: 30 });
    const pinned = page.items[0];

    assert.equal(pinned?.source, 'favorites');
    assert.equal(pinned?.url, recent.url);
    assert.equal(pinned?.captureStatus, 'captured');
    assert.equal(pinned?.blobId, 'blob-captured-recent');
    assert.deepEqual(pinned?.storedOriginal, recent.storedOriginal);
    assert.equal(pinned?.thumbnail, recent.thumbnail);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore finds saved rows by URL without moving queue order', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://example.test/older.jpg',
        url: 'https://example.test/older.jpg',
        label: 'older.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    await store.save(
      createDisplayRecord({
        id: 'https://example.test/newer.jpg',
        url: 'https://example.test/newer.jpg',
        label: 'newer.jpg',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
      }),
    );
    const before = await store.loadPage({ offset: 0, limit: 30 });

    const found = await store.findByUrl('https://example.test/older.jpg');
    const after = await store.loadPage({ offset: 0, limit: 30 });

    assert.equal(found?.url, 'https://example.test/older.jpg');
    assert.equal(found?.queueUpdatedAt, before.items[1]?.queueUpdatedAt);
    assert.deepEqual(
      after.items.map((item) => item.id),
      before.items.map((item) => item.id),
    );
    assert.deepEqual(
      after.items.map((item) => item.queueUpdatedAt),
      before.items.map((item) => item.queueUpdatedAt),
    );
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore updates imported image bookmarks without duplicating rows', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const saved = await store.save(
      createDisplayRecord({
        id: '2026-06-20T00:00:00.000Z:imported.png',
        url: 'data:image/png;base64,imported',
        label: 'imported.png',
        thumbnail: 'data:image/png;base64,imported',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    const refreshed = await store.save({ ...saved, thumbnail: 'data:image/png;base64,refreshed' });
    await store.save({
      ...refreshed,
      captureStatus: 'captured',
      blobId: 'blob-001',
      capturedAt: '2026-06-20T00:00:01.000Z',
      storedOriginal: {
        blobId: 'blob-001',
        mimeType: 'image/png',
        byteLength: 8,
        capturedAt: '2026-06-20T00:00:01.000Z',
      },
    });

    const page = await store.loadPage({ offset: 0, limit: 30 });

    assert.equal(page.total, 1);
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0]?.url, 'data:image/png;base64,imported');
    assert.equal(page.items[0]?.captureStatus, 'captured');
    assert.equal(page.items[0]?.blobId, 'blob-001');
  } finally {
    await store.close();
  }
});
