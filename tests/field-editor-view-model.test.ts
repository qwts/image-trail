import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { activeUrlFieldsForState, type ActiveUrlFields } from '../extension/src/ui/active-url-fields.js';
import { createFieldEditorViewModel } from '../extension/src/ui/field-editor-view-model.js';
import type { EditableField } from '../extension/src/ui/components/fields-view.js';

const pageField: EditableField = {
  field: {
    id: 'query-page',
    location: 'query',
    label: 'page',
    value: '17',
    tokenKind: 'int',
    queryIndex: 0,
    tokenIndex: 0,
  },
  value: '17',
};

const colorField: EditableField = {
  field: {
    id: 'query-color',
    location: 'query',
    label: 'color',
    value: 'ff',
    tokenKind: 'hex',
    queryIndex: 1,
    tokenIndex: 0,
  },
  value: 'ff',
};

const slugField: EditableField = {
  field: {
    id: 'path-slug',
    location: 'path',
    label: 'slug',
    value: 'frame',
    tokenKind: 'text',
    partIndex: 0,
    tokenIndex: 0,
  },
  value: 'frame',
};

const fileNumberField: EditableField = {
  field: {
    id: 'path-file-number',
    location: 'path',
    label: 'file 1',
    value: '0042',
    tokenKind: 'int',
    partIndex: 2,
    tokenIndex: 1,
  },
  value: '0042',
};

function activeFields(editableFields: readonly EditableField[], activeUrl = 'https://example.test/frame?page=17'): ActiveUrlFields {
  const fields = editableFields.map((field) => field.field);
  return { activeUrl, fields, visibleFields: fields, editableFields, activeTemplate: null };
}

function modelFor(editableFields: readonly EditableField[], overrides: Partial<PanelState> = {}) {
  return createFieldEditorViewModel({ ...createInitialPanelState(), ...overrides }, activeFields(editableFields));
}

test('derives ordered status chips, active summary, navigation, and transforms', () => {
  const splitField: EditableField = {
    field: {
      ...pageField.field,
      id: 'query-page-b',
      label: 'page part 2',
      value: '17',
      splitBaseId: 'query-page',
      splitPartIndex: 1,
      splitPartCount: 3,
    },
    value: '17',
  };
  const model = modelFor([pageField, splitField, colorField], {
    activeFieldId: splitField.field.id,
    failedFieldId: splitField.field.id,
    successfulFieldIds: [splitField.field.id],
    unchangedFieldIds: [splitField.field.id],
    unlockedFieldIds: [splitField.field.id],
    fieldDigitWidthSpecs: [{ fieldId: splitField.field.id, width: 4 }],
    loadFailureFeedback: 'display',
  });
  const row = model.rows[1];

  assert.ok(row);
  assert.deepEqual(
    row.statusChips.map((chip) => chip.label),
    ['active', 'loads', 'included', 'split 2/3', 'unchanged', 'failed load'],
  );
  assert.deepEqual(row.split, { baseFieldId: 'query-page', position: 2, count: 3 });
  assert.equal(row.digitWidth, 4);
  assert.equal(row.navigationEligible, true);
  assert.equal(row.navigable, true);
  assert.equal(row.canToggleNavigationInclusion, true);
  assert.deepEqual(row.availableTransforms, ['set-value', 'step', 'digit-width', 'split-clear']);
  assert.deepEqual(model.activeField, {
    id: 'query-page-b',
    label: 'page part 2',
    value: '17',
    location: 'query',
    tokenKind: 'int',
    position: 2,
    count: 3,
    status: row.status,
  });
  assert.equal(model.previousFieldId, 'query-page');
  assert.equal(model.nextFieldId, 'query-color');
  assert.deepEqual(model.collapsedSummary, {
    fieldCount: 3,
    activeFieldId: 'query-page-b',
    activeFieldLabel: 'page part 2',
    activePosition: 2,
    hasFailure: true,
    failureVisible: true,
  });
});

