import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelAction } from '../../extension/src/core/types.js';
import { createMinimizedPanel, createPanelHeader, renderPanelToast } from '../../extension/src/ui/components/panel-shell-view.js';

test('panel header uses shared status and icon primitives with existing actions', () => {
  const actions: PanelAction[] = [];
  const header = createPanelHeader(createInitialPanelState(0), { dispatch: (action) => actions.push(action) });

  assert.ok(header.querySelector('.image-trail-ds__status-pill'));
  assert.equal(header.querySelectorAll('.image-trail-ds__icon-button').length, 4);
  header.querySelector<HTMLButtonElement>('[aria-label="Show settings"]')?.click();
  header.querySelector<HTMLButtonElement>('[aria-label="Minimize panel"]')?.click();
  assert.deepEqual(actions, [{ name: 'settings/toggle' }, { name: 'panel/minimize' }]);
});

test('privacy mode keeps private URLs out of header and toast text, titles, and accessibility copy', () => {
  const state = {
    ...createInitialPanelState(0),
    visible: true,
    status: 'error' as const,
    privacyModeEnabled: true,
    message: 'Could not load https://private.example.test/photo.jpg',
  };
  const header = createPanelHeader(state, { dispatch: () => {} });
  const toastRoot = document.createElement('div');
  renderPanelToast(toastRoot, state);

  assert.doesNotMatch(header.outerHTML, /private\.example|https?:/u);
  assert.ok(header.querySelector('.image-trail-panel__header-status.is-error'));
  assert.doesNotMatch(toastRoot.outerHTML, /private\.example|https?:/u);
  assert.match(toastRoot.textContent ?? '', /Image Trail needs attention/u);
});

test('minimized panel preserves the expand action and active Grab Mode state', () => {
  const actions: PanelAction[] = [];
  const initial = createInitialPanelState(0);
  const view = createMinimizedPanel({ ...initial, target: { ...initial.target, grabModeActive: true } }, (action) => actions.push(action));
  const button = view.querySelector<HTMLButtonElement>('button');
  assert.equal(button?.dataset['grabMode'], 'active');
  assert.match(button?.getAttribute('aria-label') ?? '', /Grab Mode is active/u);
  button?.click();
  assert.deepEqual(actions, [{ name: 'panel/expand' }]);
});
