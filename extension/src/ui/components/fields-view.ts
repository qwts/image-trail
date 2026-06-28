import type { UrlField, UrlFieldDigitWidthSpec } from '../../core/url/types.js';

export interface EditableField {
  readonly field: UrlField;
  readonly value: string;
}

export interface FieldsViewCallbacks {
  readonly onValueChange: (fieldId: string, value: string) => void;
  readonly onStep: (fieldId: string, delta: 1 | -1) => void;
  readonly onDigitWidthChange: (fieldId: string, value: string) => void;
  readonly onActivate: (fieldId: string) => void;
  readonly onToggleUnlock: (fieldId: string) => void;
  readonly onApplySplit: (fieldId: string, pattern: string) => void;
  readonly onClearSplit: (baseFieldId: string) => void;
  readonly onOpenChange: (open: boolean, blockSize: number | null) => void;
  readonly onResize: (blockSize: number) => void;
}

export interface FieldsViewOptions {
  readonly open: boolean;
  readonly blockSize: number | null;
  readonly privacyMode?: boolean;
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

export function fieldReservesTrailControlSlot(field: UrlField): boolean {
  return field.location === 'query' && (field.tokenKind === 'int' || field.tokenKind === 'hex');
}

function commitAndBlurFocusedValue(input: HTMLInputElement, currentValue: string, privacyMode: boolean, commit: () => void): void {
  if (privacyMode || document.activeElement !== input) return;
  if (input.value !== currentValue) commit();
  input.blur();
}

export function createFieldsView(
  fields: EditableField[],
  activeFieldId: string | null,
  failedFieldId: string | null,
  successfulFieldIds: readonly string[],
  unchangedFieldIds: readonly string[],
  unlockedFieldIds: readonly string[],
  fieldDigitWidthSpecs: readonly UrlFieldDigitWidthSpec[],
  callbacks: FieldsViewCallbacks,
  options: FieldsViewOptions,
): HTMLElement {
  const wrapper = document.createElement('details');
  wrapper.className = 'image-trail-panel__section image-trail-panel__fields';
  if (options.privacyMode) wrapper.classList.add('is-privacy-masked');
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
  heading.textContent = 'Parsed fields';
  summary.append(heading);

  const body = document.createElement('div');
  body.className = 'image-trail-panel__fields-body';
  const intro = document.createElement('p');
  intro.className = 'image-trail-panel__meta';
  intro.textContent = options.privacyMode
    ? 'Parsed URL fields are hidden for screen sharing.'
    : fields.length
      ? `${fields.length} token${fields.length === 1 ? '' : 's'} parsed from the selected image URL.`
      : 'Select a target image to inspect its parsed URL tokens.';
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__field-list';
  for (const field of fields) {
    const item = document.createElement('li');
    item.className = 'image-trail-panel__field-item';
    const container = document.createElement('div');
    const isFailed = field.field.id === failedFieldId;
    const isSuccessful = successfulFieldIds.includes(field.field.id);
    const isUnchanged = unchangedFieldIds.includes(field.field.id);
    const isIncludedInTrail = unlockedFieldIds.includes(field.field.id);
    const isSplitField = field.field.splitBaseId !== undefined;
    const digitWidth = fieldDigitWidthSpecs.find((spec) => spec.fieldId === field.field.id)?.width;
    const reservesTrailControlSlot = fieldReservesTrailControlSlot(field.field);
    const canUnlock = (isSuccessful || isIncludedInTrail) && reservesTrailControlSlot;
    const canSplit = !isSplitField && field.value.length > 1;
    const fieldLabel = options.privacyMode ? 'Private field' : field.field.label;
    container.className = `image-trail-panel__field-row${field.field.id === activeFieldId ? ' is-active' : ''}${isSuccessful ? ' is-success' : ''}${isUnchanged ? ' is-unchanged' : ''}${isFailed ? ' is-error' : ''}`;

    const value = document.createElement('input');
    value.type = 'text';
    value.value = options.privacyMode ? 'Private value' : field.value;
    value.placeholder = fieldLabel;
    value.className = 'image-trail-panel__field-input';
    if (options.privacyMode) value.classList.add('is-privacy-masked');
    value.readOnly = options.privacyMode === true;
    value.title = options.privacyMode ? 'Privacy mode is hiding this URL field for screen sharing.' : field.value;
    value.setAttribute('aria-label', options.privacyMode ? 'Private URL field' : `Edit ${field.field.label}`);
    value.dataset.fieldId = field.field.id;
    let suppressedValueChange: string | null = null;
    const commitValueChange = (): void => {
      if (value.value === field.value) return;
      if (suppressedValueChange === value.value) return;
      suppressedValueChange = value.value;
      callbacks.onValueChange(field.field.id, value.value);
    };
    value.addEventListener('focus', () => {
      if (field.field.id !== activeFieldId) callbacks.onActivate(field.field.id);
    });

    const label = document.createElement('span');
    label.className = 'image-trail-panel__field-label';
    label.textContent = fieldLabel;
    label.title = options.privacyMode ? 'Privacy mode is hiding this field label for screen sharing.' : field.field.label;

    const meta = document.createElement('span');
    meta.className = 'image-trail-panel__field-meta';
    const statuses = [
      field.field.id === activeFieldId ? 'active' : '',
      isSuccessful ? 'loads' : '',
      isIncludedInTrail ? 'included' : '',
      isSplitField && field.field.splitPartIndex !== undefined && field.field.splitPartCount !== undefined
        ? `split ${field.field.splitPartIndex + 1}/${field.field.splitPartCount}`
        : '',
      isUnchanged ? 'unchanged' : '',
      isFailed ? 'failed load' : '',
    ].filter(Boolean);
    meta.textContent = options.privacyMode
      ? `Details hidden${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`
      : `${field.field.location} · ${field.field.tokenKind} · ${fieldDisplayValue(field)}${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`;
    meta.title = meta.textContent;

    const hasStepControls = field.field.tokenKind === 'int' || field.field.tokenKind === 'hex';
    const controls = document.createElement('span');
    controls.className = `image-trail-panel__field-control${hasStepControls ? ' has-step-controls' : ''}${reservesTrailControlSlot ? ' has-trail-control-slot' : ''}`;
    controls.append(value);
    let splitControls: HTMLSpanElement | null = null;

    if (hasStepControls) {
      const digitWidthDisplay = fieldDigitWidthInputDisplay(field.field, digitWidth, options.privacyMode === true);
      const digitWidthInput = document.createElement('input');
      digitWidthInput.type = 'text';
      digitWidthInput.inputMode = 'numeric';
      digitWidthInput.pattern = '[0-9]*';
      digitWidthInput.value = digitWidthDisplay.value;
      digitWidthInput.placeholder = digitWidthDisplay.placeholder;
      digitWidthInput.className = 'image-trail-panel__field-width-input';
      digitWidthInput.readOnly = options.privacyMode === true;
      digitWidthInput.title = options.privacyMode ? 'Privacy mode is hiding this digit width.' : `Digit width for ${field.field.label}`;
      digitWidthInput.setAttribute(
        'aria-label',
        options.privacyMode ? 'Private field digit width' : `Digit width for ${field.field.label}`,
      );
      digitWidthInput.addEventListener('change', () => {
        if (options.privacyMode) return;
        callbacks.onDigitWidthChange(field.field.id, digitWidthInput.value);
      });
      digitWidthInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (options.privacyMode) return;
          callbacks.onDigitWidthChange(field.field.id, digitWidthInput.value);
          digitWidthInput.blur();
        }
      });

