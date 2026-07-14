import test from 'node:test';
import assert from 'node:assert/strict';

import { detectPageContext } from '../../extension/src/content/page-context-detection.js';

function appendQualifyingImage(parent: HTMLElement, id: number): HTMLImageElement {
  const image = document.createElement('img');
  image.src = `https://images.example.test/${id}.jpg`;
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 320 },
    naturalHeight: { configurable: true, value: 240 },
  });
  parent.append(image);
  return image;
}

test.beforeEach(() => document.body.replaceChildren());

test('detects single-image and non-semantic gallery pages from qualifying images', () => {
  appendQualifyingImage(document.body, 1);
  assert.deepEqual(detectPageContext(), { detected: 'single', available: ['single'], imageCount: 1 });

  appendQualifyingImage(document.body, 2);
  assert.deepEqual(detectPageContext(), {
    detected: 'gallery',
    available: ['single', 'gallery', 'feed'],
    imageCount: 2,
  });
});

test('detects semantic feeds from role=feed and repeated image-bearing articles', () => {
  const feed = document.createElement('main');
  feed.setAttribute('role', 'feed');
  appendQualifyingImage(feed, 1);
  appendQualifyingImage(feed, 2);
  document.body.append(feed);
  assert.equal(detectPageContext().detected, 'feed');

  document.body.replaceChildren();
  for (let index = 0; index < 2; index += 1) {
    const article = document.createElement('article');
    appendQualifyingImage(article, index);
    document.body.append(article);
  }
  assert.equal(detectPageContext().detected, 'feed');
});

test('ignores tiny images and exposes no override capabilities without a qualifying image', () => {
  const image = appendQualifyingImage(document.body, 1);
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 20 });
  assert.deepEqual(detectPageContext(), { detected: 'single', available: [], imageCount: 0 });
});
