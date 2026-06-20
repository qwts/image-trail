import test from 'node:test';
import assert from 'node:assert/strict';
import { markSelectedTarget, restoreElementStyles } from '../extension/src/content/page-style.js';

function createImageElement(): HTMLElement {
  return {
    dataset: {},
    style: {
      cursor: '',
      height: '72px',
      objectFit: 'cover',
      opacity: '0.5',
      outline: '',
      outlineOffset: '',
      width: '144px',
    } as CSSStyleDeclaration,
  } as unknown as HTMLElement;
}

test('selected target lockBox constrains the host image box and restores original inline sizing', () => {
  const element = createImageElement();

  markSelectedTarget(element, { lockBox: true });

  assert.equal(element.style.height, '100%');
  assert.equal(element.style.objectFit, 'contain');
  assert.equal(element.style.width, '100%');
  assert.equal(element.dataset.imageTrailSelected, 'true');

  restoreElementStyles(element);

  assert.equal(element.style.height, '72px');
  assert.equal(element.style.objectFit, 'cover');
  assert.equal(element.style.width, '144px');
  assert.equal(element.dataset.imageTrailSelected, undefined);
});

test('selected target without lockBox leaves inline sizing alone', () => {
  const element = createImageElement();

  markSelectedTarget(element);

  assert.equal(element.style.height, '72px');
  assert.equal(element.style.objectFit, 'cover');
  assert.equal(element.style.width, '144px');
});
