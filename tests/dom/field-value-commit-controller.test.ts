import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFieldValueCommitController,
  type NumericFieldDisplayMode,
} from '../../extension/src/ui/components/field-value-commit-controller.js';
import type { UrlField } from '../../extension/src/core/url/types.js';

const numericField: UrlField = {
  id: 'query-page',
  location: 'query',
  label: 'page',
  value: '17',
  tokenKind: 'int',
  queryIndex: 0,
  tokenIndex: 0,
};

interface ControllerHarness {
  readonly input: HTMLInputElement;
  readonly calls: string[];
  readonly setDisplayMode: (mode: NumericFieldDisplayMode | null) => void;
  readonly controller: ReturnType<typeof createFieldValueCommitController>;
}

function createHarness(field: UrlField = numericField, privacyMode = false): ControllerHarness {
  const input = document.createElement('input');
  input.value = field.value;
  document.body.replaceChildren(input);
  const calls: string[] = [];
  let displayMode: NumericFieldDisplayMode | null = field.tokenKind === 'int' ? 'decimal' : null;
  let referenceValue = field.value;
  const controller = createFieldValueCommitController({
    input,
    field,
    privacyMode,
    getDisplayMode: () => displayMode,
    getReferenceValue: () => referenceValue,
    onValueChange: (fieldId, value) => calls.push(`commit:${fieldId}:${value}`),
    onInvalidValueCommit: () => calls.push('invalid'),
  });
  return {
    input,
    calls,
    setDisplayMode: (mode) => {
      displayMode = mode;
      referenceValue = mode === 'hex' ? '0x11' : field.value;
      input.value = referenceValue;
    },
    controller,
  };
}

test('Enter dispatches once and suppresses the follow-up change and repeated Enter events', () => {
  const harness = createHarness();
  harness.input.value = '18';

  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  harness.controller.handleKeydown(enter);
  harness.controller.handleKeydown(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
  harness.controller.handleChange();

  assert.equal(enter.defaultPrevented, true);
  assert.deepEqual(harness.calls, ['commit:query-page:18']);
});

test('empty and delimiter-changing values bypass numeric rejection', () => {
  const empty = createHarness();
  empty.input.value = '';
  empty.controller.commit();
  assert.deepEqual(empty.calls, ['commit:query-page:']);

  const delimiter = createHarness();
  delimiter.input.value = '400/53';
  delimiter.controller.commit();
  assert.deepEqual(delimiter.calls, ['commit:query-page:400/53']);
});

test('alternate-base edits normalize while invalid numeric edits restore the display value', () => {
  const valid = createHarness();
  valid.setDisplayMode('hex');
  valid.input.value = '0x12';
  valid.controller.commit();
  assert.deepEqual(valid.calls, ['commit:query-page:18']);

  const invalid = createHarness();
  invalid.setDisplayMode('hex');
  invalid.input.value = 'not-hex';
  invalid.controller.commit();
  assert.equal(invalid.input.value, '0x11');
  assert.deepEqual(invalid.calls, ['invalid']);
});

test('split-child commits retain the child field id', () => {
  const harness = createHarness({
    ...numericField,
    id: 'query-page-a',
    label: 'page part 1',
    value: '1',
    splitBaseId: 'query-page',
    splitPartIndex: 0,
    splitPartCount: 2,
  });
  harness.input.value = '2';
  harness.controller.commit();
  assert.deepEqual(harness.calls, ['commit:query-page-a:2']);
});

test('commit-before-command preserves order only for a focused editable value', () => {
  const harness = createHarness();
  harness.input.focus();
  harness.input.value = '18';
  harness.controller.commitAndBlurFocusedValue();
  harness.calls.push('command');
  assert.deepEqual(harness.calls, ['commit:query-page:18', 'command']);
  assert.notEqual(document.activeElement, harness.input);

  const privateHarness = createHarness(numericField, true);
  privateHarness.input.focus();
  privateHarness.input.value = '18';
  privateHarness.controller.commitAndBlurFocusedValue();
  assert.deepEqual(privateHarness.calls, []);
});
