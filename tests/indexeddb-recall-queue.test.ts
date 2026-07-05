import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openImageTrailDb } from '../extension/src/data/db.js';
import { BookmarksRepository } from '../extension/src/data/repositories/bookmarks-repository.js';
import { IndexedDbBookmarkStore } from '../extension/src/data/bookmarks-controller.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import { deleteImageTrailDb, bookmarkRecord } from './indexeddb-test-helpers.js';

test('IndexedDbBookmarkStore keeps bookmark order stable when refreshing an existing thumbnail', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://example.test/first.jpg',
        url: 'https://example.test/first.jpg',
        label: 'first.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    await store.save(
      createDisplayRecord({
        id: 'https://example.test/second.jpg',
        url: 'https://example.test/second.jpg',
        label: 'second.jpg',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    const before = await store.loadPage({ offset: 0, limit: 30 });
    await store.save({ ...before.items[1]!, thumbnail: 'data:image/jpeg;base64,thumbnail' });
    const after = await store.loadPage({ offset: 0, limit: 30 });

    assert.deepEqual(
      after.items.map((item) => item.url),
      before.items.map((item) => item.url),
    );
    assert.equal(after.items[1]?.thumbnail, 'data:image/jpeg;base64,thumbnail');
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore loads recall records after the visible soft max', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 35; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/pin-${index}.jpg`,
          url: `https://example.test/pin-${index}.jpg`,
          label: `pin-${index}.jpg`,
          timestamp: `2026-06-20T00:00:${String(index).padStart(2, '0')}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const visible = await store.loadPage({ offset: 0, limit: 30 });
    const recall = await store.loadRecallPage({ offset: 30, limit: 3, scope: 'global' });

    assert.equal(visible.items.length, 30);
    assert.deepEqual(
      recall.items.map((item) => item.url),
      ['https://example.test/pin-4.jpg', 'https://example.test/pin-3.jpg', 'https://example.test/pin-2.jpg'],
    );
    assert.equal(recall.nextOffset, 33);
    assert.equal(recall.hasMore, true);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore deletes recall records after the visible soft max', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 5; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/delete-recall-${index}.jpg`,
          url: `https://example.test/delete-recall-${index}.jpg`,
          label: `delete-recall-${index}.jpg`,
          timestamp: `2026-06-20T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const result = await store.removeRecallPage({ offset: 2, scope: 'global' });
    const page = await store.loadPage({ offset: 0, limit: 10 });

    assert.equal(result.removedCount, 3);
    assert.deepEqual(
      page.items.map((item) => item.url),
      ['https://example.test/delete-recall-4.jpg', 'https://example.test/delete-recall-3.jpg'],
    );
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore loads site-scoped recall records after the visible site soft max', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 6; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/site-${index}.jpg`,
          url: `https://example.test/site-${index}.jpg`,
          label: `site-${index}.jpg`,
          timestamp: `2026-06-20T00:00:${String(index * 2).padStart(2, '0')}.000Z`,
          source: 'bookmark',
        }),
      );
      await store.save(
        createDisplayRecord({
          id: `https://other.test/offsite-${index}.jpg`,
          url: `https://other.test/offsite-${index}.jpg`,
          label: `offsite-${index}.jpg`,
          timestamp: `2026-06-20T00:00:${String(index * 2 + 1).padStart(2, '0')}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const visible = await store.loadPage({ offset: 0, limit: 3, scope: 'site', currentPageUrl: 'https://example.test/page' });
    const recall = await store.loadRecallPage({ offset: 3, limit: 2, scope: 'site', currentPageUrl: 'https://example.test/page' });

    assert.deepEqual(
      visible.items.map((item) => item.url),
      ['https://example.test/site-5.jpg', 'https://example.test/site-4.jpg', 'https://example.test/site-3.jpg'],
    );
    assert.deepEqual(
      recall.items.map((item) => item.url),
      ['https://example.test/site-2.jpg', 'https://example.test/site-1.jpg'],
    );
    assert.equal(recall.nextOffset, 5);
    assert.equal(recall.hasMore, true);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore moves recalled records to the front without resealing metadata', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    const saved: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const record = await store.save(
        createDisplayRecord({
          id: `https://example.test/move-${index}.jpg`,
          url: `https://example.test/move-${index}.jpg`,
          label: `move-${index}.jpg`,
          timestamp: `2026-06-20T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
      saved.push(record.id);
    }

    const openResult = await openImageTrailDb();
    assert.ok(openResult.db);
    const repository = new BookmarksRepository(openResult.db);
    const before = await repository.getEncrypted(saved[0]!);
    assert.ok(before);
    const recalled = await store.moveToFront([saved[0]!]);
    const after = await repository.getEncrypted(saved[0]!);
    openResult.db.close();

    const page = await store.loadPage({ offset: 0, limit: 3 });
    assert.equal(recalled[0]?.id, saved[0]);
    assert.equal(page.items[0]?.id, saved[0]);
    assert.equal(after?.envelope.updatedAt, before.envelope.updatedAt);
    assert.notEqual(after?.queueUpdatedAt, before.queueUpdatedAt);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore paginates visible bookmarks without counting undecryptable legacy rows', async () => {
  await deleteImageTrailDb();
  const firstStore = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 6; index += 1) {
      await firstStore.save(
        createDisplayRecord({
          id: `https://example.test/visible-${index}.jpg`,
          url: `https://example.test/visible-${index}.jpg`,
          label: `visible-${index}.jpg`,
          timestamp: `2026-06-19T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
    }
  } finally {
    await firstStore.close();
  }

  const openResult = await openImageTrailDb();
  assert.ok(openResult.db);
  try {
    const repository = new BookmarksRepository(openResult.db);
    await repository.putEncrypted({
      ...bookmarkRecord('legacy-hidden-newer'),
      url: 'https://example.test/legacy-hidden-newer.jpg',
      queueUpdatedAt: '2999-01-01T00:00:00.000Z',
      envelope: {
        ...bookmarkRecord('legacy-hidden-newer').envelope,
        updatedAt: '2999-01-01T00:00:00.000Z',
      },
    });
    await repository.putEncrypted({
      ...bookmarkRecord('legacy-hidden-middle'),
      url: 'https://example.test/legacy-hidden-middle.jpg',
      queueUpdatedAt: '2026-06-19T00:00:03.500Z',
      envelope: {
        ...bookmarkRecord('legacy-hidden-middle').envelope,
        updatedAt: '2026-06-19T00:00:03.500Z',
      },
    });
  } finally {
    openResult.db.close();
  }

  const reloadedStore = new IndexedDbBookmarkStore();
  try {
    const firstPage = await reloadedStore.loadPage({ offset: 0, limit: 3 });
    const secondPage = await reloadedStore.loadPage({ offset: 3, limit: 3 });

    assert.equal(firstPage.total, 6);
    assert.equal(firstPage.items.length, 3);
    assert.equal(firstPage.hasOlder, true);
    assert.equal(firstPage.hasNewer, false);
    assert.equal(secondPage.total, 6);
    assert.equal(secondPage.items.length, 3);
    assert.equal(secondPage.hasOlder, false);
    assert.equal(secondPage.hasNewer, true);
    assert.deepEqual(
      [...firstPage.items, ...secondPage.items].map((item) => item.url).sort(),
      Array.from({ length: 6 }, (_, index) => `https://example.test/visible-${index}.jpg`).sort(),
    );
  } finally {
    await reloadedStore.close();
  }
});

