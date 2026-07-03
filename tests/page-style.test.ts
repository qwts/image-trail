import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keepSelectedTargetBackdropBlack,
  markGrabPreviewTarget,
  markSelectedTarget,
  restoreElementStyles,
  restoreGrabPreviewTarget,
} from '../extension/src/content/page-style.js';

function createImageElement(): HTMLElement {
  const style = {
    background: '',
    backgroundColor: '',
    boxShadow: '',
    cursor: '',
    height: '72px',
    left: '4px',
    maxHeight: '90vh',
    maxWidth: '90vw',
    objectFit: 'cover',
    opacity: '0.5',
    outline: '',
    outlineOffset: '',
    position: 'absolute',
    top: '8px',
    width: '144px',
    setProperty(name: string, value: string): void {
      this[toCamelCase(name) as keyof typeof this] = value as never;
    },
  };
  return {
    dataset: {},
    style: style as CSSStyleDeclaration,
  } as unknown as HTMLElement;
}

function toCamelCase(name: string): string {
  return name.replace(/-([a-z])/gu, (_, letter: string) => letter.toUpperCase());
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
  assert.equal(element.style.position, 'fixed');
  assert.equal(element.style.top, '0');
  assert.equal(element.style.left, '0');
  assert.equal(element.style.maxHeight, 'none');
  assert.equal(element.style.maxWidth, 'none');
  assert.equal(element.style.width, '100%');
  assert.equal(element.dataset.imageTrailSelected, 'true');

  restoreElementStyles(element);

  assert.equal(element.style.height, '72px');
  assert.equal(element.style.objectFit, 'cover');
  assert.equal(element.style.position, 'absolute');
  assert.equal(element.style.top, '8px');
  assert.equal(element.style.left, '4px');
  assert.equal(element.style.maxHeight, '90vh');
  assert.equal(element.style.maxWidth, '90vw');
  assert.equal(element.style.width, '144px');
  assert.equal(element.style.background, '');
  assert.equal(element.style.backgroundColor, '');
  assert.equal(element.dataset.imageTrailSelected, undefined);
});

test('selected target backdrop can be forced black before navigation changes', () => {
  const element = createImageElement();
  element.style.background = 'rgb(230, 230, 230)';
  element.style.backgroundColor = 'rgb(230, 230, 230)';

  keepSelectedTargetBackdropBlack(element);

  assert.equal(element.style.background, '#000');
  assert.equal(element.style.backgroundColor, '#000');
});

test('selected target restore can preserve black hosted-image backdrop', () => {
  const element = createImageElement();
  element.style.background = 'rgb(230, 230, 230)';
  element.style.backgroundColor = 'rgb(230, 230, 230)';

  markSelectedTarget(element);
  restoreElementStyles(element, { preserveBackdropBlack: true });

  assert.equal(element.dataset.imageTrailSelected, undefined);
  assert.equal(element.style.position, 'absolute');
  assert.equal(element.style.background, '#000');
  assert.equal(element.style.backgroundColor, '#000');
});

test('selected target first style change paints black and restores the original backdrop', () => {
  const element = createImageElement();
  element.style.background = 'rgb(230, 230, 230)';
  element.style.backgroundColor = 'rgb(230, 230, 230)';

  markSelectedTarget(element);

  assert.equal(element.style.background, '#000');
  assert.equal(element.style.backgroundColor, '#000');

  restoreElementStyles(element);

  assert.equal(element.style.background, 'rgb(230, 230, 230)');
  assert.equal(element.style.backgroundColor, 'rgb(230, 230, 230)');
});

test('selected target lockBox accepts explicit preview object fit and restores it', () => {
  const element = createImageElement();

  markSelectedTarget(element, { lockBox: true, objectFit: 'cover' });

  assert.equal(element.style.objectFit, 'cover');

  markSelectedTarget(element, { lockBox: true, objectFit: 'scale-down' });

  assert.equal(element.style.objectFit, 'scale-down');

  restoreElementStyles(element);

  assert.equal(element.style.objectFit, 'cover');
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

test('selected target without lockBox leaves inline sizing alone and defaults image fit to cover', () => {
  const element = createImageElement();
  element.style.objectFit = 'contain';

  markSelectedTarget(element);

  assert.equal(element.style.height, '72px');
  assert.equal(element.style.objectFit, 'cover');
  assert.equal(element.style.width, '144px');
  assert.equal(element.style.background, '#000');
  assert.equal(element.style.backgroundColor, '#000');

  restoreElementStyles(element);

  assert.equal(element.style.background, '');
  assert.equal(element.style.backgroundColor, '');
  assert.equal(element.style.objectFit, 'contain');
});

test('selected target can defer lockBox styling until preview replaces the image', () => {
  const originalDocument = globalThis.document;
  const body = createStyledElement('white', 'white');
  const documentElement = createStyledElement('lightgray', 'lightgray');
  globalThis.document = { body, documentElement } as Document;
  const element = createImageElement();

  try {
    markSelectedTarget(element);

    assert.equal(element.style.height, '72px');
    assert.equal(element.style.objectFit, 'cover');
    assert.equal(element.style.width, '144px');
    assert.equal(element.style.background, '#000');
    assert.equal(element.style.backgroundColor, '#000');
    assert.equal(body.style.background, 'white');

    markSelectedTarget(element, { lockBox: true });

    assert.equal(element.style.height, '100%');
    assert.equal(element.style.objectFit, 'contain');
    assert.equal(element.style.width, '100%');
    assert.equal(body.style.background, '#000');

    markSelectedTarget(element);

    assert.equal(element.style.height, '72px');
    assert.equal(element.style.objectFit, 'cover');
    assert.equal(element.style.width, '144px');
    assert.equal(element.style.background, '#000');
    assert.equal(element.style.backgroundColor, '#000');
    assert.equal(body.style.background, 'white');
    assert.equal(documentElement.style.background, 'lightgray');
    assert.equal(element.dataset.imageTrailSelected, 'true');
    assert.equal(element.dataset.imageTrailLockBox, undefined);

    restoreElementStyles(element);

    assert.equal(element.style.height, '72px');
    assert.equal(element.style.objectFit, 'cover');
    assert.equal(element.style.width, '144px');
    assert.equal(element.style.background, '');
    assert.equal(element.style.backgroundColor, '');
    assert.equal(body.style.background, 'white');
    assert.equal(documentElement.style.background, 'lightgray');
  } finally {
    globalThis.document = originalDocument;
  }
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
