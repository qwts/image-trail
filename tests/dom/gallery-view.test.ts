import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { GalleryAlbumSummary } from '../../extension/src/gallery/gallery-albums.js';
import { createGalleryView, type GalleryViewHandlers, type GalleryViewState } from '../../extension/src/gallery/gallery-view.js';

const record: ImageDisplayRecord = {
  id: 'pin-1',
  url: 'https://images.example.test/photo.jpg',
  thumbnail: 'data:image/png;base64,abc',
  timestamp: '2026-07-01T00:00:00.000Z',
};

const album: GalleryAlbumSummary = {
  album: {
    schemaVersion: 1,
    id: 'album-1',
    name: 'Reference',
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
  },
  recordIds: ['pin-1'],
};

function galleryState(overrides: Partial<GalleryViewState> = {}): GalleryViewState {
  return {
    items: [],
    albums: [],
    selectedAlbumId: null,
    missingAlbumRecordCount: 0,
    searchQuery: '',
    draftSearchQuery: '',
    offset: 0,
    limit: 72,
    total: 0,
    hasOlder: false,
    hasNewer: false,
    loading: false,
    message: null,
    blobKeyUnlocked: false,
    privacyMode: false,
    ...overrides,
  };
}

function galleryHandlers(overrides: Partial<GalleryViewHandlers> = {}): GalleryViewHandlers {
  return {
    openRecord: () => assert.fail('unexpected open'),
    createAlbum: () => assert.fail('unexpected create album'),
    selectAlbum: () => assert.fail('unexpected album select'),
    renameAlbum: () => assert.fail('unexpected album rename'),
    deleteAlbum: () => assert.fail('unexpected album delete'),
    addRecordToAlbum: () => assert.fail('unexpected album add'),
    removeRecordFromAlbum: () => assert.fail('unexpected album remove'),
    updateSearch: () => assert.fail('unexpected search'),
    clearSearch: () => assert.fail('unexpected clear'),
    updatePageLimit: () => assert.fail('unexpected limit update'),
    loadPage: () => assert.fail('unexpected page load'),
    reload: () => assert.fail('unexpected reload'),
    ...overrides,
  };
}