test('preserves boundary navigation and chooses endpoints without an active field', () => {
  const first = modelFor([pageField, colorField, slugField], { activeFieldId: pageField.field.id });
  assert.equal(first.previousFieldId, pageField.field.id);
  assert.equal(first.nextFieldId, colorField.field.id);

  const last = modelFor([pageField, colorField, slugField], { activeFieldId: slugField.field.id });
  assert.equal(last.previousFieldId, colorField.field.id);
  assert.equal(last.nextFieldId, slugField.field.id);

  const missing = modelFor([pageField, colorField, slugField], { activeFieldId: 'missing' });
  assert.equal(missing.previousFieldId, slugField.field.id);
  assert.equal(missing.nextFieldId, pageField.field.id);
  assert.equal(missing.activeField, null);
});

test('derives transform availability for numeric, text, split, inclusion, and reset states', () => {
  const baselineUrl = 'https://example.test/frame?page=17';
  const currentUrl = 'https://example.test/frame?page=18';
  const state = {
    ...createInitialPanelState(),
    draftUrl: currentUrl,
    parsedFieldResetBaseline: {
      sourceUrl: baselineUrl,
      activeFieldId: null,
      failedFieldId: null,
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      fieldDigitWidthSpecs: [],
    },
  };
  const fields = activeUrlFieldsForState(state, currentUrl);
  const model = createFieldEditorViewModel(state, fields);
  const numeric = model.rows.find((row) => row.field.location === 'query');

  assert.ok(numeric);
  assert.deepEqual(numeric.availableTransforms, ['set-value', 'step', 'digit-width', 'split-apply', 'reset-field']);
  assert.deepEqual(model.availableTransforms, ['reset-all']);

  const text = modelFor([slugField]).rows[0];
  assert.ok(text);
  assert.deepEqual(text.availableTransforms, ['set-value', 'split-apply']);
  assert.equal(text.navigationEligible, false);
  assert.equal(text.canToggleNavigationInclusion, false);

  const pathNumber = modelFor([fileNumberField], {
    successfulFieldIds: [fileNumberField.field.id],
  }).rows[0];
  assert.equal(pathNumber?.navigationEligible, true);
  assert.equal(pathNumber?.canToggleNavigationInclusion, true);
});

test('uses only visible rows and returns JSON-serializable production data in privacy mode', () => {
  const state = { ...createInitialPanelState(), privacyModeEnabled: true, activeFieldId: colorField.field.id };
  const fields: ActiveUrlFields = {
    activeUrl: 'https://example.test/frame?page=17&color=ff',
    fields: [pageField.field, colorField.field],
    visibleFields: [colorField.field],
    editableFields: [colorField],
    activeTemplate: null,
  };
  const model = createFieldEditorViewModel(state, fields);

  assert.equal(model.privacyMode, true);
  assert.equal(model.rows.length, 1);
  assert.equal(model.activeField?.position, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(model)), model);
});

test('retains failed state while muting the visible failure chip and ring', () => {
  const model = modelFor([pageField], {
    activeFieldId: pageField.field.id,
    failedFieldId: pageField.field.id,
    loadFailureFeedback: 'mute',
  });
  const row = model.rows[0];

  assert.ok(row);
  assert.equal(row.status.failed, true);
  assert.equal(row.status.failureVisible, false);
  assert.deepEqual(
    row.statusChips.map((chip) => chip.label),
    ['active'],
  );
  assert.equal(model.collapsedSummary.hasFailure, true);
  assert.equal(model.collapsedSummary.failureVisible, false);
});

test('returns an empty model when the active URL cannot be parsed', () => {
  const initial = createInitialPanelState();
  const state = {
    ...initial,
    target: { ...initial.target, selectedUrl: 'http://[invalid' },
  };
  const fields = activeUrlFieldsForState(state, 'https://example.test/fallback');
  const model = createFieldEditorViewModel(state, fields);

  assert.deepEqual(fields.editableFields, []);
  assert.deepEqual(model.rows, []);
  assert.equal(model.activeField, null);
  assert.equal(model.previousFieldId, null);
  assert.equal(model.nextFieldId, null);
  assert.equal(model.collapsedSummary.fieldCount, 0);
});
