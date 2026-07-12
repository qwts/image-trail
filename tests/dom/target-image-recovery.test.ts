import test from 'node:test';
import assert from 'node:assert/strict';
import { createTargetImageLocator, recoverTargetImage } from '../../extension/src/content/target-image.js';

function addImage(parent: Element, options: { readonly id?: string; readonly src?: string } = {}): HTMLImageElement {
  const image = document.createElement('img');
  image.id = options.id ?? '';
  image.src = options.src ?? 'https://example.test/original.jpg';
  Object.defineProperties(image, {
    naturalWidth: { configurable: true, value: 640 },
    naturalHeight: { configurable: true, value: 480 },
  });
  parent.append(image);
  return image;
}

test.beforeEach(() => {
  document.body.replaceChildren();
});

test('recovers a unique id locator only when the original URL still matches', () => {
  const original = addImage(document.body, { id: 'hero:image' });
  const locator = createTargetImageLocator(original);
  assert.deepEqual(locator, { selector: '#hero\\:image', originalUrl: 'https://example.test/original.jpg' });

  original.remove();
  const replacement = addImage(document.body, { id: 'hero:image' });
  assert.equal(recoverTargetImage(locator!), replacement);

  replacement.src = 'https://example.test/different.jpg';
  assert.equal(recoverTargetImage(locator!), null);
});

test('uses a bounded structural path and rejects ambiguous matches', () => {
  const firstGallery = document.createElement('section');
  const secondGallery = document.createElement('section');
  document.body.append(firstGallery, secondGallery);
  addImage(firstGallery);
  const selected = addImage(secondGallery);
  const locator = createTargetImageLocator(selected);

  assert.ok(locator?.selector.includes(':nth-of-type(2)'));
  const replacement = selected.cloneNode(true) as HTMLImageElement;
  selected.replaceWith(replacement);
  assert.equal(recoverTargetImage(locator!), replacement);

  assert.equal(recoverTargetImage({ selector: 'img', originalUrl: 'https://example.test/original.jpg' }), null);
});

test('rejects a unique selector that resolves to a non-image element', () => {
  const original = addImage(document.body, { id: 'hero' });
  const locator = createTargetImageLocator(original);
  original.outerHTML = '<div id="hero"></div>';
  assert.equal(recoverTargetImage(locator!), null);
});
