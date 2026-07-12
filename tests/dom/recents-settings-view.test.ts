import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../../extension/src/core/types.js';
import { createRecentsSettingsView } from '../../extension/src/ui/components/recents-settings-view.js';

test('recents settings dispatches retention, reveal, and sparse layout actions', () => {
  const actions: PanelAction[] = [];
  const view = createRecentsSettingsView(
    { limit: 2, retainedLimit: 3, overflowBehavior: 'keep-session', sparseRowDisplayMode: 'adaptive' },
    (action) => actions.push(action),
  );
  const inputs = view.querySelectorAll<HTMLInputElement>('input[type="number"]');
  const selects = Array.from(view.querySelectorAll<HTMLSelectElement>('select'));
  inputs[0]!.value = '4';
  inputs[1]!.value = '7';
  const overflow = selects.find((select) => Array.from(select.options).some((option) => option.value === 'drop-oldest'));
  assert.ok(overflow);
  overflow.value = 'drop-oldest';
  view.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.deepEqual(actions.at(-1), {
    name: 'settings/update-recent-history-retention',
    limit: 4,
    retainedLimit: 7,
    overflowBehavior: 'drop-oldest',
  });
  view.querySelector<HTMLButtonElement>('button[type="button"]')!.click();
  assert.deepEqual(actions.at(-1), {
    name: 'settings/update-recent-history-retention',
    limit: 3,
    retainedLimit: 3,
    overflowBehavior: 'keep-session',
  });
  const sparse = selects.find((select) => Array.from(select.options).some((option) => option.value === 'adaptive'));
  assert.ok(sparse);
  sparse.value = 'compact';
  sparse.dispatchEvent(new Event('change'));
  assert.deepEqual(actions.at(-1), { name: 'settings/update-recent-sparse-row-display-mode', mode: 'compact' });
});