      const decrement = document.createElement('button');
      decrement.type = 'button';
      decrement.className = 'image-trail-panel__field-step-button';
      decrement.textContent = '-';
      decrement.title = options.privacyMode ? 'Decrement private field' : `Decrement ${field.field.label}`;
      decrement.setAttribute('aria-label', decrement.title);
      decrement.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
      });
      decrement.addEventListener('click', () => {
        commitAndBlurFocusedValue(value, field.value, options.privacyMode === true, commitValueChange);
        callbacks.onStep(field.field.id, -1);
      });

      const increment = document.createElement('button');
      increment.type = 'button';
      increment.className = 'image-trail-panel__field-step-button';
      increment.textContent = '+';
      increment.title = options.privacyMode ? 'Increment private field' : `Increment ${field.field.label}`;
      increment.setAttribute('aria-label', increment.title);
      increment.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
      });
      increment.addEventListener('click', () => {
        commitAndBlurFocusedValue(value, field.value, options.privacyMode === true, commitValueChange);
        callbacks.onStep(field.field.id, 1);
      });

      controls.append(digitWidthInput, decrement, increment);
    }

    if (canUnlock) {
      const trail = document.createElement('button');
      trail.type = 'button';
      trail.className = `image-trail-panel__field-trail-button${isIncludedInTrail ? ' is-included' : ''}`;
      trail.textContent = isIncludedInTrail ? 'Exclude' : 'Include';
      trail.title = options.privacyMode
        ? `${isIncludedInTrail ? 'Exclude' : 'Include'} private field in Previous/Next`
        : isIncludedInTrail
          ? `Exclude ${field.field.label} from Previous/Next`
          : `Include ${field.field.label} in Previous/Next`;
      trail.setAttribute('aria-label', trail.title);
      trail.addEventListener('mousedown', (event) => {
        event.preventDefault();
      });
      trail.addEventListener('click', () => {
        commitAndBlurFocusedValue(value, field.value, options.privacyMode === true, commitValueChange);
        const nextIncluded = !trail.classList.contains('is-included');
        trail.classList.toggle('is-included', nextIncluded);
        trail.textContent = nextIncluded ? 'Exclude' : 'Include';
        trail.title = options.privacyMode
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
        const splitPattern = document.createElement('input');
        splitPattern.type = 'text';
        splitPattern.inputMode = 'numeric';
        splitPattern.placeholder = '2-2-4';
        splitPattern.className = 'image-trail-panel__field-split-input';
        splitPattern.setAttribute(
          'aria-label',
          options.privacyMode ? 'Split pattern for private field' : `Split pattern for ${field.field.label}`,
        );

        const applySplit = document.createElement('button');
        applySplit.type = 'button';
        applySplit.className = 'image-trail-panel__field-split-button';
        applySplit.textContent = 'Split';
        applySplit.title = options.privacyMode ? 'Split private field' : `Split ${field.field.label}`;
        applySplit.setAttribute('aria-label', applySplit.title);
        applySplit.addEventListener('click', () => {
          commitAndBlurFocusedValue(value, field.value, options.privacyMode === true, commitValueChange);
          callbacks.onApplySplit(field.field.id, splitPattern.value);
        });
        splitPattern.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            callbacks.onApplySplit(field.field.id, splitPattern.value);
            splitPattern.blur();
          }
        });
        splitControls.append(splitPattern, applySplit);
      }

      if (isSplitField && field.field.splitBaseId) {
        const clearSplit = document.createElement('button');
        clearSplit.type = 'button';
        clearSplit.className = 'image-trail-panel__field-split-button';
        clearSplit.textContent = 'Clear split';
        clearSplit.title = options.privacyMode
          ? 'Collapse private field back into one field'
          : `Collapse ${field.field.label} back into one field`;
        clearSplit.setAttribute('aria-label', clearSplit.title);
        clearSplit.addEventListener('click', () => {
          commitAndBlurFocusedValue(value, field.value, options.privacyMode === true, commitValueChange);
          callbacks.onClearSplit(field.field.splitBaseId ?? field.field.id);
        });
        splitControls.append(clearSplit);
      }
    }

    value.addEventListener('change', () => {
      if (options.privacyMode) return;
      if (suppressedValueChange === value.value) {
        suppressedValueChange = null;
        return;
      }
      callbacks.onValueChange(field.field.id, value.value);
    });
    value.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (options.privacyMode) return;
        commitValueChange();
        value.blur();
      }
    });

    container.append(label, meta, controls);
    if (splitControls) container.append(splitControls);
    item.append(container);
    list.append(item);
  }
  if (fields.length === 0) {
    const item = document.createElement('li');
    item.className = 'image-trail-panel__field-empty';
    item.textContent = 'No parsed fields available yet.';
    list.append(item);
  }
  body.append(intro, list);
  wrapper.append(summary, body);
  return wrapper;
}
