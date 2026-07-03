import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyImageUrl,
  captureImageNavigationSnapshot,
  imageResourceUrlsEqual,
  pushVisibleUrlWhenSameOrigin,
  restoreImageNavigationSnapshot,
} from '../extension/src/core/image/image-navigation.js';

function fakeImage(): HTMLImageElement {
  const removed: string[] = [];
  const sourceRemoved: string[] = [];
  const ownerDocument = { baseURI: 'https://example.test/page' };
  const imageAttrs = new Map<string, string>([
    ['src', 'old.jpg'],
    ['srcset', 'old-1x.jpg 1x, old-2x.jpg 2x'],
    ['sizes', '100vw'],
  ]);
  const sourceAttrs = new Map<string, string>([
    ['srcset', 'source-old.webp 1x'],
    ['sizes', '80vw'],
  ]);
  const source = {
    getAttribute(name: string) {
      return sourceAttrs.get(name) ?? null;
    },
    setAttribute(name: string, value: string) {
      sourceAttrs.set(name, value);
    },
    removeAttribute(name: string) {
      sourceRemoved.push(name);
      sourceAttrs.delete(name);
    },
  };
  return {
    src: 'https://example.test/old.jpg',
    ownerDocument,
    removed,
    sourceRemoved,
    imageAttrs,
    sourceAttrs,
    getAttribute(name: string) {
      return imageAttrs.get(name) ?? null;
    },
    setAttribute(name: string, value: string) {
      imageAttrs.set(name, value);
    },
    removeAttribute(name: string) {
      removed.push(name);
      imageAttrs.delete(name);
    },
    closest(selector: string) {
      assert.equal(selector, 'picture');
      return { querySelectorAll: () => [source] };
    },
  } as unknown as HTMLImageElement;
}

test('clears responsive attributes before applying a target image URL', () => {
  const image = fakeImage();
  const result = applyImageUrl(image, 'https://example.test/new.jpg');
  assert.deepEqual((image as unknown as { removed: string[] }).removed, ['srcset', 'sizes']);
  assert.deepEqual((image as unknown as { sourceRemoved: string[] }).sourceRemoved, ['srcset', 'sizes']);
  assert.equal(image.src, 'https://example.test/new.jpg');
  assert.equal(result.status, 'applied');
});

test('restores responsive image attributes after a failed target image URL', () => {
  const image = fakeImage();
  const snapshot = captureImageNavigationSnapshot(image);

  applyImageUrl(image, 'https://example.test/missing.jpg');
  restoreImageNavigationSnapshot(snapshot);

  assert.equal(image.src, 'https://example.test/old.jpg');
  assert.equal(image.getAttribute('src'), 'old.jpg');
  assert.equal(image.getAttribute('srcset'), 'old-1x.jpg 1x, old-2x.jpg 2x');
  assert.equal(image.getAttribute('sizes'), '100vw');
  assert.equal((image as unknown as { sourceAttrs: Map<string, string> }).sourceAttrs.get('srcset'), 'source-old.webp 1x');
  assert.equal((image as unknown as { sourceAttrs: Map<string, string> }).sourceAttrs.get('sizes'), '80vw');
});

test('restores relative src as the original absolute URL after base URL changes', () => {
  const image = fakeImage();
  const doc = (image as unknown as { ownerDocument: { baseURI: string } }).ownerDocument;
  doc.baseURI = 'https://example.test/gallery/page.html';
  image.src = 'https://example.test/gallery/assets/asset-one.svg';
  image.setAttribute('src', './assets/asset-one.svg');
  const snapshot = captureImageNavigationSnapshot(image);

  doc.baseURI = 'https://example.test/gallery/assets/asset-two.svg';
  applyImageUrl(image, 'https://example.test/gallery/assets/asset-two.svg');
  restoreImageNavigationSnapshot(snapshot);

  assert.equal(image.src, 'https://example.test/gallery/assets/asset-one.svg');
  assert.equal(image.getAttribute('src'), 'https://example.test/gallery/assets/asset-one.svg');
});

test('pushes visible URL only for same-origin updates', () => {
  const pushed: string[] = [];
  const location = { href: 'https://example.test/current', origin: 'https://example.test' } as Location;
  const history = {
    pushState(_state: unknown, _title: string, url?: string | URL | null) {
      pushed.push(String(url));
    },
  } as History;

  assert.equal(pushVisibleUrlWhenSameOrigin('https://example.test/next.jpg', location, history), true);
  assert.equal(pushVisibleUrlWhenSameOrigin('https://other.test/next.jpg', location, history), false);
  assert.deepEqual(pushed, ['https://example.test/next.jpg']);
});

test('imageResourceUrlsEqual compares normalized image URLs without matching missing values', () => {
  assert.equal(imageResourceUrlsEqual('/image.jpg', 'https://example.test/image.jpg', 'https://example.test/page'), true);
  assert.equal(imageResourceUrlsEqual('https://example.test/image.jpg', 'https://example.test/image.jpg'), true);
  assert.equal(imageResourceUrlsEqual('https://example.test/image.jpg', 'https://example.test/other.jpg'), false);
  assert.equal(imageResourceUrlsEqual(null, 'https://example.test/image.jpg'), false);
  assert.equal(imageResourceUrlsEqual('https://example.test/image.jpg', undefined), false);
});
