import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTargetImageInfo,
  findQualifyingImages,
  getImageRejectionReason,
  getImageUrl,
  isQualifyingImage,
} from '../extension/src/content/target-image.js';

interface FakeImageOptions {
  currentSrc?: string;
  srcAttribute?: string | null;
  src?: string;
  dataSrc?: string | null;
  dataOriginal?: string | null;
  dataFullSrc?: string | null;
  dataImageUrl?: string | null;
  dataMediaUrl?: string | null;
  dataZoomSrc?: string | null;
  parentHref?: string | null;
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
      if (name === 'data-full-src') return options.dataFullSrc ?? null;
      if (name === 'data-image-url') return options.dataImageUrl ?? null;
      if (name === 'data-media-url') return options.dataMediaUrl ?? null;
      if (name === 'data-zoom-src') return options.dataZoomSrc ?? null;
      if (name === 'href') return options.parentHref ?? null;
      return null;
    },
    closest(selector: string): Element | null {
      if (selector === 'a[href]' && options.parentHref) return this as unknown as Element;
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

globalThis.document = {
  baseURI: 'https://example.test/page',
} as Document;

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

test('uses linked source URL when visible image is a Bing thumbnail', () => {
  const source = 'https://cdn.example.test/images/source.jpg';
  const thumbnail = 'https://thf.bing.com/th/id/OIP.ybpkfTltBcXM_pn_a8r2zAHaE3?cb=thfc1falcon2&pid=Api';
  const link = `https://www.bing.com/images/search?view=detailV2&mediaurl=${encodeURIComponent(source)}`;

  assert.deepEqual(getImageUrl(fakeImage({ currentSrc: thumbnail, parentHref: link })), {
    source: 'linkSource',
    url: source,
  });
});

test('uses richer image attributes before falling back to visible source', () => {
  assert.deepEqual(
    getImageUrl(
      fakeImage({
        currentSrc: 'https://pbs.twimg.com/media/example?format=jpg&name=small',
        dataFullSrc: 'https://pbs.twimg.com/media/example?format=jpg&name=orig',
      }),
    ),
    {
      source: 'data-full-src',
      url: 'https://pbs.twimg.com/media/example?format=jpg&name=orig',
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

test('explains why a target image cannot be bookmarked', () => {
  assert.equal(getImageRejectionReason(fakeImage({})), 'Image does not expose a usable source URL.');
  assert.equal(getImageRejectionReason(fakeImage({ srcAttribute: 'https://example.test/image.jpg', naturalWidth: 20 })), 'Image is too small (20x100).');
  assert.equal(getImageRejectionReason(fakeImage({ srcAttribute: 'https://example.test/image.jpg', display: 'none' })), 'Image is not displayed.');
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
