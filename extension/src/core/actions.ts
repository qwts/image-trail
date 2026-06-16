import { closePanel, showPanel } from './state.js';
import type { PanelAction, PanelState } from './types.js';

export function reducePanelAction(state: PanelState, action: PanelAction): PanelState {
  switch (action.name) {
    case 'toggle-panel':
      return state.visible ? closePanel(state) : showPanel(state);
    case 'close-panel':
      return closePanel(state);
    case 'ping-status':
      return { ...state, message: state.visible ? 'Panel is visible.' : 'Panel is hidden.', lastUpdatedAt: Date.now() };
  }
}