function buttonByText(view: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(view.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  assert.ok(button, `expected a button labelled "${text}"`);
  return button;
}

test('gallery view renders durable records in a bounded page grid', () => {
  const opened: ImageDisplayRecord[] = [];
  const view = createGalleryView(
    galleryState({
      items: [record],
      total: 1,
    }),
    galleryHandlers({
      openRecord: (item) => opened.push(item),
    }),
  );

  assert.equal(view.querySelectorAll('.image-trail-gallery__card').length, 1);
  assert.match(view.textContent ?? '', /1-1 of 1 durable records/u);
  const recordButton = view.querySelector('.image-trail-gallery__card-button');
  assert.ok(recordButton instanceof HTMLButtonElement);
  recordButton.click();
  assert.deepEqual(opened, [record]);
});

test('gallery view disables locked private records without exposing metadata', () => {
  const locked: ImageDisplayRecord = {
    ...record,
    url: 'image-trail-private:pin-1',
    privacyStatus: 'locked',
    thumbnail: undefined,
    protectedPin: {
      plainPinId: 'pin-1',
      hasEncryptedMetadata: true,
      hasEncryptedThumbnail: true,
      hasStoredOriginal: true,
    },
  };
  const view = createGalleryView(
    galleryState({
      items: [locked],
      total: 1,
      blobKeyUnlocked: true,
    }),
    galleryHandlers({
      openRecord: () => assert.fail('locked record should not open'),
    }),
  );

  const recordButton = Array.from(view.querySelectorAll('button')).find((button) => button.textContent?.includes('Private pin'));
  assert.ok(recordButton);
  assert.equal(recordButton.disabled, true);
  assert.equal(view.textContent?.includes('photo.jpg'), false);
});

test('gallery view masks unlocked thumbnails in privacy mode', () => {
  const view = createGalleryView(
    galleryState({
      items: [record],
      total: 1,
      privacyMode: true,
    }),
    galleryHandlers(),
  );

  assert.equal(view.querySelector('img'), null);
  assert.match(view.textContent ?? '', /PRIVATE/u);
  assert.equal(view.textContent?.includes('photo.jpg'), false);
});

test('gallery paging buttons request bounded windows', () => {
  const loads: number[] = [];
  const view = createGalleryView(
    galleryState({
      items: [record],
      offset: 72,
      total: 145,
      hasOlder: true,
      hasNewer: true,
    }),
    galleryHandlers({
      loadPage: (offset) => loads.push(offset),
      reload: () => loads.push(72),
    }),
  );

  buttonByText(view, 'Newer').click();
  buttonByText(view, 'Older').click();
  buttonByText(view, 'Reload').click();

  assert.deepEqual(loads, [0, 144, 72]);
});

test('gallery search input and clear control dispatch query changes', () => {
  const queries: string[] = [];
  let cleared = false;
  const view = createGalleryView(
    galleryState({
      searchQuery: 'mars',
      draftSearchQuery: 'mars',
    }),
    galleryHandlers({
      updateSearch: (query) => queries.push(query),
      clearSearch: () => {
        cleared = true;
      },
    }),
  );

  const input = view.querySelector<HTMLInputElement>('input[type="search"]');
  assert.ok(input);
  assert.equal(input.value, 'mars');
  input.value = 'earth';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  assert.equal(buttonByText(view, 'Clear').disabled, false);
  buttonByText(view, 'Clear').click();

  assert.deepEqual(queries, ['earth']);
  assert.equal(cleared, true);
  assert.match(view.textContent ?? '', /No gallery matches/u);
});

test('gallery limit form accepts zero as unlimited', () => {
  const limits: number[] = [];
  const view = createGalleryView(
    galleryState({
      items: [record],
      limit: 0,
      total: 1,
    }),
    galleryHandlers({
      updatePageLimit: (limit) => limits.push(limit),
    }),
  );

  const input = view.querySelector<HTMLInputElement>('input[type="number"]');
  assert.ok(input);
  assert.equal(input.value, '0');
  input.value = '24';
  buttonByText(view, 'Apply').click();

  assert.deepEqual(limits, [24]);
  assert.match(view.textContent ?? '', /0 shows all/u);
});

test('gallery album controls create select rename and delete albums', () => {
  const log: string[] = [];
  const view = createGalleryView(
    galleryState({
      albums: [album],
      selectedAlbumId: 'album-1',
    }),
    galleryHandlers({
      createAlbum: (name) => log.push(`create:${name}`),
      selectAlbum: (albumId) => log.push(`select:${albumId ?? 'all'}`),
      renameAlbum: (albumId, name) => log.push(`rename:${albumId}:${name}`),
      deleteAlbum: (albumId) => log.push(`delete:${albumId}`),
    }),
  );

  const newInput = view.querySelector<HTMLInputElement>('input[placeholder="Album name"]');
  assert.ok(newInput);
  newInput.value = 'Mars';
  buttonByText(view, 'Create album').click();
  buttonByText(view, 'All Images').click();
  buttonByText(view, 'Reference (1)').click();

  const selectedInput = Array.from(view.querySelectorAll<HTMLInputElement>('input[type="text"]')).find(
    (input) => input.value === 'Reference',
  );
  assert.ok(selectedInput);
  selectedInput.value = 'Archive';
  buttonByText(view, 'Rename').click();
  buttonByText(view, 'Delete album').click();

  assert.deepEqual(log, ['create:Mars', 'select:all', 'select:album-1', 'rename:album-1:Archive', 'delete:album-1']);
});

test('gallery record cards add and remove album memberships', () => {
  const log: string[] = [];
  const allImagesView = createGalleryView(
    galleryState({
      items: [record],
      albums: [album],
      total: 1,
    }),
    galleryHandlers({
      addRecordToAlbum: (albumId, recordId) => log.push(`add:${albumId}:${recordId}`),
    }),
  );

  const select = allImagesView.querySelector<HTMLSelectElement>('.image-trail-gallery__card-actions select');
  assert.ok(select);
  select.value = 'album-1';
  buttonByText(allImagesView, 'Add to album').click();

  const albumView = createGalleryView(
    galleryState({
      items: [record],
      albums: [album],
      selectedAlbumId: 'album-1',
      total: 1,
    }),
    galleryHandlers({
      removeRecordFromAlbum: (albumId, recordId) => log.push(`remove:${albumId}:${recordId}`),
    }),
  );
  buttonByText(albumView, 'Remove from album').click();

  assert.deepEqual(log, ['add:album-1:pin-1', 'remove:album-1:pin-1']);
});

test('gallery selected album status reports missing durable records', () => {
  const view = createGalleryView(
    galleryState({
      albums: [album],
      selectedAlbumId: 'album-1',
      total: 0,
      missingAlbumRecordCount: 1,
    }),
    galleryHandlers(),
  );

  assert.match(view.textContent ?? '', /1 missing album record skipped/u);
});
