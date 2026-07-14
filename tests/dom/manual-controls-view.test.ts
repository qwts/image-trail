import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelAction } from '../../extension/src/core/types.js';
import { createManualControlsView } from '../../extension/src/ui/components/manual-controls-view.js';

function createView(overrides: Partial<ReturnType<typeof createInitialPanelState>> = {}) {
  const initial = createInitialPanelState(0);
  const actions: PanelAction[] = [];
  const view = createManualControlsView({
    state: {
      ...initial,
      target: { ...initial.target, selectedUrl: 'https://images.example.test/photo.jpg' },
      ...overrides,
    },
    previousFieldId: 'field-previous',
    nextFieldId: 'field-next',
    dispatch: (action) => actions.push(action),
  });
  return { view, actions };
}

test('primary workflow exposes navigation, capture, slideshow, and Grab Mode without expanding details', () => {
  const { view, actions } = createView();
  const primary = view.querySelector('.image-trail-panel__primary-workflow');
  assert.ok(primary);
  assert.deepEqual(
    Array.from(primary.querySelectorAll('button')).map((button) => button.textContent),
    ['◀ Prev', 'Next ▶', '◉ Capture', '⏵ Slideshow', '⌖ Grab'],
  );

  primary.querySelector<HTMLButtonElement>('[aria-label="Capture original"]')?.click();
  primary.querySelector<HTMLButtonElement>('[aria-label="Start slideshow"]')?.click();
  primary.querySelector<HTMLButtonElement>('[aria-label="Grab Mode"]')?.click();
  assert.deepEqual(actions, [
    { name: 'capture/request', url: 'https://images.example.test/photo.jpg', sourceType: 'target' },
    { name: 'slideshow-start' },
    { name: 'grab-mode/start' },
  ]);
});

test('running workflow exposes pause and stop actions while keeping More controls state-owned', () => {
  const initial = createInitialPanelState(0);
  const { view, actions } = createView({
    secondaryControlsOpen: true,
    automation: { ...initial.automation, slideshowPhase: 'running', retryPhase: 'running' },
  });
  const details = view.querySelector<HTMLDetailsElement>('.image-trail-panel__secondary-controls-details');
  assert.ok(details?.open);
  view.querySelector<HTMLButtonElement>('[aria-label="Pause slideshow"]')?.click();
  view.querySelector<HTMLButtonElement>('.image-trail-panel__automation-actions [data-variant="danger"]')?.click();
  assert.deepEqual(actions, [{ name: 'slideshow-pause' }, { name: 'retry-stop' }]);
});
