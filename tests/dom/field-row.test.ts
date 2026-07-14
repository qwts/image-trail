import test from 'node:test';
import assert from 'node:assert/strict';

import type { FieldEditorRowViewModel } from '../../extension/src/ui/field-editor-view-model.js';
import { createFieldRow, type FieldRowCallbacks } from '../../extension/src/ui/components/field-row.js';

function row(overrides: Partial<FieldEditorRowViewModel> = {}): FieldEditorRowViewModel {
  return {
    field: {
      id: 'query-page',
      location: 'query',
      label: 'page',
      value: '17',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 0,
      digitWidth: 2,
    },
    value: '17',
    digitWidth: 2,
    split: null,
    status: {
      active: false,
      successful: false,
      included: false,
      unchanged: false,
      failed: false,
      failureVisible: false,
    },
    statusChips: [],
    navigationEligible: true,
    navigable: false,
    canToggleNavigationInclusion: false,
    availableTransforms: ['set-value', 'step', 'digit-width', 'split-apply'],
    ...overrides,
  };
}

function callbacks(calls: string[]): FieldRowCallbacks {
  return {
    onValueChange: (fieldId, value) => calls.push(`value:${fieldId}:${value}`),
    onInvalidValueCommit: () => calls.push('invalid'),
    onStep: (fieldId, delta) => calls.push(`step:${fieldId}:${delta}`),
    onDigitWidthChange: (fieldId, value) => calls.push(`width:${fieldId}:${value}`),
    onActivate: (fieldId) => calls.push(`activate:${fieldId}`),
    onToggleUnlock: (fieldId) => calls.push(`trail:${fieldId}`),
    onNumericDisplayModeChange: (fieldId, mode) => calls.push(`radix:${fieldId}:${mode}`),
    onApplySplit: (fieldId, pattern) => calls.push(`split:${fieldId}:${pattern}`),
    onClearSplit: (fieldId) => calls.push(`clear:${fieldId}`),
    onResetField: (fieldId) => calls.push(`reset:${fieldId}`),
  };
}

test('FieldRow exposes a typed semantic root and native controls', () => {
  const view = createFieldRow({ row: row(), privacyMode: false }, callbacks([]));
  const root = view.querySelector('.image-trail-ds__field-row');

  assert.ok(view instanceof HTMLLIElement);
  assert.equal(root?.getAttribute('data-field-id'), 'query-page');
  assert.equal(root?.getAttribute('data-state'), 'default');
  assert.ok(view.querySelector('input[aria-label="Edit page"]') instanceof HTMLInputElement);
  for (const button of view.querySelectorAll('button')) assert.equal(button.getAttribute('type'), 'button');
});

test('FieldRow state priority is error then active then success then unchanged', () => {
  const state = (status: FieldEditorRowViewModel['status']) =>
    createFieldRow({ row: row({ status }), privacyMode: false }, callbacks([]))
      .querySelector('.image-trail-ds__field-row')
      ?.getAttribute('data-state');
  const base = row().status;

  assert.equal(state({ ...base, unchanged: true }), 'unchanged');
  assert.equal(state({ ...base, unchanged: true, successful: true }), 'success');
  assert.equal(state({ ...base, successful: true, active: true }), 'active');
  assert.equal(state({ ...base, active: true, failed: true, failureVisible: true }), 'error');
});

test('FieldRow preserves focus activation and commit-before-command behavior', () => {
  const calls: string[] = [];
  const view = createFieldRow({ row: row(), privacyMode: false }, callbacks(calls));
  document.body.replaceChildren(view);
  const input = view.querySelector('input[aria-label="Edit page"]');
  const increment = view.querySelector('button[aria-label="Increment page"]');
  assert.ok(input instanceof HTMLInputElement);
  assert.ok(increment instanceof HTMLButtonElement);

  input.focus();
  input.value = '18';
  increment.click();

  assert.deepEqual(calls, ['activate:query-page', 'value:query-page:18', 'step:query-page:1']);
});

test('FieldRow privacy mode masks labels, values, metadata, and titles', () => {
  const view = createFieldRow({ row: row(), privacyMode: true }, callbacks([]));
  const text = view.textContent ?? '';
  const titles = Array.from(view.querySelectorAll('[title]'))
    .map((node) => node.getAttribute('title'))
    .join(' ');
  const input = view.querySelector('input[aria-label="Private URL field"]');

  assert.ok(input instanceof HTMLInputElement);
  assert.equal(input.readOnly, true);
  assert.equal(input.value, 'Private value');
  assert.doesNotMatch(`${text} ${titles}`, /page|17/u);
});
