import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../../extension/src/core/types.js';
import { createVisiblePinsSettingsView } from '../../extension/src/ui/components/display-settings-view.js';

test('visible pins dispatches one valid update and ignores invalid input', () => {
  const actions: PanelAction[] = [];
  const view = createVisiblePinsSettingsView(30, (action) => actions.push(action));
  const form = view.querySelector('form');
  const input = view.querySelector('input');
  assert.ok(form);
  assert.ok(input);
  assert.equal(input.value, '30');
  assert.equal(input.min, '1');

  input.value = '12';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.deepEqual(actions, [{ name: 'settings/update-visible-bookmark-soft-max', value: 12 }]);

  input.value = '12.5';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(actions.length, 1);
});