test('IndexedDbBookmarkStore clamps offsets after visible bookmark totals shrink', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    for (let index = 0; index < 4; index += 1) {
      await store.save(
        createDisplayRecord({
          id: `https://example.test/clamp-${index}.jpg`,
          url: `https://example.test/clamp-${index}.jpg`,
          label: `clamp-${index}.jpg`,
          timestamp: `2026-06-19T00:00:0${index}.000Z`,
          source: 'bookmark',
        }),
      );
    }

    const lastPage = await store.loadPage({ offset: 3, limit: 3 });
    assert.equal(lastPage.offset, 3);
    assert.equal(lastPage.items.length, 1);
    await store.remove(lastPage.items[0]!);

    const clampedPage = await store.loadPage({ offset: 3, limit: 3 });
    assert.equal(clampedPage.total, 3);
    assert.equal(clampedPage.offset, 0);
    assert.equal(clampedPage.items.length, 3);
    assert.equal(clampedPage.hasOlder, false);
    assert.equal(clampedPage.hasNewer, false);
  } finally {
    await store.close();
  }
});

test('IndexedDbBookmarkStore can scope visible bookmarks to the current site', async () => {
  await deleteImageTrailDb();
  const store = new IndexedDbBookmarkStore();
  try {
    await store.save(
      createDisplayRecord({
        id: 'https://duckduckgo.com/image-proxy?u=https%3A%2F%2Fcdn.example.test%2Fduck.jpg',
        url: 'https://duckduckgo.com/image-proxy?u=https%3A%2F%2Fcdn.example.test%2Fduck.jpg',
        label: 'duck.jpg',
        timestamp: '2026-06-19T00:00:00.000Z',
        source: 'bookmark',
      }),
    );
    await store.save(
      createDisplayRecord({
        id: 'https://other.example.test/other.jpg',
        url: 'https://other.example.test/other.jpg',
        label: 'other.jpg',
        timestamp: '2026-06-19T00:00:01.000Z',
        source: 'bookmark',
      }),
    );

    const globalPage = await store.loadPage({ offset: 0, limit: 30, scope: 'global', currentPageUrl: 'https://duckduckgo.com/' });
    const sourceSitePage = await store.loadPage({ offset: 0, limit: 30, scope: 'site', currentPageUrl: 'https://cdn.example.test/page' });
    const proxySitePage = await store.loadPage({ offset: 0, limit: 30, scope: 'site', currentPageUrl: 'https://duckduckgo.com/' });

    assert.equal(globalPage.total, 2);
    assert.deepEqual(
      sourceSitePage.items.map((item) => item.url),
      [],
    );
    assert.deepEqual(
      proxySitePage.items.map((item) => item.url),
      ['https://duckduckgo.com/image-proxy?u=https%3A%2F%2Fcdn.example.test%2Fduck.jpg'],
    );
    assert.equal(sourceSitePage.total, 0);
    assert.equal(proxySitePage.total, 1);
  } finally {
    await store.close();
  }
});
