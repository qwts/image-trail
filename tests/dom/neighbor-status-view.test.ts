import test from 'node:test';
import assert from 'node:assert/strict';

import { createNeighborStatusView, neighborStatusLabel } from '../../extension/src/ui/components/neighbor-status-view.js';
import type { BufferedNavigationStatusSnapshot } from '../../extension/src/ui/panel/buffered-navigation-status.js';

const visibleSnapshot: BufferedNavigationStatusSnapshot = {
  total: 8,
  warmed: 3,
  warming: 2,
  failed: 1,
  skipped: 1,
  unknown: 1,
  failuresVisible: true,
};

test('neighbor status renders compact URL-free outcome counts with failure precedence', () => {
  const view = createNeighborStatusView(visibleSnapshot);
  const pill = view.querySelector<HTMLElement>('.image-trail-panel__neighbor-status-pill');

  assert.equal(view.getAttribute('aria-label'), 'Parsed-field neighbor status');
  assert.equal(pill?.textContent, 'Neighbors: 3 warmed · 2 warming · 1 failed · 1 skipped · 1 unknown');
  assert.equal(pill?.dataset['tone'], 'error');
  assert.equal(pill?.getAttribute('aria-busy'), 'true');
  assert.doesNotMatch(view.innerHTML, /https?:|blob:|image=/u);
});

test('Mute omits failed and skipped counts without hiding safe warming state', () => {
  const muted = { ...visibleSnapshot, failuresVisible: false };
  const label = neighborStatusLabel(muted);
  const view = createNeighborStatusView(muted);

  assert.equal(label, 'Neighbors: 3 warmed · 2 warming · 1 unknown');
  assert.doesNotMatch(view.textContent ?? '', /failed|skipped/u);
  assert.equal(view.querySelector<HTMLElement>('.image-trail-panel__neighbor-status-pill')?.dataset['tone'], 'busy');
});

test('targeted updates retain the section node and clear stale waiting semantics', () => {
  const view = createNeighborStatusView(visibleSnapshot);
  const refreshed = createNeighborStatusView(
    {
      total: 8,
      warmed: 8,
      warming: 0,
      failed: 0,
      skipped: 0,
      unknown: 0,
      failuresVisible: true,
    },
    view,
  );

  assert.equal(refreshed, view);
  const pill = refreshed.querySelector<HTMLElement>('.image-trail-panel__neighbor-status-pill');
  assert.equal(pill?.textContent, 'Neighbors: 8 warmed');
  assert.equal(pill?.dataset['tone'], 'ready');
  assert.equal(pill?.hasAttribute('aria-busy'), false);
});
