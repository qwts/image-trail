import type { UrlField } from '../../core/url/types.js';
import { fieldSupportsTrailNavigation, type FieldEditorViewModel } from '../field-editor-view-model.js';
import { createFieldValueCommitController, type NumericFieldDisplayMode } from './field-value-commit-controller.js';
import { createFieldsResetControls } from './fields-reset-controls.js';

export { type NumericFieldDisplayMode, numericFieldCommitValue } from './field-value-commit-controller.js';

export interface EditableField {
  readonly field: UrlField;
  readonly value: string;
}

export interface FieldsViewCallbacks {
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
  readonly onResetStructure: () => void;
  readonly onResetAll: () => void;
  readonly onOpenChange: (open: boolean, blockSize: number | null) => void;
  readonly onResize: (blockSize: number) => void;
}

export interface FieldsViewOptions {
  readonly open: boolean;
  readonly blockSize: number | null;
  readonly numericDisplayModes?: ReadonlyMap<string, NumericFieldDisplayMode>;
}

function computedPixelValue(styles: CSSStyleDeclaration, property: string): number {
  const value = Number.parseFloat(styles.getPropertyValue(property));
  return Number.isFinite(value) ? value : 0;
}

function rowCountBlockSize(wrapper: HTMLElement, summary: HTMLElement, body: HTMLElement, intro: HTMLElement, list: HTMLElement): number {
  const rows = Array.from(list.children);
  const row = rows[0];
  const rowBlockSize = row instanceof HTMLElement ? row.getBoundingClientRect().height : 0;
  const wrapperStyles = getComputedStyle(wrapper);
  const bodyStyles = getComputedStyle(body);
  const listStyles = getComputedStyle(list);
  const wrapperGap = computedPixelValue(wrapperStyles, 'row-gap');
  const bodyGap = computedPixelValue(bodyStyles, 'row-gap');
  const listGap = computedPixelValue(listStyles, 'row-gap');
  const wrapperChromeBlockSize =
    computedPixelValue(wrapperStyles, 'padding-block-start') + computedPixelValue(wrapperStyles, 'padding-block-end');
  const listChromeBlockSize = computedPixelValue(listStyles, 'padding-block-start') + computedPixelValue(listStyles, 'padding-block-end');
  const listBlockSize = listChromeBlockSize + rows.length * rowBlockSize + Math.max(0, rows.length - 1) * listGap;
  return Math.ceil(
    wrapperChromeBlockSize +
      summary.getBoundingClientRect().height +
      wrapperGap +
      intro.getBoundingClientRect().height +
      bodyGap +
      listBlockSize,
  );
}

export function fieldDisplayValue(field: EditableField): string {
  if (field.field.tokenKind !== 'hex') return field.field.value || '(empty)';
  const raw = field.value;
  try {
    const digits = raw.replace(/^0[xX]/u, '');
    return `${raw} (${BigInt(`0x${digits}`).toString(10)})`;
  } catch {
    return raw || '(empty)';
  }
}

export function defaultNumericFieldDisplayMode(field: UrlField): NumericFieldDisplayMode | null {
  if (field.tokenKind === 'int') return 'decimal';
  if (field.tokenKind === 'hex') return 'hex';
  return null;
}

export function fieldSplitLengthLabel(field: EditableField, privacyMode: boolean): string {
  if (privacyMode) return 'Length hidden';
  const length = field.value.length;
  const unit = field.field.tokenKind === 'int' ? `digit${length === 1 ? '' : 's'}` : `character${length === 1 ? '' : 's'}`;
  return `Length: ${length} ${unit}`;
}

export function numericFieldInputDisplayValue(field: UrlField, mode: NumericFieldDisplayMode): string {
  const value = parseNumericFieldSourceValue(field);
  if (value === null) return field.value;
  if (mode === 'decimal') return value.toString(10);
  if (field.tokenKind === 'hex') return field.value;
  return `0x${value.toString(16)}`;
}

export function fieldDigitWidthInputDisplay(
  field: UrlField,
  digitWidth: number | undefined,
  privacyMode: boolean,
): { readonly value: string; readonly placeholder: string } {
  if (privacyMode) return { value: '', placeholder: '' };
  return {
    value: digitWidth === undefined ? '' : String(digitWidth),
    placeholder: field.digitWidth === undefined ? 'auto' : String(field.digitWidth),
  };
}

