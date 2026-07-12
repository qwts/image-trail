import test from 'node:test';
import assert from 'node:assert/strict';

import { createControlsView } from '../../extension/src/ui/components/controls-view.js';

test('field-selection controls use field labels and preserve callback routing', () => {
  const calls: string[] = [];
  const view = createControlsView({
    onPrevious: () => calls.push('previous'),
    onNext: () => calls.push('next'),
  });
  const buttons = Array.from(view.querySelectorAll('button'));

  assert.deepEqual(
    buttons.map((button) => button.textContent),
    ['Previous field', 'Next field'],
  );
  buttons[0]?.click();
  buttons[1]?.click();
  assert.deepEqual(calls, ['previous', 'next']);
});
