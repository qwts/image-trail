import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../extension/src/core/display-records.js';
import { galleryRecordKind, openActionForGalleryRecord } from '../extension/src/gallery/gallery-model.js';

const baseRecord: ImageDisplayRecord = {
  id: 'pin-1',
  url: 'https://images.example.test/photo.jpg',
  timestamp: '2026-07-01T00:00:00.000Z',
};

test('URL-only gallery records open the durable saved URL', () => {
  assert.deepEqual(openActionForGalleryRecord(baseRecord, { blobKeyUnlocked: false }), {
    kind: 'open-url',
    url: baseRecord.url,
  });
  assert.equal(galleryRecordKind(baseRecord), 'URL-only pin');
});

test('data URL gallery records use the preview tab path', () => {
  const dataUrl = 'data:image/png;base64,abc';
  assert.deepEqual(openActionForGalleryRecord({ ...baseRecord, url: dataUrl }, { blobKeyUnlocked: false }), {
    kind: 'preview-data-url',
    dataUrl,
  });
});

test('captured originals preview the encrypted blob only when the key is unlocked', () => {
  const captured: ImageDisplayRecord = {
    ...baseRecord,
    captureStatus: 'captured',
    blobId: 'blob-1',
    storedOriginal: {
      blobId: 'blob-1',
      mimeType: 'image/jpeg',
      byteLength: 1024,
      capturedAt: '2026-07-01T00:00:00.000Z',
    },
  };

  assert.deepEqual(openActionForGalleryRecord(captured, { blobKeyUnlocked: true }), {
    kind: 'preview-blob',
    blobId: 'blob-1',
  });
  assert.equal(openActionForGalleryRecord(captured, { blobKeyUnlocked: false }).kind, 'locked');
  assert.equal(galleryRecordKind(captured), 'Captured original');
});

test('locked protected records never expose an open or preview action', () => {
  const locked: ImageDisplayRecord = {
    ...baseRecord,
    url: 'image-trail-private:pin-1',
    privacyStatus: 'locked',
    protectedPin: {
      plainPinId: 'pin-1',
      hasEncryptedMetadata: true,
      hasEncryptedThumbnail: true,
      hasStoredOriginal: true,
    },
  };

  assert.equal(openActionForGalleryRecord(locked, { blobKeyUnlocked: true }).kind, 'locked');
  assert.equal(galleryRecordKind(locked), 'Locked private pin');
});

test('unsupported non-image-trail schemes do not open', () => {
  const unsupported = { ...baseRecord, url: 'image-trail-private:pin-1' };
  assert.equal(openActionForGalleryRecord(unsupported, { blobKeyUnlocked: true }).kind, 'unsupported');
});
