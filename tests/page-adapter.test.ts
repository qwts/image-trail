import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isEventFromImageTrailPanel,
  PageAdapter,
  summarizeTargetUrlForMessage,
  type TargetSelectionSnapshot,
} from '../extension/src/content/page-adapter.js';

test('target auto-select messages do not expose data URLs', () => {
  const dataUrl = `data:image/png;base64,${'a'.repeat(20_000)}`;

  assert.equal(summarizeTargetUrlForMessage(dataUrl), 'data URL');
});

test('target auto-select messages constrain long URLs', () => {
  const url = `https://example.test/image.jpg?payload=${'a'.repeat(20_000)}`;
  const summary = summarizeTargetUrlForMessage(url);

  assert.ok(summary.length <= 180);
  assert.ok(summary.endsWith('…'));
  assert.ok(summary.startsWith('https://example.test/image.jpg?payload='));
});

test('grab panel guard detects shadow DOM events retargeted to the panel host', () => {
  const button = { tagName: 'BUTTON' };
  const host = { id: 'image-trail-panel-root', tagName: 'DIV' };

  assert.equal(
    isEventFromImageTrailPanel({
      target: host,
      composedPath: () => [button, host],
    } as unknown as Event),
    true,
  );
});

test('grab panel guard detects light DOM descendants and ignores page targets', () => {
  const panelChild = {
    closest: (selector: string) => (selector === '#image-trail-panel-root' ? { id: 'image-trail-panel-root' } : null),
  };
  const pageTarget = {
    closest: () => null,
  };

  assert.equal(isEventFromImageTrailPanel({ target: panelChild } as unknown as Event), true);
  assert.equal(isEventFromImageTrailPanel({ target: pageTarget } as unknown as Event), false);
});

class FakeImageElement extends EventTarget {
  complete = true;
  currentSrc = 'https://example.test/original.jpg';
  dataset: Record<string, string | undefined> = {};
  isConnected = true;
  naturalHeight = 480;
  naturalWidth = 640;
  src = 'https://example.test/original.jpg';
  readonly attrs = new Map<string, string>([['src', 'https://example.test/original.jpg']]);
  readonly removedAttrs: string[] = [];
  readonly style = {
    background: '',
    backgroundColor: '',
    boxShadow: '',
    cursor: '',
    height: '',
    left: '',
    maxHeight: '',
    maxWidth: '',
    objectFit: '',
    opacity: '',
    outline: '',
    outlineOffset: '',
    position: '',
    top: '',
    width: '',
    setProperty: (name: string, value: string): void => {
      this.style[toCamelCase(name) as 'height' | 'width'] = value;
    },
  } as CSSStyleDeclaration;

  closest(selector: string): null {
    if (selector === '#image-trail-panel-root' || selector === 'a[href]' || selector === 'picture') return null;
    throw new Error(`Unexpected closest selector: ${selector}`);
  }

  getAttribute(name: string): string | null {
    return this.attrs.get(name) ?? null;
  }

  getBoundingClientRect(): DOMRect {
    return { height: 480, width: 640 } as DOMRect;
  }

  removeAttribute(name: string): void {
    this.removedAttrs.push(name);
    this.attrs.delete(name);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }
}

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
}

function installFakeDom(image: FakeImageElement): () => void {
  const originalDocument = globalThis.document;
  const originalHtmlImageElement = globalThis.HTMLImageElement;
  const originalWindow = globalThis.window;

  class TestHtmlImageElement extends FakeImageElement {}
  Object.setPrototypeOf(image, TestHtmlImageElement.prototype);
  globalThis.HTMLImageElement = TestHtmlImageElement as unknown as typeof HTMLImageElement;
  globalThis.document = {
    baseURI: 'https://example.test/page',
    body: { style: createPageStyle() },
    documentElement: { style: createPageStyle() },
    createElement() {
      return { getContext: () => null };
    },
    querySelectorAll(selector: string) {
      assert.equal(selector, 'img');
      return [image];
    },
  } as unknown as Document;
  globalThis.window = {
    getComputedStyle: () => ({ display: 'block', visibility: 'visible' }),
  } as unknown as Window & typeof globalThis;

  return () => {
    globalThis.document = originalDocument;
    globalThis.HTMLImageElement = originalHtmlImageElement;
    globalThis.window = originalWindow;
  };
}

function createPageStyle(): CSSStyleDeclaration {
  return { background: '', backgroundColor: '' } as CSSStyleDeclaration;
}

test('selected image error emits failed projection snapshot', () => {
  const image = new FakeImageElement();
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();
  const snapshots: TargetSelectionSnapshot[] = [];

  try {
    adapter.subscribe((snapshot) => snapshots.push(snapshot));
    adapter.autoSelectSingleImage();

    image.complete = false;
    image.naturalHeight = 0;
    image.naturalWidth = 0;
    adapter.applyUrlToSelected('https://example.test/projected.jpg', 'data:image/jpeg;base64,broken');
    image.dispatchEvent(new Event('error'));

    assert.equal(snapshots.at(-1)?.message, 'Failed to load https://example.test/projected.jpg');
  } finally {
    restoreDom();
  }
});

