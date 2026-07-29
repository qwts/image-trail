import test from 'node:test';
import assert from 'node:assert/strict';

import { PageAdapter } from '../../extension/src/content/page-adapter.js';

function appendImage(id: number): { image: HTMLImageElement; rectReads: () => number } {
  const image = document.createElement('img');
  image.src = `https://images.example.test/${id}.jpg`;
  Object.defineProperties(image, {
    naturalHeight: { configurable: true, value: 240 },
    naturalWidth: { configurable: true, value: 320 },
  });
  let reads = 0;
  Object.defineProperty(image, 'getBoundingClientRect', {
    configurable: true,
    value: () => {
      reads += 1;
      return { height: 240, width: 320 } as DOMRect;
    },
  });
  document.body.append(image);
  return { image, rectReads: () => reads };
}

test.beforeEach(() => document.body.replaceChildren());

test('reuses Grab preview qualification while the pointer remains on the same target', () => {
  const first = appendImage(1);
  const second = appendImage(2);
  const adapter = new PageAdapter();
  adapter.enableBookmarkShortcut();
  adapter.startGrabMode();

  try {
    first.image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    first.image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    first.image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    assert.equal(first.rectReads(), 1);
    assert.equal(first.image.dataset['imageTrailGrabPreview'], 'valid');

    second.image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    assert.equal(second.rectReads(), 1);
    assert.equal(first.image.dataset['imageTrailGrabPreview'], undefined);

    first.image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    assert.equal(first.rectReads(), 2);

    first.image.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: null }));
    first.image.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }));
    assert.equal(first.rectReads(), 3);
  } finally {
    adapter.cleanup();
  }
});
