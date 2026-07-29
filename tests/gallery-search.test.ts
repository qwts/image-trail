import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import { galleryRecordMatchesSearch, gallerySearchText, normalizeGallerySearchQuery } from '../extension/src/gallery/gallery-search.js';
import { EMPTY_GALLERY_FILTERS } from '../extension/src/gallery/gallery-filters.js';
import { GallerySourceCache, loadGallerySearchPage } from '../extension/src/gallery/gallery-search-loader.js';

const records: readonly ImageDisplayRecord[] = [
  {
    id: 'a',
    url: 'https://cdn.example.test/photos/mars-rover.jpg?size=large',
    label: 'Mars rover',
    timestamp: '2026-07-01T00:00:03.000Z',
    queueUpdatedAt: '2026-07-01T00:00:03.000Z',
  },
  {
    id: 'b',
    url: 'https://images.example.test/photo.png',
    title: 'Earthrise',
    timestamp: '2026-07-01T00:00:02.000Z',
    queueUpdatedAt: '2026-07-01T00:00:02.000Z',
  },
  {
    id: 'c',
    url: 'https://archive.example.test/venus.webp',
    captureStatus: 'captured',
    storedOriginal: {
      blobId: 'blob-secret',
      mimeType: 'image/webp',
      byteLength: 123,
      capturedAt: '2026-07-01T00:00:01.000Z',
    },
    timestamp: '2026-07-01T00:00:01.000Z',
    queueUpdatedAt: '2026-07-01T00:00:01.000Z',
  },
];

test('gallery search normalizes whitespace and case', () => {
  assert.equal(normalizeGallerySearchQuery('  Mars   JPG  '), 'mars jpg');
});

test('gallery search matches durable metadata without encrypted blob identifiers', () => {
  assert.equal(galleryRecordMatchesSearch(records[0]!, 'cdn mars', { privacyMode: false }), true);
  assert.equal(galleryRecordMatchesSearch(records[1]!, 'earthrise png', { privacyMode: false }), true);
  assert.equal(galleryRecordMatchesSearch(records[2]!, 'captured webp', { privacyMode: false }), true);
  assert.equal(gallerySearchText(records[2]!, { privacyMode: false }).includes('blob-secret'), false);
});

test('gallery search hides URL and label terms while privacy mode is active', () => {
  assert.equal(galleryRecordMatchesSearch(records[0]!, 'mars', { privacyMode: true }), false);
  assert.equal(galleryRecordMatchesSearch(records[0]!, 'jpg', { privacyMode: true }), false);
  assert.equal(galleryRecordMatchesSearch(records[0]!, 'private image', { privacyMode: true }), true);
});

test('gallery search paging preserves queue order within matches', async () => {
  const page = await loadGallerySearchPage({
    store: pagedStore(records),
    query: 'example',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 1,
    limit: 1,
    privacyMode: false,
  });

  assert.deepEqual(
    page.items.map((record) => record.id),
    ['b'],
  );
  assert.equal(page.total, 3);
  assert.equal(page.hasNewer, true);
  assert.equal(page.hasOlder, true);
});

test('gallery search treats zero limit as unlimited results', async () => {
  const page = await loadGallerySearchPage({
    store: pagedStore(records),
    query: 'example',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 2,
    limit: 0,
    privacyMode: false,
  });

  assert.deepEqual(
    page.items.map((record) => record.id),
    ['a', 'b', 'c'],
  );
  assert.equal(page.offset, 0);
  assert.equal(page.hasNewer, false);
  assert.equal(page.hasOlder, false);
});

test('gallery search clamps stale offsets to the final available page', async () => {
  const page = await loadGallerySearchPage({
    store: pagedStore(records),
    query: 'example',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 72,
    limit: 2,
    privacyMode: false,
  });

  assert.deepEqual(
    page.items.map((record) => record.id),
    ['c'],
  );
  assert.equal(page.offset, 2);
  assert.equal(page.total, 3);
  assert.equal(page.hasNewer, true);
  assert.equal(page.hasOlder, false);
});

test('gallery search requests a bounded durable page for small libraries', async () => {
  const calls: { readonly offset: number; readonly limit: number }[] = [];
  const page = await loadGallerySearchPage({
    store: pagedStore(records, calls),
    query: 'example',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 1,
    limit: 1,
    privacyMode: false,
  });

  assert.deepEqual(
    page.items.map((record) => record.id),
    ['b'],
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.offset, 0);
  assert.equal(calls[0]?.limit, 100);
});

test('gallery search and filters share one durable scan and preserve queue order', async () => {
  const calls: { readonly offset: number; readonly limit: number }[] = [];
  const page = await loadGallerySearchPage({
    store: pagedStore(records, calls),
    query: 'example',
    filters: { sourceHost: null, recordKind: 'url-only', imageType: 'PNG' },
    offset: 0,
    limit: 72,
    privacyMode: false,
  });

  assert.deepEqual(
    page.items.map((record) => record.id),
    ['b'],
  );
  assert.equal(page.total, 1);
  assert.equal(calls.length, 1);
  assert.deepEqual(page.facets.sourceHosts, ['archive.example.test', 'cdn.example.test', 'images.example.test']);
});

test('gallery search collects large libraries through bounded durable pages', async () => {
  const largeLibrary = Array.from({ length: 205 }, (_, index): ImageDisplayRecord => ({
    id: `record-${index}`,
    url: `https://images.example.test/photo-${index}.jpg`,
    timestamp: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
    queueUpdatedAt: new Date(Date.UTC(2026, 6, 1, 0, 0, index)).toISOString(),
  }));
  const calls: { readonly offset: number; readonly limit: number }[] = [];

  const page = await loadGallerySearchPage({
    store: pagedStore(largeLibrary, calls),
    query: 'example',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 200,
    limit: 10,
    privacyMode: false,
  });

  assert.deepEqual(calls, [
    { offset: 0, limit: 100, scope: 'global' },
    { offset: 100, limit: 100, scope: 'global' },
    { offset: 200, limit: 100, scope: 'global' },
  ]);
  assert.equal(page.total, 205);
  assert.equal(page.offset, 200);
  assert.equal(page.items.length, 5);
});

test('gallery source cache shares in-flight scans and retries after a failed scan', async () => {
  let attempts = 0;
  let releaseFirstScan!: () => void;
  const firstScanBlocked = new Promise<void>((resolve) => {
    releaseFirstScan = resolve;
  });
  const cache = new GallerySourceCache({
    async loadPage() {
      attempts += 1;
      if (attempts === 1) {
        await firstScanBlocked;
        throw new Error('transient scan failure');
      }
      return { items: records, offset: 0, limit: 100, total: records.length, hasOlder: false, hasNewer: false };
    },
  });

  const first = cache.load();
  const shared = cache.load();
  assert.equal(first, shared);
  releaseFirstScan();
  await assert.rejects(first, /transient scan failure/u);
  assert.deepEqual(await cache.load(), records);
  assert.equal(attempts, 2);
});

function pagedStore(
  items: readonly ImageDisplayRecord[],
  calls: { readonly offset: number; readonly limit: number; readonly scope?: 'global' | 'site' }[] = [],
) {
  return {
    async loadPage(input: { readonly offset: number; readonly limit: number; readonly scope?: 'global' | 'site' }) {
      calls.push(input);
      const pageItems = items.slice(input.offset, input.offset + input.limit);
      return {
        items: pageItems,
        offset: input.offset,
        limit: input.limit,
        total: items.length,
        hasOlder: input.offset + input.limit < items.length,
        hasNewer: input.offset > 0,
      };
    },
  };
}
