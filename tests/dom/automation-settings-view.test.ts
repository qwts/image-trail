import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../../extension/src/core/types.js';
import {
  createNeighborPreloadSettingsView,
  createRequestThrottleSettingsView,
  createUrlReviewStatusSettingsView,
} from '../../extension/src/ui/components/automation-settings-view.js';

test('request throttle accepts bounded integers once and rejects invalid values', () => {
  const actions: PanelAction[] = [];
  const view = createRequestThrottleSettingsView({ minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 }, (action) =>
    actions.push(action),
  );
  const inputs = view.querySelectorAll<HTMLInputElement>('input');
  const form = view.querySelector('form');
  assert.equal(inputs.length, 3);
  assert.ok(form);
  inputs[0]!.value = '25';
  inputs[1]!.value = '4';
  inputs[2]!.value = '12000';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.deepEqual(actions, [{ name: 'settings/update-request-throttle', minimumIntervalMs: 25, maxRequests: 4, windowMs: 12_000 }]);

  inputs[1]!.value = '-1';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(actions.length, 1);
});

test('preload immediate controls preserve fallback values and dispatch once', () => {
  const actions: PanelAction[] = [];
  const view = createNeighborPreloadSettingsView(
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' },
    (action) => actions.push(action),
  );
  const enabled = view.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const numbers = view.querySelectorAll<HTMLInputElement>('input[type="number"]');
  assert.ok(enabled);
  numbers[0]!.value = 'invalid';
  enabled.checked = true;
  enabled.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [
    {
      name: 'settings/update-neighbor-preload',
      enabled: true,
      radius: 3,
      cacheLimit: 24,
      probeMethod: 'get',
      loadFailureFeedback: 'mute',
    },
  ]);

  const feedback = Array.from(view.querySelectorAll('label'))
    .find((label) => label.textContent?.includes('Failure feedback'))
    ?.querySelector('select');
  assert.ok(feedback);
  numbers[0]!.value = '4';
  feedback.value = 'alert';
  feedback.dispatchEvent(new Event('change'));
  assert.equal(actions.length, 2);
  assert.equal(actions[1]?.name, 'settings/update-neighbor-preload');
});

test('preload more commits settings before the manual command', () => {
  const actions: PanelAction[] = [];
  const view = createNeighborPreloadSettingsView(
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'head', feedback: 'display' },
    (action) => actions.push(action),
  );
  const numbers = view.querySelectorAll<HTMLInputElement>('input[type="number"]');
  numbers[0]!.value = '5';
  numbers[1]!.value = '30';
  const manual = Array.from(view.querySelectorAll('button')).find((button) => button.textContent === 'Preload more');
  assert.ok(manual);
  manual.click();
  assert.deepEqual(actions, [
    {
      name: 'settings/update-neighbor-preload',
      enabled: true,
      radius: 5,
      cacheLimit: 30,
      probeMethod: 'head',
      loadFailureFeedback: 'display',
    },
    { name: 'neighbor-preload/manual', radius: 5, cacheLimit: 30 },
  ]);
});

test('URL review retention submits and applies checkbox changes exactly once', () => {
  const actions: PanelAction[] = [];
  const view = createUrlReviewStatusSettingsView({ limit: 5_000, clearAfterExport: false }, (action) => actions.push(action));
  const limit = view.querySelector<HTMLInputElement>('input[type="number"]');
  const clear = view.querySelector<HTMLInputElement>('input[type="checkbox"]');
  const form = view.querySelector('form');
  assert.ok(limit);
  assert.ok(clear);
  assert.ok(form);
  limit.value = '6000';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  clear.checked = true;
  clear.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [
    { name: 'settings/update-url-review-status-retention', limit: 6_000, clearAfterExport: false },
    { name: 'settings/update-url-review-status-retention', limit: 6_000, clearAfterExport: true },
  ]);
  limit.value = '6.5';
  form.dispatchEvent(new Event('submit', { cancelable: true }));
  assert.equal(actions.length, 2);
});
