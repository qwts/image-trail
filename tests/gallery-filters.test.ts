import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import {
  EMPTY_GALLERY_FILTERS,
  activeGalleryFilterCount,
  galleryFilterFacets,
  galleryFiltersActive,
  galleryRecordMatchesFilters,
  privacySafeGalleryFilters,
} from '../extension/src/gallery/gallery-filters.js';

const records: readonly ImageDisplayRecord[] = [
  {
    id: 'url-pin',
    url: 'https://cdn.example.test/photos/one.jpg',
    timestamp: '2026-07-01T00:00:03.000Z',
  },
  {
    id: 'captured',
    url: 'https://images.example.test/two.png',
    timestamp: '2026-07-01T00:00:02.000Z',
    captureStatus: 'captured',
    blobId: 'blob-1',
  },
  {
    id: 'unknown',
    url: 'https://cdn.example.test/no-extension',
    timestamp: '2026-07-01T00:00:01.000Z',
  },
  {
    id: 'locked',
    url: 'image-trail-private:record',
    timestamp: '2026-07-01T00:00:00.000Z',
    privacyStatus: 'locked',
    protectedPin: {
      plainPinId: 'locked',
      hasEncryptedMetadata: true,
      hasEncryptedThumbnail: true,
      hasStoredOriginal: true,
    },
  },
];

test('gallery filters combine source host, record kind, and image type with AND semantics', () => {
  const filters = { sourceHost: 'images.example.test', recordKind: 'stored-original', imageType: 'PNG' } as const;
  assert.equal(galleryRecordMatchesFilters(records[1]!, filters, { privacyMode: false }), true);
  assert.equal(galleryRecordMatchesFilters(records[0]!, filters, { privacyMode: false }), false);
  assert.equal(galleryRecordMatchesFilters(records[2]!, filters, { privacyMode: false }), false);
  assert.equal(galleryFiltersActive(filters), true);
  assert.equal(activeGalleryFilterCount(filters), 3);
});

test('gallery filter facets are stable, deduplicated, and metadata-only', () => {
  assert.deepEqual(galleryFilterFacets(records, { privacyMode: false }), {
    sourceHosts: ['cdn.example.test', 'images.example.test'],
    imageTypes: ['JPG', 'PNG', 'UNKNOWN'],
  });
});

test('locked-private and unknown-type filters remain explicit', () => {
  assert.equal(
    galleryRecordMatchesFilters(records[3]!, { ...EMPTY_GALLERY_FILTERS, recordKind: 'locked-private' }, { privacyMode: false }),
    true,
  );
  assert.equal(galleryRecordMatchesFilters(records[2]!, { ...EMPTY_GALLERY_FILTERS, imageType: 'UNKNOWN' }, { privacyMode: false }), true);
});

test('privacy mode removes URL-derived filter state and facets without exposing locked metadata', () => {
  const filters = { sourceHost: 'cdn.example.test', recordKind: 'locked-private', imageType: 'JPG' } as const;
  assert.deepEqual(privacySafeGalleryFilters(filters, true), {
    sourceHost: null,
    recordKind: 'locked-private',
    imageType: null,
  });
  assert.deepEqual(galleryFilterFacets(records, { privacyMode: true }), { sourceHosts: [], imageTypes: [] });
  assert.equal(galleryRecordMatchesFilters(records[3]!, filters, { privacyMode: true }), true);
});
