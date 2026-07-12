import type { PanelAction, PanelState } from './types.js';
import { reducePanelSessionAction } from './actions/panel-session.js';
import { reduceParsedFieldsAction } from './actions/parsed-fields.js';
import { reduceQueueRecentsAction } from './actions/queue-recents.js';
import { isPanelActionForDomain } from './actions/routing.js';
import { reduceSettingsAction } from './actions/settings.js';

export {
  applyFieldLoadFailureToState,
  applyFieldSplitSpecToState,
  clearFieldSplitSpecFromState,
  pruneInvalidFieldSplitSpecsFromState,
} from './actions/parsed-fields.js';
export { PANEL_ACTION_DOMAINS } from './actions/routing.js';
export type { PanelActionDomain } from './actions/routing.js';

export function reducePanelAction(state: PanelState, action: PanelAction): PanelState {
  if (isPanelActionForDomain(action, 'parsed-fields')) return reduceParsedFieldsAction(state, action);
  if (isPanelActionForDomain(action, 'queue-recents')) return reduceQueueRecentsAction(state, action);
  if (isPanelActionForDomain(action, 'settings')) return reduceSettingsAction(state, action);
  if (isPanelActionForDomain(action, 'panel-session')) return reducePanelSessionAction(state, action);
  throw new Error(`Unrouted panel action: ${JSON.stringify(action)}`);
}
