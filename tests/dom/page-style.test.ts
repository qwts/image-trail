import test from 'node:test';
import assert from 'node:assert/strict';

import { markSelectedTarget, restoreElementStyles } from '../../extension/src/content/page-style.js';

function freshImage(): HTMLImageElement {
  const image = document.createElement('img');
  document.body.append(image);
  return image;
}

test('darkening the selected image neutralizes its transition so the backdrop never animates/flashes (#456)', () => {
  // Reproduces Chrome's standalone image viewer, which puts a light-grey background + a 300ms
  // background-color transition on the <img>. Flipping it to black must not animate grey->black
  // (visible in fit/letterboxed mode; hidden in fill/cover).
  const image = freshImage();
  image.style.transition = 'background-color 300ms';
  image.style.backgroundColor = 'rgb(230, 230, 230)';

  markSelectedTarget(image, { lockBox: true });
  // The backdrop is black AND the transition is disabled, so the change is instant (no grey->black fade).
  assert.equal(image.style.backgroundColor, '#000');
  assert.equal(image.style.transition, 'none');

  restoreElementStyles(image);
  // On release the element is restored verbatim — including its original transition, put back last
  // (after the background) so re-enabling it cannot flash either.
  assert.equal(image.style.backgroundColor, 'rgb(230, 230, 230)');
  assert.equal(image.style.transition, 'background-color 300ms');

  image.remove();
});
