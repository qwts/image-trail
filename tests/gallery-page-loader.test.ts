import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import type { GalleryAlbumSummary } from '../extension/src/gallery/gallery-albums.js';
import { EMPTY_GALLERY_FILTERS } from '../extension/src/gallery/gallery-filters.js';
import { loadGalleryPageForSelection } from '../extension/src/gallery/gallery-page-loader.js';
import { GallerySourceCache } from '../extension/src/gallery/gallery-search-loader.js';

const records: readonly ImageDisplayRecord[] = [
  { id: 'one', url: 'https://one.example.test/photo.jpg', timestamp: '2026-07-01T00:00:03.000Z' },
  { id: 'two', url: 'https://two.example.test/photo.png', timestamp: '2026-07-01T00:00:02.000Z' },
  { id: 'three', url: 'https://one.example.test/photo.webp', timestamp: '2026-07-01T00:00:01.000Z' },
];

const album: GalleryAlbumSummary = {
  album: {
    schemaVersion: 1,
    id: 'album',
    name: 'Selected',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  recordIds: ['three', 'missing', 'one'],
};

test('Gallery page loading composes filters with the global durable queue order', async () => {
  const loadPageCalls: number[] = [];
  const galleryStore = store(records, loadPageCalls);
  const sourceCache = new GallerySourceCache(galleryStore);
  const result = await loadGalleryPageForSelection({
    store: galleryStore,
    sourceCache,
    album: null,
    query: '',
    filters: { ...EMPTY_GALLERY_FILTERS, sourceHost: 'one.example.test' },
    offset: 0,
    settings: settings(),
  });

  assert.deepEqual(
    result.page.items.map((record) => record.id),
    ['one', 'three'],
  );
  assert.equal(result.missingCount, 0);

  await loadGalleryPageForSelection({
    store: galleryStore,
    sourceCache,
    album: null,
    query: 'photo',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 0,
    settings: settings(),
  });
  assert.equal(loadPageCalls.length, 1);

  sourceCache.invalidate();
  await loadGalleryPageForSelection({
    store: galleryStore,
    sourceCache,
    album: null,
    query: '',
    filters: EMPTY_GALLERY_FILTERS,
    offset: 0,
    settings: settings(),
  });
  assert.equal(loadPageCalls.length, 2);
});

test('Gallery page loading filters within album membership order and reports missing records', async () => {
  const loadPageCalls: number[] = [];
  const galleryStore = store(records, loadPageCalls);
  const result = await loadGalleryPageForSelection({
    store: galleryStore,
    sourceCache: new GallerySourceCache(galleryStore),
    album,
    query: '',
    filters: { ...EMPTY_GALLERY_FILTERS, imageType: 'WEBP' },
    offset: 0,
    settings: settings(),
  });

  assert.deepEqual(
    result.page.items.map((record) => record.id),
    ['three'],
  );
  assert.equal(result.missingCount, 1);
  assert.deepEqual(result.page.facets.imageTypes, ['JPG', 'WEBP']);
  assert.equal(loadPageCalls.length, 0);
});

function store(items: readonly ImageDisplayRecord[], loadPageCalls: number[] = []) {
  return {
    async loadPage(input: { readonly offset: number; readonly limit: number }) {
      loadPageCalls.push(input.offset);
      const page = items.slice(input.offset, input.offset + input.limit);
      return {
        items: page,
        offset: input.offset,
        limit: input.limit,
        total: items.length,
        hasOlder: input.offset + input.limit < items.length,
        hasNewer: input.offset > 0,
      };
    },
    async loadByIds(ids: readonly string[]) {
      const byId = new Map(items.map((item) => [item.id, item]));
      return ids.flatMap((id) => {
        const item = byId.get(id);
        return item ? [item] : [];
      });
    },
  };
}

function settings() {
  return {
    galleryPageLimit: 72,
    privacyModeEnabled: false,
  };
}
