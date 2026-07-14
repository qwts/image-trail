import type { FieldEditorRowViewModel } from '../field-editor-view-model.js';
import { createFieldValueCommitController, type NumericFieldDisplayMode } from './field-value-commit-controller.js';
import {
  defaultNumericFieldDisplayMode,
  fieldDigitWidthInputDisplay,
  fieldDisplayValue,
  fieldSplitLengthLabel,
  numericFieldInputDisplayValue,
  type EditableField,
} from './field-row-values.js';

export {
  defaultNumericFieldDisplayMode,
  fieldDigitWidthInputDisplay,
  fieldDisplayValue,
  fieldReservesTrailControlSlot,
  fieldSplitLengthLabel,
  numericFieldInputDisplayValue,
} from './field-row-values.js';
export type { EditableField } from './field-row-values.js';

export interface FieldRowCallbacks {
  readonly onValueChange: (fieldId: string, value: string) => void;
  readonly onInvalidValueCommit: () => void;
  readonly onStep: (fieldId: string, delta: 1 | -1) => void;
  readonly onDigitWidthChange: (fieldId: string, value: string) => void;
  readonly onActivate: (fieldId: string) => void;
  readonly onToggleUnlock: (fieldId: string) => void;
  readonly onNumericDisplayModeChange: (fieldId: string, mode: NumericFieldDisplayMode) => void;
  readonly onApplySplit: (fieldId: string, pattern: string) => void;
  readonly onClearSplit: (baseFieldId: string) => void;
  readonly onResetField: (fieldId: string) => void;
}

export interface FieldRowOptions {
  readonly row: FieldEditorRowViewModel;
  readonly privacyMode: boolean;
  readonly numericDisplayMode?: NumericFieldDisplayMode | undefined;
}

export function createFieldRow(options: FieldRowOptions, callbacks: FieldRowCallbacks): HTMLLIElement {
  const { row, privacyMode } = options;
  const field: EditableField = row;
  const item = document.createElement('li');
  item.className = 'image-trail-panel__field-item';
  const container = document.createElement('div');
  container.className = fieldRowClasses(row);
  container.dataset['state'] = fieldRowState(row);
  container.dataset['fieldId'] = field.field.id;

  const fieldLabel = privacyMode ? 'Private field' : field.field.label;
  const defaultDisplayMode = defaultNumericFieldDisplayMode(field.field);
  let numericDisplayMode = defaultDisplayMode === null ? null : (options.numericDisplayMode ?? defaultDisplayMode);
  let inputReferenceValue = numericDisplayMode === null ? field.value : numericFieldInputDisplayValue(field.field, numericDisplayMode);
  const value = createValueInput(field, fieldLabel, inputReferenceValue, privacyMode);
  const commitController = createFieldValueCommitController({
    input: value,
    field: field.field,
    privacyMode,
    getDisplayMode: () => numericDisplayMode,
    getReferenceValue: () => inputReferenceValue,
    onValueChange: callbacks.onValueChange,
    onInvalidValueCommit: callbacks.onInvalidValueCommit,
  });
  value.addEventListener('focus', () => {
    if (!row.status.active) callbacks.onActivate(field.field.id);
  });
  value.addEventListener('change', commitController.handleChange);
  value.addEventListener('keydown', commitController.handleKeydown);

  const identity = createIdentity(field, fieldLabel, row, privacyMode);
  const controls = document.createElement('span');
  const hasNumericControls = field.field.tokenKind === 'int' || field.field.tokenKind === 'hex';
  controls.className = `image-trail-panel__field-control has-reset-control-slot${hasNumericControls ? ' has-step-controls' : ''}${row.navigationEligible ? ' has-trail-control-slot' : ''}`;
  controls.append(value);

  if (hasNumericControls && numericDisplayMode !== null) {
    const numeric = createNumericControls({
      field,
      privacyMode,
      digitWidth: row.digitWidth ?? undefined,
      getDisplayMode: () => numericDisplayMode!,
      setDisplayMode: (mode) => {
        numericDisplayMode = mode;
        inputReferenceValue = numericFieldInputDisplayValue(field.field, mode);
        value.value = inputReferenceValue;
        value.title = inputReferenceValue;
      },
      commitFocusedValue: commitController.commitAndBlurFocusedValue,
      callbacks,
    });
    controls.append(...numeric);
  }

  controls.append(createResetControl(field, row, privacyMode, commitController.commitAndBlurFocusedValue, callbacks));
  const trail = createTrailControl(field, row, privacyMode, commitController.commitAndBlurFocusedValue, callbacks);
  if (trail) controls.append(trail);
  container.append(identity, controls);
  const split = createSplitControls(field, row, privacyMode, commitController.commitAndBlurFocusedValue, callbacks);
  if (split) container.append(split);
  item.append(container);
  return item;
}

