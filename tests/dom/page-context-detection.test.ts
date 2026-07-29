import test from 'node:test';
import assert from 'node:assert/strict';

import {
  detectPageContext,
  PageContextDetector,
  pageContextMutationAffectsDetection,
} from '../../extension/src/content/page-context-detection.js';

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

function trackRectReads(image: HTMLImageElement): () => number {
  let reads = 0;
  Object.defineProperty(image, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      reads += 1;
      return { height: 240, width: 320 } as DOMRect;
    },
  });
  return () => reads;
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

test('qualifies each image once while classifying a semantic feed', () => {
  const feed = document.createElement('main');
  feed.setAttribute('role', 'feed');
  const firstLane = document.createElement('section');
  const secondLane = document.createElement('section');
  firstLane.setAttribute('role', 'feed');
  secondLane.setAttribute('role', 'feed');
  const firstReads = trackRectReads(appendQualifyingImage(firstLane, 1));
  const secondReads = trackRectReads(appendQualifyingImage(secondLane, 2));
  feed.append(firstLane, secondLane);
  document.body.append(feed);

  assert.equal(detectPageContext().detected, 'feed');
  assert.deepEqual([firstReads(), secondReads()], [1, 1]);
});

test('caches unchanged image qualification and invalidates only affected images', () => {
  const detector = new PageContextDetector();
  const first = appendQualifyingImage(document.body, 1);
  const second = appendQualifyingImage(document.body, 2);
  const firstReads = trackRectReads(first);
  const secondReads = trackRectReads(second);

  assert.equal(detector.detect().imageCount, 2);
  assert.equal(detector.detect().imageCount, 2);
  assert.deepEqual([firstReads(), secondReads()], [1, 1]);

  const third = appendQualifyingImage(document.body, 3);
  const thirdReads = trackRectReads(third);
  detector.invalidate([
    {
      addedNodes: [third],
      removedNodes: [],
      target: document.body,
      type: 'childList',
    } as unknown as MutationRecord,
  ]);
  assert.equal(detector.detect().imageCount, 3);
  assert.deepEqual([firstReads(), secondReads(), thirdReads()], [1, 1, 1]);

  Object.defineProperty(first, 'naturalWidth', { configurable: true, value: 20 });
  detector.invalidate([
    {
      attributeName: 'width',
      target: first,
      type: 'attributes',
    } as unknown as MutationRecord,
  ]);
  assert.equal(detector.detect().imageCount, 2);
  assert.deepEqual([firstReads(), secondReads(), thirdReads()], [2, 1, 1]);
});

test('rechecks initially unqualified images and expires cached positive layout results', () => {
  let now = 0;
  const detector = new PageContextDetector({ cacheTtlMs: 100, now: () => now });
  const image = appendQualifyingImage(document.body, 1);
  const reads = trackRectReads(image);
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 20 },
    naturalHeight: { configurable: true, value: 20 },
  });

  assert.equal(detector.detect().imageCount, 0);
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 320 },
    naturalHeight: { configurable: true, value: 240 },
  });
  assert.equal(detector.detect().imageCount, 1);
  assert.equal(reads(), 2);

  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 20 },
    naturalHeight: { configurable: true, value: 20 },
  });
  now = 99;
  assert.equal(detector.detect().imageCount, 1);
  now = 100;
  assert.equal(detector.detect().imageCount, 0);
  assert.equal(reads(), 3);
});

test('filters unrelated host mutations before scheduling another detection pass', () => {
  const text = document.createElement('span');
  const wrapper = document.createElement('article');
  appendQualifyingImage(wrapper, 1);
  const image = wrapper.querySelector('img');
  assert.ok(image);

  const childRecord = (node: Node): MutationRecord =>
    ({
      addedNodes: [node],
      removedNodes: [],
      target: document.body,
      type: 'childList',
    }) as unknown as MutationRecord;
  const attributeRecord = (target: Node, attributeName: string): MutationRecord =>
    ({ attributeName, target, type: 'attributes' }) as MutationRecord;

  assert.equal(pageContextMutationAffectsDetection([childRecord(text)]), false);
  assert.equal(pageContextMutationAffectsDetection([childRecord(wrapper)]), true);
  assert.equal(pageContextMutationAffectsDetection([attributeRecord(image, 'src')]), true);
  assert.equal(pageContextMutationAffectsDetection([attributeRecord(image, 'data-src')]), true);
  assert.equal(pageContextMutationAffectsDetection([attributeRecord(wrapper, 'role')]), true);
  assert.equal(pageContextMutationAffectsDetection([attributeRecord(wrapper, 'class')]), true);
  assert.equal(pageContextMutationAffectsDetection([attributeRecord(text, 'class')]), false);

  const style = document.createElement('style');
  assert.equal(pageContextMutationAffectsDetection([childRecord(style)]), true);
});

test('ignores tiny images and exposes no override capabilities without a qualifying image', () => {
  const image = appendQualifyingImage(document.body, 1);
  Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 20 });
  assert.deepEqual(detectPageContext(), { detected: 'single', available: [], imageCount: 0 });
});
