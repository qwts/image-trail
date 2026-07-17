import test from 'node:test';
import assert from 'node:assert/strict';

import { createInteropRuntimeResultMessage } from '../../extension/src/background/interop-runtime-messages.js';
import { createInteropWorkflowView, openInteropWorkflow } from '../../extension/src/ui/components/interop-workflow-view.js';
import { blockedInteropWorkflow } from '../../extension/src/ui/interop/visible-workflow.js';

test('renders exact review and progress counts without claiming unavailable work completed', () => {
  const view = createInteropWorkflowView(blockedInteropWorkflow('selection', 4), { onClose: () => undefined });
  assert.match(view.textContent ?? '', /0 \/ 4 processed · 0 acknowledged · 0 finalized/);
  assert.match(view.textContent ?? '', /Eligibility has not been checked/);
  const start = Array.from(view.querySelectorAll('button')).find((control) => control.textContent === 'Start move');
  assert.ok(start instanceof HTMLButtonElement);
  assert.equal(start.disabled, true);
});

test('locked workflow does not render protected review, provider, count, or conflict rows', () => {
  const view = createInteropWorkflowView(blockedInteropWorkflow('captured-original', 9, true), { onClose: () => undefined });
  assert.equal(view.classList.contains('image-trail-interop--locked'), true);
  assert.equal(view.querySelector('.image-trail-interop__review'), null);
  assert.equal(view.querySelector('.image-trail-interop__provider'), null);
  assert.equal(view.querySelector('.image-trail-interop__setup'), null);
  assert.doesNotMatch(view.textContent ?? '', /9|captured original|No interop provider/);
});

test('provider setup dispatches the selected isolated provider and connect action', () => {
  const calls: string[] = [];
  const state = {
    ...blockedInteropWorkflow('settings', 0),
    provider: {
      id: 'google-drive' as const,
      label: 'Google Drive',
      state: 'disconnected' as const,
      detail: 'Connect the isolated provider.',
    },
  };
  const view = createInteropWorkflowView(state, {
    onClose: () => undefined,
    onProviderChange: (provider) => calls.push(`provider:${provider}`),
    onConnect: () => calls.push('connect'),
  });
  const provider = view.querySelector('[aria-label="Transfer provider"]');
  assert.ok(provider instanceof HTMLSelectElement);
  provider.value = 'icloud-drive';
  provider.dispatchEvent(new Event('change'));
  const connect = Array.from(view.querySelectorAll('button')).find((control) => control.textContent === 'Connect provider');
  assert.ok(connect instanceof HTMLButtonElement);
  connect.click();
  assert.deepEqual(calls, ['provider:icloud-drive', 'connect']);
});

test('conflict choice carries explicit apply-to-all intent', () => {
  const calls: unknown[] = [];
  const state = {
    ...blockedInteropWorkflow('selection', 1),
    provider: { id: 'pcloud' as const, label: 'pCloud', state: 'connected' as const, detail: 'Encrypted namespace' },
    pairing: 'paired' as const,
    phase: 'reviewing' as const,
    error: null,
    counts: { ...blockedInteropWorkflow('selection', 1).counts, conflict: 1 },
    conflicts: [{ interopId: 'interop-1', label: 'one.jpg', fields: ['title'] }],
  };
  const view = createInteropWorkflowView(state, {
    onClose: () => undefined,
    onConflict: (...args) => calls.push(args),
  });
  const apply = view.querySelector('input[type="checkbox"]');
  assert.ok(apply instanceof HTMLInputElement);
  apply.checked = true;
  const keepBoth = Array.from(view.querySelectorAll('button')).find((control) => control.textContent === 'Keep both');
  assert.ok(keepBoth instanceof HTMLButtonElement);
  keepBoth.click();
  assert.deepEqual(calls, [['interop-1', 'keep-both', true]]);
});

test('progress phases cannot start again and resumable errors use the resume handler', () => {
  const calls: string[] = [];
  const state = {
    ...blockedInteropWorkflow('selection', 1),
    provider: { id: 'pcloud' as const, label: 'pCloud', state: 'connected' as const, detail: 'Encrypted namespace' },
    pairing: 'paired' as const,
    phase: 'failed' as const,
    error: { code: 'partial-failure' as const, message: 'One record remains resumable.', retryable: true },
  };
  const view = createInteropWorkflowView(state, {
    onClose: () => undefined,
    onStart: () => calls.push('start'),
    onResume: () => calls.push('resume'),
    onReconnect: () => calls.push('reconnect'),
  });
  const start = Array.from(view.querySelectorAll('button')).find((control) => control.textContent === 'Start move');
  const resume = Array.from(view.querySelectorAll('.image-trail-interop__error button')).find(
    (control) => control.textContent === 'Resume',
  );
  assert.ok(start instanceof HTMLButtonElement);
  assert.ok(resume instanceof HTMLButtonElement);
  assert.equal(start.disabled, true);
  resume.click();
  assert.deepEqual(calls, ['resume']);
});

