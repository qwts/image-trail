import type { PanelState } from '../../core/types.js';
import type { FieldEditorViewModel } from '../field-editor-view-model.js';
import type { PanelRenderTarget } from '../panel-render-types.js';
import { createManualControlsView } from './manual-controls-view.js';

export function createManualControlsSection(
  target: PanelRenderTarget,
  state: PanelState,
  fieldEditor: Pick<FieldEditorViewModel, 'previousFieldId' | 'nextFieldId'>,
): HTMLElement {
  return createManualControlsView({
    state,
    previousFieldId: fieldEditor.previousFieldId,
    nextFieldId: fieldEditor.nextFieldId,
    dispatch: target.dispatch,
  });
}
