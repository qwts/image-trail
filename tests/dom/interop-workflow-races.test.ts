import assert from 'node:assert/strict';
import test from 'node:test';

import { createInteropRuntimeResultMessage } from '../../extension/src/background/interop-runtime-messages.js';
import { openInteropWorkflow } from '../../extension/src/ui/components/interop-workflow-view.js';
import { blockedInteropWorkflow } from '../../extension/src/ui/interop/visible-workflow.js';

test('an immediate provider change and Connect dispatches and renders the newly selected provider', async (t) => {
  const actions: Array<{ readonly name: string; readonly provider?: string }> = [];
  let resolveSelection: ((value: unknown) => void) | undefined;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        id: 'test-extension',
        sendMessage: (message: { payload: { action: { name: string; provider?: string } } }) => {
          const action = message.payload.action;
          actions.push(action);
          if (action.name === 'status') {
            return Promise.resolve(
              createInteropRuntimeResultMessage({
                ok: true,
                snapshot: {
                  ...blockedInteropWorkflow('settings', 0),
                  provider: { id: 'pcloud', label: 'pCloud', state: 'disconnected', detail: 'Connect pCloud.' },
                  error: null,
                },
              }),
            );
          }
          if (action.name === 'select-provider') return new Promise((resolve) => (resolveSelection = resolve));
          return Promise.resolve(
            createInteropRuntimeResultMessage({
              ok: true,
              snapshot: {
                ...blockedInteropWorkflow('settings', 0),
                provider: {
                  id: 'icloud-drive',
                  label: 'Local — Overlook on this computer',
                  state: 'connected',
                  detail: 'Overlook is connected.',
                },
                error: null,
              },
            }),
          );
        },
      },
    },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'chrome'));

  openInteropWorkflow('settings', []);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const dialog = document.querySelector('[role="dialog"][aria-label="Transfer and Sync"]');
  assert.ok(dialog instanceof HTMLElement);
  const provider = dialog.querySelector('[aria-label="Transfer provider"]');
  assert.ok(provider instanceof HTMLSelectElement);
  provider.value = 'icloud-drive';
  provider.dispatchEvent(new Event('change'));
  const connect = Array.from(dialog.querySelectorAll('button')).find((control) => control.textContent === 'Connect cloud provider');
  assert.ok(connect instanceof HTMLButtonElement);
  connect.click();

  assert.match(dialog.textContent ?? '', /Checking Overlook on this computer/u);
  assert.equal(dialog.querySelector<HTMLSelectElement>('[aria-label="Transfer provider"]')?.value, 'icloud-drive');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(actions, [
    { name: 'status' },
    { name: 'select-provider', provider: 'icloud-drive' },
    { name: 'connect', provider: 'icloud-drive' },
  ]);
  assert.match(dialog.textContent ?? '', /connected/u);

  resolveSelection?.(
    createInteropRuntimeResultMessage({
      ok: true,
      snapshot: {
        ...blockedInteropWorkflow('settings', 0),
        provider: { id: 'icloud-drive', label: 'Local — Overlook on this computer', state: 'disconnected', detail: 'Stale.' },
      },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(dialog.textContent ?? '', /connected/u);
  Array.from(dialog.querySelectorAll('button'))
    .find((control) => control.textContent === 'Close')
    ?.click();
});
