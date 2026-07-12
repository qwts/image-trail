import test from 'node:test';
import assert from 'node:assert/strict';

import { createFieldsResetControls } from '../../extension/src/ui/components/fields-reset-controls.js';

test('reset controls stay hidden when neither reset command is available', () => {
  assert.equal(
    createFieldsResetControls({
      privacyMode: false,
      resetAllAvailable: false,
      resetStructureAvailable: false,
      onResetStructure: () => undefined,
      onResetAll: () => undefined,
    }),
    null,
  );
});

test('reset controls preserve structure/all order and dispatch each command once', () => {
  const calls: string[] = [];
  const controls = createFieldsResetControls({
    privacyMode: false,
    resetAllAvailable: true,
    resetStructureAvailable: true,
    onResetStructure: () => calls.push('structure'),
    onResetAll: () => calls.push('all'),
  });
  assert.ok(controls);
  const buttons = Array.from(controls.querySelectorAll('button'));
  assert.deepEqual(
    buttons.map((button) => button.textContent),
    ['Reset structure', 'Reset all'],
  );

  buttons[0]?.click();
  buttons[1]?.click();
  assert.deepEqual(calls, ['structure', 'all']);
});

test('privacy reset labels expose no parsed values', () => {
  const controls = createFieldsResetControls({
    privacyMode: true,
    resetAllAvailable: true,
    resetStructureAvailable: true,
    onResetStructure: () => undefined,
    onResetAll: () => undefined,
  });
  assert.ok(controls);
  assert.deepEqual(
    Array.from(controls.querySelectorAll('button')).map((button) => button.getAttribute('aria-label')),
    ['Reset private parsed field structure', 'Reset private parsed fields'],
  );
});

test('reset clicks prevent the summary default action', () => {
  const controls = createFieldsResetControls({
    privacyMode: false,
    resetAllAvailable: true,
    resetStructureAvailable: false,
    onResetStructure: () => undefined,
    onResetAll: () => undefined,
  });
  const button = controls?.querySelector('button');
  assert.ok(button);
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  button.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
});
