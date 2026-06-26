import type { ImageDisplayRecord } from '../../core/display-records.js';
import type { RecallState } from '../../core/types.js';
import type { UrlFieldDigitWidthSpec } from '../../core/url/types.js';
import type { EditableField } from '../components/fields-view.js';

const BASE_TIME = '2026-06-25T15:30:00.000Z';

const THUMBNAILS = {
  blue: 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 fill=%22%230f766e%22/%3E%3Ccircle cx=%2252%22 cy=%2228%22 r=%2218%22 fill=%22%23a7f3d0%22/%3E%3Cpath d=%22M8 70 30 44l13 14 12-10 17 22z%22 fill=%22%23ecfeff%22/%3E%3C/svg%3E',
  green:
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 fill=%22%232f5d50%22/%3E%3Cpath d=%22M10 62h60L48 25 34 48 26 38z%22 fill=%22%23d9f99d%22/%3E%3C/svg%3E',
  purple:
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 80 80%22%3E%3Crect width=%2280%22 height=%2280%22 fill=%22%234c1d95%22/%3E%3Crect x=%2216%22 y=%2216%22 width=%2248%22 height=%2248%22 rx=%228%22 fill=%22%23ddd6fe%22/%3E%3C/svg%3E',
} as const;

function record(overrides: Partial<ImageDisplayRecord> & Pick<ImageDisplayRecord, 'id' | 'url'>): ImageDisplayRecord {
  return {
    timestamp: BASE_TIME,
    width: 1280,
    height: 854,
    source: 'history',
    ...overrides,
  };
}

export const normalRecord = record({
  id: 'recent-normal',
  url: 'https://images.example.test/gallery/quiet-ridge.jpg',
  label: 'quiet-ridge.jpg',
  thumbnail: THUMBNAILS.blue,
});

export const selectedRecord = record({
  id: 'recent-selected',
  url: 'https://images.example.test/gallery/selected-frame.webp',
  label: 'selected-frame.webp',
  thumbnail: THUMBNAILS.green,
});

export const capturedRecord = record({
  id: 'queue-captured',
  url: 'https://cdn.example.test/originals/captured-waterfall.png',
  label: 'captured-waterfall.png',
  thumbnail: THUMBNAILS.purple,
  source: 'bookmark',
  captureStatus: 'captured',
  blobId: 'blob-captured-waterfall',
  capturedAt: BASE_TIME,
  storedOriginal: {
    blobId: 'blob-captured-waterfall',
    mimeType: 'image/png',
    byteLength: 482132,
    capturedAt: BASE_TIME,
  },
});

export const pinnedRecentRecord = record({
  id: 'recent-pinned',
  url: 'https://images.example.test/gallery/pinned-ridge.jpeg',
  label: 'pinned-ridge.jpeg',
  thumbnail: THUMBNAILS.green,
  pinnedAt: BASE_TIME,
  pinnedRecordId: 'pin-pinned-ridge',
});

export const lockedPrivateRecord = record({
  id: 'private-locked',
  url: 'https://private.example.test/originals/private-image.jpg',
  label: 'private-image.jpg',
  source: 'bookmark',
  captureStatus: 'captured',
  blobId: 'blob-private-image',
  privacyStatus: 'locked',
  protectedPin: {
    plainPinId: 'plain-private-image',
    encryptedPinId: 'encrypted-private-image',
    encryptedThumbnailId: 'thumbnail-private-image',
    storedOriginalBlobId: 'blob-private-image',
    hasEncryptedMetadata: true,
    hasEncryptedThumbnail: true,
    hasStoredOriginal: true,
  },
});

export const longOverflowRecord = record({
  id: 'long-overflow',
  url: 'https://images.example.test/gallery/2026/06/very-long-descriptive-filename-with-camera-settings-and-location-notes-final-export.jpg?token=screen-review-fixture',
  label: 'very-long-descriptive-filename-with-camera-settings-and-location-notes-final-export.jpg',
  thumbnail: THUMBNAILS.blue,
});

export const missingThumbnailRecord = record({
  id: 'missing-thumbnail',
  url: 'https://images.example.test/gallery/no-thumbnail.gif',
  label: 'no-thumbnail.gif',
  source: 'bookmark',
});

