import type { PanelAction, PanelState } from '../core/types.js';
import type { EditableField, NumericFieldDisplayMode } from './components/fields-view.js';
import { createFieldsView } from './components/fields-view.js';
import {
  parsedFieldResetAllAvailable,
  parsedFieldStructureResetAvailable,
  resettableFieldIdsForFields,
} from './panel/parsed-field-reset-baseline.js';

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

export function createParsedFieldsSection(
  editableFields: readonly EditableField[],
  state: PanelState,
  activeUrl: string,
  target: ParsedFieldsRenderTarget,
): HTMLElement {
  return createFieldsView(
    [...editableFields],
    state.activeFieldId,
    state.failedFieldId,
    state.successfulFieldIds,
    state.unchangedFieldIds,
    state.unlockedFieldIds,
    state.fieldDigitWidthSpecs,
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
      privacyMode: state.privacyModeEnabled,
      numericDisplayModes: target.layoutState.fieldDisplayModes,
      resettableFieldIds: resettableFieldIdsForFields(
        editableFields.map((field) => field.field),
        state,
        activeUrl,
      ),
      resetAllAvailable: parsedFieldResetAllAvailable(state, activeUrl),
      resetStructureAvailable: parsedFieldStructureResetAvailable(state, activeUrl),
      showFieldFailure: state.loadFailureFeedback !== 'mute',
    },
  );
}

export type { NumericFieldDisplayMode };
