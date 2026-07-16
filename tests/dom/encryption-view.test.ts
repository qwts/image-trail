import assert from 'node:assert/strict';
import test from 'node:test';

import type { PanelAction } from '../../extension/src/core/types.js';
import { createEncryptionView } from '../../extension/src/ui/components/encryption-view.js';

type EncryptionAction = Extract<
  PanelAction,
  { readonly name: `blob-key/${string}` | 'capture/cleanup-orphans' | 'settings/update-blob-key-inactivity-timeout' }
>;

function render(unlocked = true): { readonly actions: EncryptionAction[]; readonly view: HTMLElement } {
  document.body.replaceChildren();
  const actions: EncryptionAction[] = [];
  const view = createEncryptionView(
    {
      unlocked,
      keyReference: unlocked ? 'blob:test' : null,
      hasKey: true,
      busy: false,
      abandonedOriginalCount: 0,
      inactivityTimeoutMinutes: 10,
    },
    (action) => actions.push(action),
  );
  document.body.append(view);
  return { actions, view };
}

test('encrypted-original settings dispatch inactivity policy changes', () => {
  const { actions, view } = render();
  const select = view.querySelector<HTMLSelectElement>('select');
  assert.ok(select);
  assert.equal(select.value, '10');
  select.value = '15';
  select.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'settings/update-blob-key-inactivity-timeout', value: 15 }]);
});

test('manual lock is distinct from destructive key removal', () => {
  const { actions, view } = render();
  const buttons = [...view.querySelectorAll('button')];
  buttons.find((button) => button.textContent === 'Lock now')?.click();
  assert.deepEqual(actions, [{ name: 'blob-key/lock' }]);
  assert.ok(buttons.some((button) => button.textContent === 'Clear key'));
});