function createValueInput(field: EditableField, label: string, displayValue: string, privacyMode: boolean): HTMLInputElement {
  const value = document.createElement('input');
  value.type = 'text';
  value.value = privacyMode ? 'Private value' : displayValue;
  value.placeholder = label;
  value.className = `image-trail-panel__field-input${privacyMode ? ' is-privacy-masked' : ''}`;
  value.readOnly = privacyMode;
  value.title = privacyMode ? 'Privacy mode is hiding this URL field for screen sharing.' : field.value;
  value.setAttribute('aria-label', privacyMode ? 'Private URL field' : `Edit ${field.field.label}`);
  value.dataset['fieldId'] = field.field.id;
  return value;
}

function createIdentity(field: EditableField, labelText: string, row: FieldEditorRowViewModel, privacyMode: boolean): HTMLElement {
  const identity = document.createElement('span');
  identity.className = 'image-trail-ds__field-identity';
  const label = document.createElement('span');
  label.className = 'image-trail-panel__field-label';
  label.textContent = labelText;
  label.title = privacyMode ? 'Privacy mode is hiding this field label for screen sharing.' : field.field.label;
  const meta = document.createElement('span');
  meta.className = 'image-trail-panel__field-meta';
  const statuses = row.statusChips.map((chip) => chip.label);
  meta.textContent = privacyMode
    ? `Details hidden${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`
    : `${field.field.location} · ${field.field.tokenKind} · ${fieldDisplayValue(field)}${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`;
  meta.title = meta.textContent;
  identity.append(label, meta);
  return identity;
}

function createNumericControls(options: {
  readonly field: EditableField;
  readonly privacyMode: boolean;
  readonly digitWidth: number | undefined;
  readonly getDisplayMode: () => NumericFieldDisplayMode;
  readonly setDisplayMode: (mode: NumericFieldDisplayMode) => void;
  readonly commitFocusedValue: () => void;
  readonly callbacks: FieldRowCallbacks;
}): readonly HTMLElement[] {
  const { field, privacyMode, callbacks } = options;
  const toggle = document.createElement('span');
  toggle.className = 'image-trail-panel__field-radix-toggle';
  toggle.setAttribute('role', 'group');
  toggle.setAttribute('aria-label', privacyMode ? 'Private numeric display' : `Display mode for ${field.field.label}`);
  const refresh = (mode: NumericFieldDisplayMode) => {
    options.setDisplayMode(mode);
    decimal.classList.toggle('is-active', mode === 'decimal');
    decimal.setAttribute('aria-pressed', String(mode === 'decimal'));
    hex.classList.toggle('is-active', mode === 'hex');
    hex.setAttribute('aria-pressed', String(mode === 'hex'));
  };
  const decimal = createRadixButton('Dec', 'decimal', options, refresh);
  const hex = createRadixButton('Hex', 'hex', options, refresh);
  toggle.append(decimal, hex);

  const widthDisplay = fieldDigitWidthInputDisplay(field.field, options.digitWidth, privacyMode);
  const width = document.createElement('input');
  width.type = 'text';
  width.inputMode = 'numeric';
  width.pattern = '[0-9]*';
  width.value = widthDisplay.value;
  width.placeholder = widthDisplay.placeholder;
  width.className = 'image-trail-panel__field-width-input';
  width.readOnly = privacyMode;
  width.title = privacyMode ? 'Privacy mode is hiding this digit width.' : `Digit width for ${field.field.label}`;
  width.setAttribute('aria-label', privacyMode ? 'Private field digit width' : `Digit width for ${field.field.label}`);
  const commitWidth = () => {
    if (!privacyMode) callbacks.onDigitWidthChange(field.field.id, width.value);
  };
  width.addEventListener('change', commitWidth);
  width.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    commitWidth();
    width.blur();
  });
  return [toggle, width, createStepButton('-', 'Decrement', -1, options), createStepButton('+', 'Increment', 1, options)];
}