function parseNumericFieldSourceValue(field: UrlField): bigint | null {
  if (field.tokenKind === 'int') return parseDecimal(field.value);
  if (field.tokenKind === 'hex') return parseHex(field.value);
  return null;
}

function parseDecimal(value: string): bigint | null {
  if (!/^\d+$/u.test(value)) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
}

function parseHex(value: string): bigint | null {
  const digits = value.replace(/^0[xX]/u, '');
  if (!/^[0-9a-fA-F]+$/u.test(digits)) return null;
  try {
    return BigInt(`0x${digits}`);
  } catch {
    return null;
  }
}

export function fieldReservesTrailControlSlot(field: UrlField): boolean {
  return fieldSupportsTrailNavigation(field);
}

export function createFieldsView(model: FieldEditorViewModel, callbacks: FieldsViewCallbacks, options: FieldsViewOptions): HTMLElement {
  const wrapper = document.createElement('details');
  wrapper.className = 'image-trail-panel__section image-trail-panel__fields';
  if (model.privacyMode) wrapper.classList.add('is-privacy-masked');
  wrapper.open = options.open;
  if (options.blockSize !== null) {
    wrapper.classList.add('is-height-locked');
    wrapper.style.setProperty('--image-trail-fields-size', `${options.blockSize}px`);
  }
  let resizeStartBlockSize: number | null = null;
  wrapper.addEventListener('toggle', () => {
    if (!wrapper.open) {
      wrapper.classList.remove('is-height-locked');
      wrapper.style.removeProperty('--image-trail-fields-size');
      callbacks.onOpenChange(false, null);
      return;
    }

    queueMicrotask(() => {
      if (options.blockSize !== null) return;
      const blockSize = rowCountBlockSize(wrapper, summary, body, intro, list);
      wrapper.classList.add('is-height-locked');
      wrapper.style.setProperty('--image-trail-fields-size', `${blockSize}px`);
      callbacks.onOpenChange(true, blockSize);
    });
  });
  wrapper.addEventListener('pointerdown', (event) => {
    if (!wrapper.open) return;
    const rect = wrapper.getBoundingClientRect();
    if (rect.bottom - event.clientY > 18) return;
    resizeStartBlockSize = Math.round(rect.height);
  });
  wrapper.addEventListener('pointerup', () => {
    if (!wrapper.open) return;
    if (resizeStartBlockSize === null) return;
    const blockSize = Math.round(wrapper.getBoundingClientRect().height);
    const changed = blockSize !== resizeStartBlockSize;
    resizeStartBlockSize = null;
    if (!changed) return;
    wrapper.classList.add('is-height-locked');
    wrapper.style.setProperty('--image-trail-fields-size', `${blockSize}px`);
    callbacks.onResize(blockSize);
  });

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__fields-summary';
  const heading = document.createElement('h3');
  heading.textContent = 'Field Editor';
  summary.append(heading);
  const resetControls = createFieldsResetControls({
    privacyMode: model.privacyMode,
    resetAllAvailable: model.availableTransforms.includes('reset-all'),
    resetStructureAvailable: model.availableTransforms.includes('reset-structure'),
    onResetStructure: callbacks.onResetStructure,
    onResetAll: callbacks.onResetAll,
  });
  if (resetControls) summary.append(resetControls);

  const body = document.createElement('div');
  body.className = 'image-trail-panel__fields-body';
  const intro = document.createElement('p');
  intro.className = 'image-trail-panel__meta';
  intro.textContent = model.privacyMode
    ? 'Parsed URL fields are hidden for screen sharing.'
    : model.rows.length
      ? `${model.rows.length} token${model.rows.length === 1 ? '' : 's'} parsed from the selected image URL.`
      : 'Select a target image to inspect its parsed URL tokens.';
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__field-list';
  for (const row of model.rows) {
    const field: EditableField = row;
    const item = document.createElement('li');
    item.className = 'image-trail-panel__field-item';
    const container = document.createElement('div');
    const isFailed = row.status.failureVisible;
    const isSuccessful = row.status.successful;
    const isUnchanged = row.status.unchanged;
    const isIncludedInTrail = row.status.included;
    const isSplitField = row.split !== null;
    const isResettable = row.availableTransforms.includes('reset-field');
    const digitWidth = row.digitWidth ?? undefined;
    const reservesTrailControlSlot = row.navigationEligible;
    const canUnlock = row.canToggleNavigationInclusion;
    const canSplit = row.availableTransforms.includes('split-apply');
    const fieldLabel = model.privacyMode ? 'Private field' : field.field.label;
    const defaultNumericDisplayMode = defaultNumericFieldDisplayMode(field.field);
    let numericDisplayMode =
      defaultNumericDisplayMode === null ? null : (options.numericDisplayModes?.get(field.field.id) ?? defaultNumericDisplayMode);
    let fieldInputReferenceValue =
      numericDisplayMode === null ? field.value : numericFieldInputDisplayValue(field.field, numericDisplayMode);
    container.className = `image-trail-panel__field-row${row.status.active ? ' is-active' : ''}${isSuccessful ? ' is-success' : ''}${isUnchanged ? ' is-unchanged' : ''}${isFailed ? ' is-error' : ''}`;

    const value = document.createElement('input');
    value.type = 'text';
    value.value = model.privacyMode ? 'Private value' : fieldInputReferenceValue;
    value.placeholder = fieldLabel;
    value.className = 'image-trail-panel__field-input';
    if (model.privacyMode) value.classList.add('is-privacy-masked');
    value.readOnly = model.privacyMode;
    value.title = model.privacyMode ? 'Privacy mode is hiding this URL field for screen sharing.' : field.value;
    value.setAttribute('aria-label', model.privacyMode ? 'Private URL field' : `Edit ${field.field.label}`);
    value.dataset['fieldId'] = field.field.id;
    const valueCommitController = createFieldValueCommitController({
      input: value,
      field: field.field,
      privacyMode: model.privacyMode,
      getDisplayMode: () => numericDisplayMode,
      getReferenceValue: () => fieldInputReferenceValue,
      onValueChange: callbacks.onValueChange,
      onInvalidValueCommit: callbacks.onInvalidValueCommit,
    });
    value.addEventListener('focus', () => {
      if (!row.status.active) callbacks.onActivate(field.field.id);
    });

    const label = document.createElement('span');
    label.className = 'image-trail-panel__field-label';
    label.textContent = fieldLabel;
    label.title = model.privacyMode ? 'Privacy mode is hiding this field label for screen sharing.' : field.field.label;

    const meta = document.createElement('span');
    meta.className = 'image-trail-panel__field-meta';
    const statuses = row.statusChips.map((chip) => chip.label);
    meta.textContent = model.privacyMode
      ? `Details hidden${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`
      : `${field.field.location} · ${field.field.tokenKind} · ${fieldDisplayValue(field)}${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`;
    meta.title = meta.textContent;

    const hasStepControls = field.field.tokenKind === 'int' || field.field.tokenKind === 'hex';
    const controls = document.createElement('span');
    controls.className = `image-trail-panel__field-control has-reset-control-slot${hasStepControls ? ' has-step-controls' : ''}${reservesTrailControlSlot ? ' has-trail-control-slot' : ''}`;
    controls.append(value);
    let splitControls: HTMLSpanElement | null = null;
    let decimalModeButton: HTMLButtonElement | null = null;
    let hexModeButton: HTMLButtonElement | null = null;

    const refreshNumericDisplayMode = (): void => {
      if (numericDisplayMode === null || model.privacyMode) return;
      fieldInputReferenceValue = numericFieldInputDisplayValue(field.field, numericDisplayMode);
      value.value = fieldInputReferenceValue;
      value.title = fieldInputReferenceValue;
      const decimalActive = numericDisplayMode === 'decimal';
      decimalModeButton?.classList.toggle('is-active', decimalActive);
      decimalModeButton?.setAttribute('aria-pressed', String(decimalActive));
      hexModeButton?.classList.toggle('is-active', !decimalActive);
      hexModeButton?.setAttribute('aria-pressed', String(!decimalActive));
    };

    if (hasStepControls) {
      const numericToggle = document.createElement('span');
      numericToggle.className = 'image-trail-panel__field-radix-toggle';
      numericToggle.setAttribute('role', 'group');
      numericToggle.setAttribute('aria-label', model.privacyMode ? 'Private numeric display' : `Display mode for ${field.field.label}`);

      decimalModeButton = createNumericDisplayModeButton('Dec', 'decimal');
      hexModeButton = createNumericDisplayModeButton('Hex', 'hex');
      numericToggle.append(decimalModeButton, hexModeButton);

      const digitWidthDisplay = fieldDigitWidthInputDisplay(field.field, digitWidth, model.privacyMode);
      const digitWidthInput = document.createElement('input');
      digitWidthInput.type = 'text';
      digitWidthInput.inputMode = 'numeric';
      digitWidthInput.pattern = '[0-9]*';
      digitWidthInput.value = digitWidthDisplay.value;
      digitWidthInput.placeholder = digitWidthDisplay.placeholder;
      digitWidthInput.className = 'image-trail-panel__field-width-input';
      digitWidthInput.readOnly = model.privacyMode;
      digitWidthInput.title = model.privacyMode ? 'Privacy mode is hiding this digit width.' : `Digit width for ${field.field.label}`;
      digitWidthInput.setAttribute('aria-label', model.privacyMode ? 'Private field digit width' : `Digit width for ${field.field.label}`);
      digitWidthInput.addEventListener('change', () => {
        if (model.privacyMode) return;
        callbacks.onDigitWidthChange(field.field.id, digitWidthInput.value);
      });
      digitWidthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (model.privacyMode) return;
          callbacks.onDigitWidthChange(field.field.id, digitWidthInput.value);
          digitWidthInput.blur();
        }
      });

      const decrement = document.createElement('button');
      decrement.type = 'button';
      decrement.className = 'image-trail-panel__field-step-button';
      decrement.textContent = '-';
      decrement.title = model.privacyMode ? 'Decrement private field' : `Decrement ${field.field.label}`;
      decrement.setAttribute('aria-label', decrement.title);
      decrement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
      });
      decrement.addEventListener('click', () => {
        valueCommitController.commitAndBlurFocusedValue();
        callbacks.onStep(field.field.id, -1);
      });

      const increment = document.createElement('button');
      increment.type = 'button';
      increment.className = 'image-trail-panel__field-step-button';
      increment.textContent = '+';
      increment.title = model.privacyMode ? 'Increment private field' : `Increment ${field.field.label}`;
      increment.setAttribute('aria-label', increment.title);
      increment.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
      });
      increment.addEventListener('click', () => {
        valueCommitController.commitAndBlurFocusedValue();
        callbacks.onStep(field.field.id, 1);
      });

      controls.append(numericToggle, digitWidthInput, decrement, increment);
    }

    if (isResettable) {
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'image-trail-panel__field-reset-button';
      reset.textContent = 'Reset';
      reset.title = model.privacyMode ? 'Reset private field' : `Reset ${field.field.label}`;
      reset.setAttribute('aria-label', reset.title);
      reset.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
      });
      reset.addEventListener('click', () => {
        valueCommitController.commitAndBlurFocusedValue();
        callbacks.onResetField(field.field.id);
      });
      controls.append(reset);
    } else {
      const placeholder = document.createElement('span');
      placeholder.className = 'image-trail-panel__field-reset-placeholder';
      placeholder.setAttribute('aria-hidden', 'true');
      controls.append(placeholder);
    }

    if (canUnlock) {
      const trail = document.createElement('button');
      trail.type = 'button';
      trail.className = `image-trail-panel__field-trail-button${isIncludedInTrail ? ' is-included' : ''}`;
      trail.textContent = isIncludedInTrail ? 'Exclude' : 'Include';
      trail.title = model.privacyMode
        ? `${isIncludedInTrail ? 'Exclude' : 'Include'} private field in Previous/Next`
        : isIncludedInTrail
          ? `Exclude ${field.field.label} from Previous/Next`
          : `Include ${field.field.label} in Previous/Next`;
      trail.setAttribute('aria-label', trail.title);
      trail.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      trail.addEventListener('click', () => {
        valueCommitController.commitAndBlurFocusedValue();
        const nextIncluded = !trail.classList.contains('is-included');
        trail.classList.toggle('is-included', nextIncluded);
        trail.textContent = nextIncluded ? 'Exclude' : 'Include';
        trail.title = model.privacyMode
          ? `${nextIncluded ? 'Exclude' : 'Include'} private field in Previous/Next`
          : nextIncluded
            ? `Exclude ${field.field.label} from Previous/Next`
            : `Include ${field.field.label} in Previous/Next`;
        trail.setAttribute('aria-label', trail.title);
        callbacks.onToggleUnlock(field.field.id);
      });
      controls.append(trail);
    }

    if (canSplit || isSplitField) {
      splitControls = document.createElement('span');
      splitControls.className = 'image-trail-panel__field-split-control';

      if (canSplit) {
        splitControls.classList.add('has-split-input');
        const splitLength = document.createElement('span');
        splitLength.className = 'image-trail-panel__field-split-length';
        splitLength.textContent = fieldSplitLengthLabel(field, model.privacyMode);
        splitLength.title = model.privacyMode ? 'Privacy mode is hiding this field length.' : 'Target length for the split pattern.';

        const splitPattern = document.createElement('input');
        splitPattern.type = 'text';
        splitPattern.inputMode = 'numeric';
        splitPattern.placeholder = '2-2-4';
        splitPattern.className = 'image-trail-panel__field-split-input';
        splitPattern.setAttribute(
          'aria-label',
          model.privacyMode ? 'Split pattern for private field' : `Split pattern for ${field.field.label}`,
        );

        const applySplit = document.createElement('button');
        applySplit.type = 'button';
        applySplit.className = 'image-trail-panel__field-split-button';
        applySplit.textContent = 'Split';
        applySplit.title = model.privacyMode ? 'Split private field' : `Split ${field.field.label}`;
        applySplit.setAttribute('aria-label', applySplit.title);
        applySplit.addEventListener('click', () => {
          valueCommitController.commitAndBlurFocusedValue();
          callbacks.onApplySplit(field.field.id, splitPattern.value);
        });
        splitPattern.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            callbacks.onApplySplit(field.field.id, splitPattern.value);
            splitPattern.blur();
          }
        });
        splitControls.append(splitLength, splitPattern, applySplit);
      }

      if (isSplitField && field.field.splitBaseId) {
        const clearSplit = document.createElement('button');
        clearSplit.type = 'button';
        clearSplit.className = 'image-trail-panel__field-split-button';
        clearSplit.textContent = 'Clear split';
        clearSplit.title = model.privacyMode
          ? 'Collapse private field back into one field'
          : `Collapse ${field.field.label} back into one field`;
        clearSplit.setAttribute('aria-label', clearSplit.title);
        clearSplit.addEventListener('click', () => {
          valueCommitController.commitAndBlurFocusedValue();
          callbacks.onClearSplit(field.field.splitBaseId ?? field.field.id);
        });
        splitControls.append(clearSplit);
      }
    }

    value.addEventListener('change', valueCommitController.handleChange);
    value.addEventListener('keydown', valueCommitController.handleKeydown);

    function createNumericDisplayModeButton(label: string, mode: NumericFieldDisplayMode): HTMLButtonElement {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `image-trail-panel__field-radix-button${numericDisplayMode === mode ? ' is-active' : ''}`;
      button.textContent = label;
      button.title = model.privacyMode ? `${label} display for private field` : `Show ${field.field.label} as ${label}`;
      button.setAttribute('aria-label', button.title);
      button.setAttribute('aria-pressed', String(numericDisplayMode === mode));
      button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
      });
      button.addEventListener('click', () => {
        if (model.privacyMode || numericDisplayMode === mode) return;
        numericDisplayMode = mode;
        callbacks.onNumericDisplayModeChange(field.field.id, mode);
        refreshNumericDisplayMode();
      });
      return button;
    }

    container.append(label, meta, controls);
    if (splitControls) container.append(splitControls);
    item.append(container);
    list.append(item);
  }
  if (model.rows.length === 0) {
    const item = document.createElement('li');
    item.className = 'image-trail-panel__field-empty';
    item.textContent = 'No parsed fields available yet.';
    list.append(item);
  }
  body.append(intro, list);
  wrapper.append(summary, body);
  return wrapper;
}