export const recentFixtures = [normalRecord, selectedRecord, pinnedRecentRecord, capturedRecord, longOverflowRecord];

export const bookmarkFixtures = [
  { ...normalRecord, id: 'queue-normal', source: 'bookmark' as const, pinnedAt: BASE_TIME },
  capturedRecord,
  lockedPrivateRecord,
  longOverflowRecord,
  missingThumbnailRecord,
];

export function recallState(overrides: Partial<RecallState> = {}): RecallState {
  const candidates = [capturedRecord, lockedPrivateRecord, longOverflowRecord, missingThumbnailRecord].map((candidate, index) => ({
    ...candidate,
    id: `recall-${candidate.id}`,
    envelopeCreatedAt: new Date(Date.parse(BASE_TIME) - index * 60_000).toISOString(),
  }));

  return {
    open: true,
    busy: false,
    side: 'right',
    candidates,
    selectedIds: [],
    offset: 0,
    nextOffset: candidates.length,
    hasMore: false,
    total: candidates.length,
    failedCount: 0,
    ...overrides,
  };
}

export const parsedFieldFixtures: EditableField[] = [
  {
    field: {
      id: 'path-gallery-year',
      location: 'path',
      label: 'Path segment 2 token 1',
      value: '2026',
      tokenKind: 'int',
      partIndex: 2,
      tokenIndex: 0,
      digitWidth: 4,
    },
    value: '2026',
  },
  {
    field: {
      id: 'path-frame',
      location: 'path',
      label: 'Path segment 4 token 1',
      value: '0042',
      tokenKind: 'int',
      partIndex: 4,
      tokenIndex: 0,
      digitWidth: 4,
    },
    value: '0042',
  },
  {
    field: {
      id: 'query-page',
      location: 'query',
      label: 'page',
      value: '17',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 0,
      digitWidth: 2,
    },
    value: '17',
  },
  {
    field: {
      id: 'query-color',
      location: 'query',
      label: 'color',
      value: '0x2a',
      tokenKind: 'hex',
      queryIndex: 1,
      tokenIndex: 0,
      digitWidth: 2,
    },
    value: '0x2a',
  },
  {
    field: {
      id: 'query-slug',
      location: 'query',
      label: 'slug',
      value: 'quiet-ridge-final',
      tokenKind: 'text',
      queryIndex: 2,
      tokenIndex: 0,
    },
    value: 'quiet-ridge-final',
  },
];

export const splitParsedFieldFixtures: EditableField[] = [
  {
    field: {
      id: 'query-sequence-a',
      location: 'query',
      label: 'sequence part 1',
      value: '2026',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 0,
      splitBaseId: 'query-sequence',
      splitPartIndex: 0,
      splitPartCount: 3,
    },
    value: '2026',
  },
  {
    field: {
      id: 'query-sequence-b',
      location: 'query',
      label: 'sequence part 2',
      value: '06',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 1,
      splitBaseId: 'query-sequence',
      splitPartIndex: 1,
      splitPartCount: 3,
      digitWidth: 2,
    },
    value: '06',
  },
  {
    field: {
      id: 'query-sequence-c',
      location: 'query',
      label: 'sequence part 3',
      value: '0042',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 2,
      splitBaseId: 'query-sequence',
      splitPartIndex: 2,
      splitPartCount: 3,
      digitWidth: 4,
    },
    value: '0042',
  },
];

export const parsedFieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[] = [
  { fieldId: 'query-page', width: 2 },
  { fieldId: 'query-color', width: 2 },
  { fieldId: 'query-sequence-c', width: 4 },
];

export const urlEditorFixtures = {
  current: 'https://images.example.test/gallery/2026/quiet-ridge-0042.jpg?page=17&color=0x2a&slug=quiet-ridge-final',
  draft: 'https://images.example.test/gallery/2026/quiet-ridge-0043.jpg?page=18&color=0x2b&slug=quiet-ridge-final',
  invalidDraft: 'https://images.example.test/gallery/2026/quiet ridge broken.jpg?token=<review-me>',
  dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB',
  long: 'https://images.example.test/gallery/2026/06/25/camera-a/exports/very-long-gallery-name-with-color-pass-and-review-notes/quiet-ridge-final-frame-00000042-ultra-wide.jpg?session=screen-review&token=long-story-fixture&color=0x2a',
} as const;