function createRadixButton(
  label: string,
  mode: NumericFieldDisplayMode,
  options: Parameters<typeof createNumericControls>[0],
  refresh: (mode: NumericFieldDisplayMode) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `image-trail-panel__field-radix-button${options.getDisplayMode() === mode ? ' is-active' : ''}`;
  button.textContent = label;
  button.title = options.privacyMode ? `${label} display for private field` : `Show ${options.field.field.label} as ${label}`;
  button.setAttribute('aria-label', button.title);
  button.setAttribute('aria-pressed', String(options.getDisplayMode() === mode));
  preserveFocusedInput(button);
  button.addEventListener('click', () => {
    if (options.privacyMode || options.getDisplayMode() === mode) return;
    options.callbacks.onNumericDisplayModeChange(options.field.field.id, mode);
    refresh(mode);
  });
  return button;
}

function createStepButton(
  label: string,
  action: 'Decrement' | 'Increment',
  delta: -1 | 1,
  options: Parameters<typeof createNumericControls>[0],
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trail-panel__field-step-button';
  button.textContent = label;
  button.title = options.privacyMode ? `${action} private field` : `${action} ${options.field.field.label}`;
  button.setAttribute('aria-label', button.title);
  preserveFocusedInput(button);
  button.addEventListener('click', () => {
    options.commitFocusedValue();
    options.callbacks.onStep(options.field.field.id, delta);
  });
  return button;
}

