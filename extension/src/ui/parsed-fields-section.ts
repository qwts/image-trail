import type { PanelAction } from '../core/types.js';
import type { NumericFieldDisplayMode } from './components/fields-view.js';
import { createFieldsView } from './components/fields-view.js';
import type { FieldEditorViewModel } from './field-editor-view-model.js';

export interface ParsedFieldsLayoutState {
  fieldsPanelOpen: boolean;
  fieldsPanelBlockSize: number | null;
  fieldDisplayModes: Map<string, NumericFieldDisplayMode>;
}

export interface ParsedFieldsRenderTarget {
  readonly dispatch: (action: PanelAction) => void;
  readonly layoutState: ParsedFieldsLayoutState;
}

const MIN_FIELDS_PANEL_BLOCK_SIZE = 160;

export function createParsedFieldsSection(model: FieldEditorViewModel, target: ParsedFieldsRenderTarget): HTMLElement {
  return createFieldsView(
    model,
    {
      onActivate: (fieldId) => target.dispatch({ name: 'active-field/set', id: fieldId }),
      onValueChange: (fieldId, value) => target.dispatch({ name: 'field/transform', fieldId, transformId: 'set-value', value }),
      onInvalidValueCommit: () => target.dispatch({ name: 'field/commit-rejected' }),
      onStep: (fieldId, delta) => target.dispatch({ name: 'field/transform', fieldId, transformId: 'step', delta }),
      onDigitWidthChange: (fieldId, value) => target.dispatch({ name: 'field/transform', fieldId, transformId: 'digit-width', value }),
      onToggleUnlock: (fieldId) => target.dispatch({ name: 'field-unlock/toggle', id: fieldId }),
      onNumericDisplayModeChange: (fieldId, mode) => {
        target.layoutState.fieldDisplayModes.set(fieldId, mode);
      },
      onApplySplit: (fieldId, pattern) => target.dispatch({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern }),
      onClearSplit: (baseFieldId) => target.dispatch({ name: 'field/transform', fieldId: baseFieldId, transformId: 'split-clear' }),
      onResetField: (fieldId) => target.dispatch({ name: 'field/transform', fieldId, transformId: 'reset-field' }),
      onResetStructure: () => target.dispatch({ name: 'field/transform', transformId: 'reset-structure' }),
      onResetAll: () => target.dispatch({ name: 'field/transform', transformId: 'reset-all' }),
      onOpenChange: (open, blockSize) => {
        target.layoutState.fieldsPanelOpen = open;
        target.layoutState.fieldsPanelBlockSize = blockSize;
      },
      onResize: (blockSize) => {
        target.layoutState.fieldsPanelBlockSize = Math.max(MIN_FIELDS_PANEL_BLOCK_SIZE, blockSize);
      },
    },
    {
      open: target.layoutState.fieldsPanelOpen,
      blockSize: target.layoutState.fieldsPanelBlockSize,
      numericDisplayModes: target.layoutState.fieldDisplayModes,
    },
  );
}

export type { NumericFieldDisplayMode };
