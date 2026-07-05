import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createFieldsView,
  type EditableField,
  type FieldsViewCallbacks,
  type FieldsViewOptions,
} from '../../extension/src/ui/components/fields-view.js';

interface CallbackCall {
  readonly name: string;
  readonly args: readonly unknown[];
}

const pageField: EditableField = {
  field: { id: 'query-page', location: 'query', label: 'page', value: '17', tokenKind: 'int', queryIndex: 0, tokenIndex: 0 },
  value: '17',
};

function recordingCallbacks(calls: CallbackCall[]): FieldsViewCallbacks {
  return {
    onValueChange: (fieldId, value) => calls.push({ name: 'onValueChange', args: [fieldId, value] }),
    onStep: (fieldId, delta) => calls.push({ name: 'onStep', args: [fieldId, delta] }),
    onDigitWidthChange: (fieldId, value) => calls.push({ name: 'onDigitWidthChange', args: [fieldId, value] }),
    onActivate: (fieldId) => calls.push({ name: 'onActivate', args: [fieldId] }),
    onToggleUnlock: (fieldId) => calls.push({ name: 'onToggleUnlock', args: [fieldId] }),
    onNumericDisplayModeChange: (fieldId, mode) => calls.push({ name: 'onNumericDisplayModeChange', args: [fieldId, mode] }),
    onApplySplit: (fieldId, pattern) => calls.push({ name: 'onApplySplit', args: [fieldId, pattern] }),
    onClearSplit: (baseFieldId) => calls.push({ name: 'onClearSplit', args: [baseFieldId] }),
    onOpenChange: (open, blockSize) => calls.push({ name: 'onOpenChange', args: [open, blockSize] }),
    onResize: (blockSize) => calls.push({ name: 'onResize', args: [blockSize] }),
  };
}

function buildFieldsView(
  calls: CallbackCall[],
  overrides: {
    readonly fields?: EditableField[];
    readonly successfulFieldIds?: readonly string[];
    readonly options?: FieldsViewOptions;
  } = {},
): HTMLElement {
  return createFieldsView(
    overrides.fields ?? [pageField],
    null,
    null,
    overrides.successfulFieldIds ?? [],
    [],
    [],
    [],
    recordingCallbacks(calls),
    overrides.options ?? { open: true, blockSize: null },
  );
}

function inputByLabel(view: HTMLElement, label: string): HTMLInputElement {
  const input = view.querySelector(`input[aria-label="${label}"]`);
  assert.ok(input instanceof HTMLInputElement, `expected an input labelled "${label}"`);
  return input;
}

function buttonByLabel(view: HTMLElement, label: string): HTMLButtonElement {
  const button = view.querySelector(`button[aria-label="${label}"]`);
  assert.ok(button instanceof HTMLButtonElement, `expected a button labelled "${label}"`);
  return button;
}

test('a change event on the value input commits the new value', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const input = inputByLabel(view, 'Edit page');

  input.value = '18';
  input.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-page', '18'] }]);
});

test('Enter commits the edited value once and the follow-up change event is suppressed', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const input = inputByLabel(view, 'Edit page');

  input.value = '18';
  const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
  input.dispatchEvent(enter);
  assert.equal(enter.defaultPrevented, true);

  input.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-page', '18'] }]);
});

test('an unchanged value does not commit on Enter', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const input = inputByLabel(view, 'Edit page');

  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));

  assert.deepEqual(calls, []);
});

test('step buttons step the field without committing the untouched input', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);

  buttonByLabel(view, 'Increment page').click();
  buttonByLabel(view, 'Decrement page').click();

  assert.deepEqual(calls, [
    { name: 'onStep', args: ['query-page', 1] },
    { name: 'onStep', args: ['query-page', -1] },
  ]);
});

test('a change event on the digit-width input reports the new width', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const widthInput = inputByLabel(view, 'Digit width for page');

  widthInput.value = '3';
  widthInput.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(calls, [{ name: 'onDigitWidthChange', args: ['query-page', '3'] }]);
});

test('the trail button toggles inclusion and flips its label', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { successfulFieldIds: ['query-page'] });
  const trail = buttonByLabel(view, 'Include page in Previous/Next');

  trail.click();

  assert.deepEqual(calls, [{ name: 'onToggleUnlock', args: ['query-page'] }]);
  assert.equal(trail.textContent, 'Exclude');
  assert.equal(trail.getAttribute('aria-label'), 'Exclude page from Previous/Next');
});

test('numeric display toggle changes the input display without committing a value', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const input = inputByLabel(view, 'Edit page');
  const hexToggle = buttonByLabel(view, 'Show page as Hex');

  hexToggle.click();

  assert.equal(input.value, '0x11');
  assert.deepEqual(calls, [{ name: 'onNumericDisplayModeChange', args: ['query-page', 'hex'] }]);
});

test('alternate numeric display commits edits in source field representation', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { options: { open: true, blockSize: null, numericDisplayModes: new Map([['query-page', 'hex']]) } });
  const input = inputByLabel(view, 'Edit page');

  assert.equal(input.value, '0x11');
  input.value = '0x12';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));

  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-page', '18'] }]);
});

test('alternate numeric display blur commits edits in source field representation', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { options: { open: true, blockSize: null, numericDisplayModes: new Map([['query-page', 'hex']]) } });
  const input = inputByLabel(view, 'Edit page');

  input.value = '0x12';
  input.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-page', '18'] }]);
});

test('cached numeric display modes are ignored for nonnumeric fields', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, {
    fields: [
      {
        field: {
          id: 'query-page',
          location: 'query',
          label: 'slug',
          value: 'page',
          tokenKind: 'text',
          queryIndex: 0,
          tokenIndex: 0,
        },
        value: 'page',
      },
    ],
    options: { open: true, blockSize: null, numericDisplayModes: new Map([['query-page', 'hex']]) },
  });
  const input = inputByLabel(view, 'Edit slug');

  input.value = 'next';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));

  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-page', 'next'] }]);
});

test('split length hint renders without exposing field length in privacy mode', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const length = view.querySelector('.image-trail-panel__field-split-length');
  assert.equal(length?.textContent, 'Length: 2 digits');

  const privateView = buildFieldsView([], { options: { open: true, blockSize: null, privacyMode: true } });
  const privateLength = privateView.querySelector('.image-trail-panel__field-split-length');
  assert.equal(privateLength?.textContent, 'Length hidden');
});

test('no parsed fields renders the empty state', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { fields: [] });
  const empty = view.querySelector('li.image-trail-panel__field-empty');

  assert.ok(empty, 'expected the empty-state list item');
  assert.equal(empty.textContent, 'No parsed fields available yet.');
});

test('privacy mode masks the field and blocks value commits', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { options: { open: true, blockSize: null, privacyMode: true } });
  const input = inputByLabel(view, 'Private URL field');

  assert.equal(input.readOnly, true);
  assert.equal(input.value, 'Private value');

  input.value = '18';
  input.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(calls, []);
});