test('open workflow makes the panel inert and restores focus when closed', () => {
  const panel = document.createElement('section');
  panel.id = 'image-trail-panel-root';
  panel.className = 'image-trail-panel-root';
  const opener = document.createElement('button');
  panel.append(opener);
  document.body.append(panel);
  opener.focus();

  openInteropWorkflow('bookmark', 1);
  assert.equal(panel.inert, true);
  assert.equal(panel.style.pointerEvents, 'none');
  const dialog = document.querySelector('[role="dialog"][aria-label="Transfer and Sync"]');
  assert.ok(dialog instanceof HTMLElement);
  const close = Array.from(dialog.querySelectorAll('button')).find((control) => control.textContent === 'Close');
  assert.ok(close instanceof HTMLButtonElement);
  close.click();

  assert.equal(panel.inert, false);
  assert.equal(panel.style.pointerEvents, '');
  assert.equal(document.activeElement, opener);
  panel.remove();
});

test('open workflow traps keyboard focus inside the active shadow root', () => {
  const host = document.createElement('div');
  const shadow = host.attachShadow({ mode: 'open' });
  const panel = document.createElement('section');
  panel.className = 'image-trail-panel-root';
  const opener = document.createElement('button');
  panel.append(opener);
  shadow.append(panel);
  document.body.append(host);
  opener.focus();

  openInteropWorkflow('bookmark', 1);
  const dialog = shadow.querySelector('[role="dialog"][aria-label="Transfer and Sync"]');
  assert.ok(dialog instanceof HTMLElement);
  const close = Array.from(dialog.querySelectorAll('button')).find((control) => control.textContent === 'Close');
  assert.ok(close instanceof HTMLButtonElement);
  const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), [tabindex]'));
  const first = controls[0];
  const last = controls.at(-1);
  assert.ok(first);
  assert.ok(last);
  assert.equal(shadow.activeElement, first);

  const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  last.focus();
  last.dispatchEvent(tab);
  assert.equal(tab.defaultPrevented, true);
  assert.equal(shadow.activeElement, first);

  close.click();
  assert.equal(shadow.activeElement, opener);
  host.remove();
});

test('open workflow ignores an older status response after a newer operation response', async (t) => {
  let resolveStatus: ((value: unknown) => void) | undefined;
  let resolveOperation: ((value: unknown) => void) | undefined;
  Object.defineProperty(globalThis, 'chrome', {
    configurable: true,
    value: {
      runtime: {
        id: 'test-extension',
        sendMessage: (message: { payload: { action: { name: string } } }) =>
          new Promise((resolve) => {
            if (message.payload.action.name === 'status') resolveStatus = resolve;
            else resolveOperation = resolve;
          }),
      },
    },
  });
  t.after(() => Reflect.deleteProperty(globalThis, 'chrome'));

  openInteropWorkflow('bookmark', 1);
  const dialog = document.querySelector('[role="dialog"][aria-label="Transfer and Sync"]');
  assert.ok(dialog instanceof HTMLElement);
  const sync = Array.from(dialog.querySelectorAll('button')).find((control) => control.textContent === 'Sync');
  assert.ok(sync instanceof HTMLButtonElement);
  sync.click();
  assert.ok(resolveOperation);
  resolveOperation(
    createInteropRuntimeResultMessage({
      ok: true,
      snapshot: { ...blockedInteropWorkflow('bookmark', 1), operation: 'sync', error: null },
    }),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(dialog.textContent ?? '', /Sync with Overlook/u);

  assert.ok(resolveStatus);
  resolveStatus(createInteropRuntimeResultMessage({ ok: true, snapshot: blockedInteropWorkflow('bookmark', 1) }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.match(dialog.textContent ?? '', /Sync with Overlook/u);
  Array.from(dialog.querySelectorAll('button'))
    .find((control) => control.textContent === 'Close')
    ?.click();
});
