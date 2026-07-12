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
    onInvalidValueCommit: () => calls.push({ name: 'onInvalidValueCommit', args: [] }),
    onStep: (fieldId, delta) => calls.push({ name: 'onStep', args: [fieldId, delta] }),
    onDigitWidthChange: (fieldId, value) => calls.push({ name: 'onDigitWidthChange', args: [fieldId, value] }),
    onActivate: (fieldId) => calls.push({ name: 'onActivate', args: [fieldId] }),
    onToggleUnlock: (fieldId) => calls.push({ name: 'onToggleUnlock', args: [fieldId] }),
    onNumericDisplayModeChange: (fieldId, mode) => calls.push({ name: 'onNumericDisplayModeChange', args: [fieldId, mode] }),
    onApplySplit: (fieldId, pattern) => calls.push({ name: 'onApplySplit', args: [fieldId, pattern] }),
    onClearSplit: (baseFieldId) => calls.push({ name: 'onClearSplit', args: [baseFieldId] }),
    onResetField: (fieldId) => calls.push({ name: 'onResetField', args: [fieldId] }),
    onResetStructure: () => calls.push({ name: 'onResetStructure', args: [] }),
    onResetAll: () => calls.push({ name: 'onResetAll', args: [] }),
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

test('reset control renders before trail include/exclude control', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, {
    successfulFieldIds: ['query-page'],
    options: { open: true, blockSize: null, resettableFieldIds: new Set(['query-page']) },
  });
  const controls = Array.from(view.querySelectorAll('.image-trail-panel__field-control > *'));
  const resetIndex = controls.indexOf(buttonByLabel(view, 'Reset page'));
  const trailIndex = controls.indexOf(buttonByLabel(view, 'Include page in Previous/Next'));

  assert.ok(resetIndex > -1);
  assert.ok(trailIndex > -1);
  assert.ok(resetIndex < trailIndex);
});

test('reset field button is only interactive when the field is resettable', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { options: { open: true, blockSize: null, resettableFieldIds: new Set(['query-page']) } });

  buttonByLabel(view, 'Reset page').click();

  assert.deepEqual(calls, [{ name: 'onResetField', args: ['query-page'] }]);
});

test('non-resettable rows reserve reset space without exposing a button', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);

  assert.equal(view.querySelector('button[aria-label="Reset page"]'), null);
  assert.ok(view.querySelector('.image-trail-panel__field-reset-placeholder'));
});

test('reset-all button dispatches without exposing values in privacy mode', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, { options: { open: true, blockSize: null, privacyMode: true, resetAllAvailable: true } });

  buttonByLabel(view, 'Reset private parsed fields').click();

  assert.deepEqual(calls, [{ name: 'onResetAll', args: [] }]);
});

test('reset-structure sits beside Reset all and dispatches without exposing values in privacy mode', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, {
    options: { open: true, blockSize: null, privacyMode: true, resetAllAvailable: true, resetStructureAvailable: true },
  });
  const controls = view.querySelector('.image-trail-panel__fields-reset-controls');
  assert.ok(controls);
  assert.deepEqual(
    Array.from(controls.querySelectorAll('button')).map((button) => button.textContent),
    ['Reset structure', 'Reset all'],
  );

  buttonByLabel(view, 'Reset private parsed field structure').click();
  assert.deepEqual(calls, [{ name: 'onResetStructure', args: [] }]);
});

test('empty and delimiter-changing numeric input dispatch normal value commits', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls);
  const input = inputByLabel(view, 'Edit page');
  input.value = '';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-page', ''] }]);

  const delimiterCalls: CallbackCall[] = [];
  const delimiterView = buildFieldsView(delimiterCalls);
  const delimiterInput = inputByLabel(delimiterView, 'Edit page');
  delimiterInput.value = '400/53';
  delimiterInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.deepEqual(delimiterCalls, [{ name: 'onValueChange', args: ['query-page', '400/53'] }]);
});

test('empty text input dispatches a normal value commit', () => {
  const calls: CallbackCall[] = [];
  const view = buildFieldsView(calls, {
    fields: [
      {
        field: { id: 'query-slug', location: 'query', label: 'slug', value: 'word', tokenKind: 'text', queryIndex: 0, tokenIndex: 0 },
        value: 'word',
      },
    ],
  });
  const input = inputByLabel(view, 'Edit slug');
  input.value = '';
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true }));
  assert.deepEqual(calls, [{ name: 'onValueChange', args: ['query-slug', ''] }]);
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

test('the failed-field ring renders unless showFieldFailure is false (Mute) (#450)', () => {
  const calls: CallbackCall[] = [];
  const errorRows = (view: HTMLElement): number => view.querySelectorAll('.image-trail-panel__field-row.is-error').length;

  const shown = createFieldsView([pageField], null, 'query-page', [], [], [], [], recordingCallbacks(calls), {
    open: true,
    blockSize: null,
    showFieldFailure: true,
  });
  assert.equal(errorRows(shown), 1, 'Display/Alert paints the red ring for the failed field');

  const muted = createFieldsView([pageField], null, 'query-page', [], [], [], [], recordingCallbacks(calls), {
    open: true,
    blockSize: null,
    showFieldFailure: false,
  });
  assert.equal(errorRows(muted), 0, 'Mute hides the ring even though failedFieldId is set');
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
