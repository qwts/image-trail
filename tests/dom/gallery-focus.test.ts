import test from 'node:test';
import assert from 'node:assert/strict';

import { captureFocusedGalleryControl, restoreFocusedGalleryControl } from '../../extension/src/gallery/gallery-focus.js';

test('Gallery input focus and selection survive a root render', () => {
  const container = document.createElement('main');
  const search = document.createElement('input');
  search.setAttribute('aria-label', 'Search gallery');
  search.value = 'coast';
  container.append(search);
  document.body.append(container);
  search.focus();
  search.setSelectionRange(1, 4, 'forward');

  const captured = captureFocusedGalleryControl(container);
  assert.ok(captured);
  const replacement = search.cloneNode(true) as HTMLInputElement;
  container.replaceChildren(replacement);
  restoreFocusedGalleryControl(container, captured);

  assert.equal(document.activeElement, replacement);
  assert.equal(replacement.selectionStart, 1);
  assert.equal(replacement.selectionEnd, 4);
  container.remove();
});

test('Gallery focus restoration ignores controls that disappear or become disabled', () => {
  const container = document.createElement('main');
  const input = document.createElement('input');
  input.setAttribute('aria-label', 'Page limit');
  container.append(input);
  document.body.append(container);
  input.focus();
  const captured = captureFocusedGalleryControl(container);
  assert.ok(captured);

  const disabledReplacement = input.cloneNode(true) as HTMLInputElement;
  disabledReplacement.disabled = true;
  container.replaceChildren(disabledReplacement);
  restoreFocusedGalleryControl(container, captured);

  assert.notEqual(document.activeElement, disabledReplacement);
  container.remove();
});

test('Gallery select focus survives a filter render', () => {
  const container = document.createElement('main');
  const filter = document.createElement('select');
  filter.setAttribute('aria-label', 'Filter by image type');
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All image types';
  const png = document.createElement('option');
  png.value = 'PNG';
  png.textContent = 'PNG';
  filter.append(all, png);
  filter.value = 'PNG';
  container.append(filter);
  document.body.append(container);
  filter.focus();

  const captured = captureFocusedGalleryControl(container);
  assert.ok(captured);
  const replacement = filter.cloneNode(true) as HTMLSelectElement;
  replacement.value = 'PNG';
  container.replaceChildren(replacement);
  restoreFocusedGalleryControl(container, captured);

  assert.equal(document.activeElement, replacement);
  assert.equal(replacement.value, 'PNG');
  container.remove();
});