function createResetControl(
  field: EditableField,
  row: FieldEditorRowViewModel,
  privacyMode: boolean,
  commit: () => void,
  callbacks: FieldRowCallbacks,
): HTMLElement {
  if (!row.availableTransforms.includes('reset-field')) {
    const placeholder = document.createElement('span');
    placeholder.className = 'image-trail-panel__field-reset-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'image-trail-panel__field-reset-button';
  reset.textContent = 'Reset';
  reset.title = privacyMode ? 'Reset private field' : `Reset ${field.field.label}`;
  reset.setAttribute('aria-label', reset.title);
  preserveFocusedInput(reset);
  reset.addEventListener('click', () => {
    commit();
    callbacks.onResetField(field.field.id);
  });
  return reset;
}

function createTrailControl(
  field: EditableField,
  row: FieldEditorRowViewModel,
  privacyMode: boolean,
  commit: () => void,
  callbacks: FieldRowCallbacks,
): HTMLButtonElement | null {
  if (!row.canToggleNavigationInclusion) return null;
  const trail = document.createElement('button');
  trail.type = 'button';
  trail.className = `image-trail-panel__field-trail-button${row.status.included ? ' is-included' : ''}`;
  updateTrailControl(trail, field, row.status.included, privacyMode);
  trail.addEventListener('mousedown', (event) => event.preventDefault());
  trail.addEventListener('click', () => {
    commit();
    const included = !trail.classList.contains('is-included');
    trail.classList.toggle('is-included', included);
    updateTrailControl(trail, field, included, privacyMode);
    callbacks.onToggleUnlock(field.field.id);
  });
  return trail;
}

function updateTrailControl(button: HTMLButtonElement, field: EditableField, included: boolean, privacyMode: boolean): void {
  button.textContent = included ? 'Exclude' : 'Include';
  button.title = privacyMode
    ? `${included ? 'Exclude' : 'Include'} private field in Previous/Next`
    : `${included ? 'Exclude' : 'Include'} ${field.field.label} ${included ? 'from' : 'in'} Previous/Next`;
  button.setAttribute('aria-label', button.title);
}

function createSplitControls(
  field: EditableField,
  row: FieldEditorRowViewModel,
  privacyMode: boolean,
  commit: () => void,
  callbacks: FieldRowCallbacks,
): HTMLSpanElement | null {
  const canSplit = row.availableTransforms.includes('split-apply');
  if (!canSplit && row.split === null) return null;
  const controls = document.createElement('span');
  controls.className = `image-trail-panel__field-split-control${canSplit ? ' has-split-input' : ''}`;
  if (canSplit) controls.append(...createSplitApplyControls(field, privacyMode, commit, callbacks));
  if (row.split && field.field.splitBaseId) {
    const clear = document.createElement('button');
    clear.type = 'button';
    clear.className = 'image-trail-panel__field-split-button';
    clear.textContent = 'Clear split';
    clear.title = privacyMode ? 'Collapse private field back into one field' : `Collapse ${field.field.label} back into one field`;
    clear.setAttribute('aria-label', clear.title);
    clear.addEventListener('click', () => {
      commit();
      callbacks.onClearSplit(field.field.splitBaseId ?? field.field.id);
    });
    controls.append(clear);
  }
  return controls;
}

function createSplitApplyControls(
  field: EditableField,
  privacyMode: boolean,
  commit: () => void,
  callbacks: FieldRowCallbacks,
): readonly HTMLElement[] {
  const length = document.createElement('span');
  length.className = 'image-trail-panel__field-split-length';
  length.textContent = fieldSplitLengthLabel(field, privacyMode);
  length.title = privacyMode ? 'Privacy mode is hiding this field length.' : 'Target length for the split pattern.';
  const pattern = document.createElement('input');
  pattern.type = 'text';
  pattern.inputMode = 'numeric';
  pattern.placeholder = '2-2-4';
  pattern.className = 'image-trail-panel__field-split-input';
  pattern.setAttribute('aria-label', privacyMode ? 'Split pattern for private field' : `Split pattern for ${field.field.label}`);
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.className = 'image-trail-panel__field-split-button';
  apply.textContent = 'Split';
  apply.title = privacyMode ? 'Split private field' : `Split ${field.field.label}`;
  apply.setAttribute('aria-label', apply.title);
  const applyPattern = () => callbacks.onApplySplit(field.field.id, pattern.value);
  apply.addEventListener('click', () => {
    commit();
    applyPattern();
  });
  pattern.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    applyPattern();
    pattern.blur();
  });
  return [length, pattern, apply];
}

function preserveFocusedInput(button: HTMLButtonElement): void {
  button.addEventListener('pointerdown', (event) => {
    if (event.button === 0) event.preventDefault();
  });
}

function fieldRowState(row: FieldEditorRowViewModel): 'default' | 'active' | 'success' | 'unchanged' | 'error' {
  if (row.status.failureVisible) return 'error';
  if (row.status.active) return 'active';
  if (row.status.successful) return 'success';
  if (row.status.unchanged) return 'unchanged';
  return 'default';
}

function fieldRowClasses(row: FieldEditorRowViewModel): string {
  return [
    'image-trail-ds__field-row',
    'image-trail-panel__field-row',
    row.status.active && 'is-active',
    row.status.successful && 'is-success',
    row.status.unchanged && 'is-unchanged',
    row.status.failureVisible && 'is-error',
  ]
    .filter(Boolean)
    .join(' ');
}
