import test from 'node:test';
import assert from 'node:assert/strict';
import {
  markGrabPreviewTarget,
  markSelectedTarget,
  restoreElementStyles,
  restoreGrabPreviewTarget,
} from '../extension/src/content/page-style.js';

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
      boxShadow: '',
      width: '144px',
      backgroundColor: '',
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
  assert.equal(element.style.backgroundColor, '');
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
  assert.equal(element.style.backgroundColor, '');
});

test('grab preview marks valid and invalid targets and restores preview-only styles', () => {
  const element = createImageElement();
  element.style.cursor = 'pointer';
  element.style.outline = '1px solid blue';
  element.style.outlineOffset = '1px';
  element.style.boxShadow = 'none';

  markGrabPreviewTarget(element, 'valid');

  assert.equal(element.dataset.imageTrailGrabPreview, 'valid');
  assert.equal(element.style.cursor, 'copy');
  assert.match(element.style.outline, /#38bdf8/u);

  markGrabPreviewTarget(element, 'invalid');

  assert.equal(element.dataset.imageTrailGrabPreview, 'invalid');
  assert.equal(element.style.cursor, 'not-allowed');
  assert.match(element.style.outline, /#ef4444/u);

  restoreGrabPreviewTarget(element);

  assert.equal(element.dataset.imageTrailGrabPreview, undefined);
  assert.equal(element.style.cursor, 'pointer');
  assert.equal(element.style.outline, '1px solid blue');
  assert.equal(element.style.outlineOffset, '1px');
  assert.equal(element.style.boxShadow, 'none');
});

test('grab preview restores selected target styling without clearing selection state', () => {
  const element = createImageElement();

  markSelectedTarget(element);
  const selectedOutline = element.style.outline;

  markGrabPreviewTarget(element, 'valid');
  restoreGrabPreviewTarget(element);

  assert.equal(element.dataset.imageTrailSelected, 'true');
  assert.equal(element.dataset.imageTrailGrabPreview, undefined);
  assert.equal(element.style.outline, selectedOutline);
});
