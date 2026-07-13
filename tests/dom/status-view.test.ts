import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelAction } from '../../extension/src/core/types.js';
import { createStatusView } from '../../extension/src/ui/components/status-view.js';

function permissionState() {
  return {
    ...createInitialPanelState(0),
    captureResult: {
      status: 'remote-only' as const,
      reason: 'permission-needed' as const,
      message: '',
      origin: 'https://cdn.example.test',
    },
    captureRetryRequest: {
      url: 'https://cdn.example.test/image.jpg',
      sourceType: 'history' as const,
      sourceRecordId: 'recent-1',
    },
  };
}

test('permission-needed capture renders retry and dismiss actions', () => {
  const actions: PanelAction[] = [];
  const view = createStatusView(permissionState(), (action) => actions.push(action));
  const buttons = Array.from(view.querySelectorAll('button'));

  assert.deepEqual(
    buttons.map((button) => button.textContent),
    ['Grant permission and retry', 'Dismiss'],
  );
  assert.match(view.textContent ?? '', /Permission needed for https:\/\/cdn\.example\.test\./u);

  buttons[0]?.click();
  buttons[1]?.click();
  assert.deepEqual(actions, [{ name: 'capture/permission-retry' }, { name: 'capture/clear' }]);
});

test('permission retry action requires retained request context', () => {
  const state = { ...permissionState(), captureRetryRequest: null };
  const view = createStatusView(state, () => {});

  assert.deepEqual(
    Array.from(view.querySelectorAll('button')).map((button) => button.textContent),
    ['Dismiss'],
  );
});

test('non-permission capture failures do not expose the permission action', () => {
  const state = {
    ...permissionState(),
    captureResult: { status: 'failed' as const, reason: 'network-error' as const, message: 'Network down.' },
  };
  const view = createStatusView(state, () => {});

  assert.deepEqual(
    Array.from(view.querySelectorAll('button')).map((button) => button.textContent),
    ['Dismiss'],
  );
});
