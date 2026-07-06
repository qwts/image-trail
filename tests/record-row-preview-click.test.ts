import test from 'node:test';
import assert from 'node:assert/strict';

import { registerPreviewRowClick, resetPreviewRowClickTracking } from '../extension/src/ui/components/record-row-preview-click.js';

// The pure double-click window semantics (#426): a second click previews only when it lands on the
// SAME row within the window. Explicit `now` values keep the tests deterministic.

test('a second click on the same row within the window is a double-click', () => {
  resetPreviewRowClickTracking();
  assert.equal(registerPreviewRowClick('history:a', 1_000), false);
  assert.equal(registerPreviewRowClick('history:a', 1_400), true);
});

test('a second click beyond the window is a fresh single click, not a double-click', () => {
  resetPreviewRowClickTracking();
  assert.equal(registerPreviewRowClick('history:a', 1_000), false);
  assert.equal(registerPreviewRowClick('history:a', 1_501), false);
  // The stale click still starts a new pair: a quick follow-up completes it.
  assert.equal(registerPreviewRowClick('history:a', 1_600), true);
});

test('a click on a different row never completes the first row’s pair', () => {
  resetPreviewRowClickTracking();
  assert.equal(registerPreviewRowClick('history:a', 1_000), false);
  assert.equal(registerPreviewRowClick('history:b', 1_100), false);
  assert.equal(registerPreviewRowClick('history:a', 1_200), false, 'the row-b click reset the pair');
});

test('a completed double-click resets the tracker so a third rapid click starts a fresh pair', () => {
  resetPreviewRowClickTracking();
  assert.equal(registerPreviewRowClick('bookmark:a', 1_000), false);
  assert.equal(registerPreviewRowClick('bookmark:a', 1_200), true);
  assert.equal(registerPreviewRowClick('bookmark:a', 1_300), false, 'third click begins a new pair');
  assert.equal(registerPreviewRowClick('bookmark:a', 1_400), true);
});
