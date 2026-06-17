import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetImageInfo, findQualifyingImages, getImageUrl, isQualifyingImage } from '../extension/src/content/target-image.js';

interface FakeImageOptions {
  currentSrc?: string;
  srcAttribute?: string | null;
  src?: string;
  dataSrc?: string | null;
  dataOriginal?: string | null;
  connected?: boolean;
  rectWidth?: number;
  rectHeight?: number;
  naturalWidth?: number;
  naturalHeight?: number;
  display?: string;
  visibility?: string;
  opacity?: string;
}

function fakeImage(options: FakeImageOptions): HTMLImageElement {
  return {
    currentSrc: options.currentSrc ?? '',
    src: options.src ?? '',
    naturalWidth: options.naturalWidth ?? 100,
    naturalHeight: options.naturalHeight ?? 100,
    isConnected: options.connected ?? true,
    getAttribute(name: string): string | null {
      if (name === 'src') return options.srcAttribute ?? null;
      if (name === 'data-src') return options.dataSrc ?? null;
      if (name === 'data-original') return options.dataOriginal ?? null;
      return null;
    },
    closest(): Element | null {
      return null;
    },
    getBoundingClientRect() {
      return { width: options.rectWidth ?? 100, height: options.rectHeight ?? 100 } as DOMRect;
    },
    __style: {
      display: options.display ?? 'block',
      visibility: options.visibility ?? 'visible',
      opacity: options.opacity ?? '1',
    },
  } as unknown as HTMLImageElement;
}

globalThis.window = {
  getComputedStyle(element: Element) {
    return (element as unknown as { __style: CSSStyleDeclaration }).__style;
  },
} as Window & typeof globalThis;

test('uses bookmarklet-compatible URL precedence for target images', () => {
  assert.deepEqual(
    getImageUrl(fakeImage({ currentSrc: 'https://example.test/current.jpg', srcAttribute: 'https://example.test/attr.jpg' })),
    {
      source: 'currentSrc',
      url: 'https://example.test/current.jpg',
    },
  );
  assert.deepEqual(getImageUrl(fakeImage({ srcAttribute: 'https://example.test/attr.jpg', src: 'https://example.test/property.jpg' })), {
    source: 'srcAttribute',
    url: 'https://example.test/attr.jpg',
  });
  assert.deepEqual(
    getImageUrl(fakeImage({ dataSrc: 'https://example.test/data.jpg', dataOriginal: 'https://example.test/original.jpg' })),
    {
      source: 'data-src',
      url: 'https://example.test/data.jpg',
    },
  );
});

test('qualifies only connected visible images with usable dimensions and URLs', () => {
  assert.equal(isQualifyingImage(fakeImage({ srcAttribute: 'https://example.test/image.jpg' })), true);
  assert.equal(isQualifyingImage(fakeImage({ srcAttribute: 'https://example.test/image.jpg', connected: false })), false);
  assert.equal(isQualifyingImage(fakeImage({ srcAttribute: 'https://example.test/image.jpg', naturalWidth: 20 })), false);
  assert.equal(isQualifyingImage(fakeImage({ srcAttribute: 'https://example.test/image.jpg', display: 'none' })), false);
  assert.equal(isQualifyingImage(fakeImage({})), false);
});

test('creates serializable target info and filters qualifying roots', () => {
  const first = fakeImage({ srcAttribute: 'https://example.test/one.jpg', naturalWidth: 640, naturalHeight: 480 });
  const second = fakeImage({ srcAttribute: 'https://example.test/two.jpg', display: 'none' });
  const root = {
    querySelectorAll(selector: string) {
      assert.equal(selector, 'img');
      return [first, second];
    },
  } as unknown as ParentNode;

  assert.equal(findQualifyingImages(root).length, 1);
  assert.deepEqual(createTargetImageInfo(first), {
    handleId: 'image-trail-target-1',
    url: 'https://example.test/one.jpg',
    width: 640,
    height: 480,
    source: 'srcAttribute',
  });
});
