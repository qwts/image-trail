import type { FieldEditorViewModel } from '../field-editor-view-model.js';
import { createFieldRow, type FieldRowCallbacks } from './field-row.js';
import type { NumericFieldDisplayMode } from './field-value-commit-controller.js';
import { createFieldsResetControls } from './fields-reset-controls.js';

export { type NumericFieldDisplayMode, numericFieldCommitValue } from './field-value-commit-controller.js';
export {
  defaultNumericFieldDisplayMode,
  fieldDigitWidthInputDisplay,
  fieldDisplayValue,
  fieldReservesTrailControlSlot,
  fieldSplitLengthLabel,
  numericFieldInputDisplayValue,
} from './field-row.js';
export type { EditableField } from './field-row.js';

export interface FieldsViewCallbacks extends FieldRowCallbacks {
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
  summary.append(heading, createActiveFieldSummary(model));
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
    list.append(
      createFieldRow(
        {
          row,
          privacyMode: model.privacyMode,
          numericDisplayMode: options.numericDisplayModes?.get(row.field.id),
        },
        callbacks,
      ),
    );
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

function createActiveFieldSummary(model: FieldEditorViewModel): HTMLElement {
  const summary = document.createElement('span');
  summary.className = 'image-trail-ds__field-summary';
  const active = model.activeField;
  if (active) {
    summary.dataset['state'] = active.status.failureVisible ? 'error' : 'active';
    summary.textContent = model.privacyMode
      ? `Private field · ${active.position}/${active.count}`
      : `${active.label} · ${active.position}/${active.count}`;
  } else {
    summary.dataset['state'] = model.collapsedSummary.failureVisible ? 'error' : 'default';
    summary.textContent = `${model.collapsedSummary.fieldCount} field${model.collapsedSummary.fieldCount === 1 ? '' : 's'}`;
  }
  summary.title = summary.textContent;
  return summary;
}
