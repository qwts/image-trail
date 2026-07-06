import test from 'node:test';
import assert from 'node:assert/strict';

import type { ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import { createGalleryView } from '../../extension/src/gallery/gallery-view.js';

const record: ImageDisplayRecord = {
  id: 'pin-1',
  url: 'https://images.example.test/photo.jpg',
  thumbnail: 'data:image/png;base64,abc',
  timestamp: '2026-07-01T00:00:00.000Z',
};

function buttonByText(view: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(view.querySelectorAll('button')).find((candidate) => candidate.textContent === text);
  assert.ok(button, `expected a button labelled "${text}"`);
  return button;
}

test('gallery view renders durable records in a bounded page grid', () => {
  const opened: ImageDisplayRecord[] = [];
  const view = createGalleryView(
    {
      items: [record],
      offset: 0,
      limit: 72,
      total: 1,
      hasOlder: false,
      hasNewer: false,
      loading: false,
      message: null,
      blobKeyUnlocked: false,
      privacyMode: false,
    },
    {
      openRecord: (item) => opened.push(item),
      loadPage: () => assert.fail('unexpected page load'),
      reload: () => assert.fail('unexpected reload'),
    },
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
    {
      items: [locked],
      offset: 0,
      limit: 72,
      total: 1,
      hasOlder: false,
      hasNewer: false,
      loading: false,
      message: null,
      blobKeyUnlocked: true,
      privacyMode: false,
    },
    {
      openRecord: () => assert.fail('locked record should not open'),
      loadPage: () => assert.fail('unexpected page load'),
      reload: () => assert.fail('unexpected reload'),
    },
  );

  const recordButton = Array.from(view.querySelectorAll('button')).find((button) => button.textContent?.includes('Private pin'));
  assert.ok(recordButton);
  assert.equal(recordButton.disabled, true);
  assert.equal(view.textContent?.includes('photo.jpg'), false);
});

test('gallery view masks unlocked thumbnails in privacy mode', () => {
  const view = createGalleryView(
    {
      items: [record],
      offset: 0,
      limit: 72,
      total: 1,
      hasOlder: false,
      hasNewer: false,
      loading: false,
      message: null,
      blobKeyUnlocked: false,
      privacyMode: true,
    },
    {
      openRecord: () => assert.fail('unexpected open'),
      loadPage: () => assert.fail('unexpected page load'),
      reload: () => assert.fail('unexpected reload'),
    },
  );

  assert.equal(view.querySelector('img'), null);
  assert.match(view.textContent ?? '', /PRIVATE/u);
  assert.equal(view.textContent?.includes('photo.jpg'), false);
});

test('gallery paging buttons request bounded windows', () => {
  const loads: number[] = [];
  const view = createGalleryView(
    {
      items: [record],
      offset: 72,
      limit: 72,
      total: 145,
      hasOlder: true,
      hasNewer: true,
      loading: false,
      message: null,
      blobKeyUnlocked: false,
      privacyMode: false,
    },
    {
      openRecord: () => assert.fail('unexpected open'),
      loadPage: (offset) => loads.push(offset),
      reload: () => loads.push(72),
    },
  );

  buttonByText(view, 'Newer').click();
  buttonByText(view, 'Older').click();
  buttonByText(view, 'Reload').click();

  assert.deepEqual(loads, [0, 144, 72]);
});