test('selected image load ignores reverted host URL after projection', async () => {
  const image = new FakeImageElement();
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();
  const loadedUrls: string[] = [];
  const snapshots: TargetSelectionSnapshot[] = [];

  try {
    adapter.subscribe((snapshot) => snapshots.push(snapshot));
    adapter.autoSelectSingleImage();
    await Promise.resolve();
    adapter.subscribeToSuccessfulLoads((target) => loadedUrls.push(target.url));

    image.complete = false;
    image.naturalHeight = 0;
    image.naturalWidth = 0;
    adapter.applyUrlToSelected('https://example.test/projected.jpg', 'data:image/jpeg;base64,projected');

    image.complete = true;
    image.currentSrc = 'https://example.test/original.jpg';
    image.naturalHeight = 480;
    image.naturalWidth = 640;
    image.src = 'https://example.test/original.jpg';
    image.dispatchEvent(new Event('load'));
    await Promise.resolve();

    assert.deepEqual(loadedUrls, []);
    assert.equal(snapshots.at(-1)?.message, 'Applied https://example.test/projected.jpg');
  } finally {
    restoreDom();
  }
});

test('selected image load reports active URL when display data URL loads', async () => {
  const image = new FakeImageElement();
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();
  const loadedUrls: string[] = [];

  try {
    adapter.autoSelectSingleImage();
    await Promise.resolve();
    adapter.subscribeToSuccessfulLoads((target) => loadedUrls.push(target.url));

    image.complete = false;
    image.naturalHeight = 0;
    image.naturalWidth = 0;
    adapter.applyUrlToSelected('https://example.test/projected.jpg', 'data:image/jpeg;base64,projected');

    image.complete = true;
    image.currentSrc = 'https://example.test/original.jpg';
    image.naturalHeight = 480;
    image.naturalWidth = 640;
    image.dispatchEvent(new Event('load'));
    await Promise.resolve();

    assert.deepEqual(loadedUrls, ['https://example.test/projected.jpg']);
  } finally {
    restoreDom();
  }
});

test('selected image projection load reports projection ownership metadata', async () => {
  const image = new FakeImageElement();
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();
  const loaded: Array<{ readonly url: string; readonly projectionId?: string; readonly projectionReason?: string }> = [];

  try {
    adapter.autoSelectSingleImage();
    await Promise.resolve();
    adapter.subscribeToSuccessfulLoads((target) =>
      loaded.push({ url: target.url, projectionId: target.projectionId, projectionReason: target.projectionReason }),
    );

    image.complete = false;
    image.naturalHeight = 0;
    image.naturalWidth = 0;
    adapter.applyUrlToSelected('https://example.test/projected.jpg', 'data:image/jpeg;base64,projected', {
      projectionId: 'projection-1',
      projectionReason: 'record-preview',
    });

    image.complete = true;
    image.naturalHeight = 480;
    image.naturalWidth = 640;
    image.dispatchEvent(new Event('load'));
    await Promise.resolve();

    assert.deepEqual(loaded, [
      {
        url: 'https://example.test/projected.jpg',
        projectionId: 'projection-1',
        projectionReason: 'record-preview',
      },
    ]);
  } finally {
    restoreDom();
  }
});

test('selected image load ignores stale projection completion after newer projection starts', async () => {
  const image = new FakeImageElement();
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();
  const loaded: Array<{ readonly url: string; readonly projectionId?: string }> = [];

  try {
    adapter.autoSelectSingleImage();
    await Promise.resolve();
    adapter.subscribeToSuccessfulLoads((target) => loaded.push({ url: target.url, projectionId: target.projectionId }));

    image.complete = true;
    image.naturalHeight = 480;
    image.naturalWidth = 640;
    adapter.applyUrlToSelected('https://example.test/first.jpg', 'data:image/jpeg;base64,first', {
      projectionId: 'projection-1',
      projectionReason: 'record-preview',
    });
    adapter.applyUrlToSelected('https://example.test/second.jpg', 'data:image/jpeg;base64,second', {
      projectionId: 'projection-2',
      projectionReason: 'record-preview',
    });
    await Promise.resolve();

    assert.deepEqual(loaded, [{ url: 'https://example.test/second.jpg', projectionId: 'projection-2' }]);
  } finally {
    restoreDom();
  }
});

test('release keeps hosted image backdrop black after restoring original URL', () => {
  const image = new FakeImageElement();
  image.style.background = 'rgb(230, 230, 230)';
  image.style.backgroundColor = 'rgb(230, 230, 230)';
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();

  try {
    adapter.autoSelectSingleImage();
    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');

    image.complete = false;
    image.naturalHeight = 0;
    image.naturalWidth = 0;
    adapter.applyUrlToSelected('https://example.test/projected.jpg');
    assert.equal(image.src, 'https://example.test/projected.jpg');
    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');

    adapter.releaseSelectedTarget();

    assert.equal(image.src, 'https://example.test/original.jpg');
    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');
    assert.equal(image.dataset.imageTrailSelected, undefined);

    image.complete = true;
    image.naturalHeight = 480;
    image.naturalWidth = 640;
    image.dispatchEvent(new Event('load'));

    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');
  } finally {
    restoreDom();
  }
});

test('closing and reopening keeps standalone hosted image backdrop black', () => {
  const image = new FakeImageElement();
  image.style.background = 'rgb(230, 230, 230)';
  image.style.backgroundColor = 'rgb(230, 230, 230)';
  const restoreDom = installFakeDom(image);
  const adapter = new PageAdapter();

  try {
    adapter.autoSelectSingleImage();
    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');

    adapter.suspend();

    assert.equal(image.dataset.imageTrailSelected, undefined);
    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');

    adapter.autoSelectSingleImage();

    assert.equal(image.dataset.imageTrailSelected, 'true');
    assert.equal(image.style.background, '#000');
    assert.equal(image.style.backgroundColor, '#000');
  } finally {
    restoreDom();
  }
});
