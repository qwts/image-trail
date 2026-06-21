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

function createStyledElement(background: string, backgroundColor: string): HTMLElement {
  return {
    style: {
      background,
      backgroundColor,
    } as CSSStyleDeclaration,
  } as HTMLElement;
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

test('selected target lockBox makes the page backdrop black and restores it', () => {
  const originalDocument = globalThis.document;
  const body = createStyledElement('white', 'white');
  const documentElement = createStyledElement('lightgray', 'lightgray');
  globalThis.document = { body, documentElement } as Document;
  const element = createImageElement();

  try {
    markSelectedTarget(element, { lockBox: true });

    assert.equal(body.style.background, '#000');
    assert.equal(body.style.backgroundColor, '#000');
    assert.equal(documentElement.style.background, '#000');
    assert.equal(documentElement.style.backgroundColor, '#000');

    restoreElementStyles(element);

    assert.equal(body.style.background, 'white');
    assert.equal(body.style.backgroundColor, 'white');
    assert.equal(documentElement.style.background, 'lightgray');
    assert.equal(documentElement.style.backgroundColor, 'lightgray');
  } finally {
    globalThis.document = originalDocument;
  }
});

test('selected target without lockBox leaves inline sizing alone', () => {
  const element = createImageElement();

  markSelectedTarget(element);

  assert.equal(element.style.height, '72px');
  assert.equal(element.style.objectFit, 'cover');
  assert.equal(element.style.width, '144px');
});
