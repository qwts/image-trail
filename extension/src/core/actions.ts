import { closePanel, showPanel } from './state.js';
import type { PanelAction, PanelState } from './types.js';

export function reducePanelAction(state: PanelState, action: PanelAction): PanelState {
  switch (action.name) {
    case 'toggle-panel':
      return state.visible ? closePanel(state) : showPanel(state);
    case 'close-panel':
      return closePanel(state);
    case 'ping-status':
      return { ...state, message: state.visible ? state.target.message : 'Panel is hidden.', lastUpdatedAt: Date.now() };
    case 'start-target-picker':
      return { ...state, status: 'picking', message: 'Pick mode is active. Click the intended image.', lastUpdatedAt: Date.now() };
    case 'stop-target-picker':
      return { ...state, status: 'ready', message: state.target.message, lastUpdatedAt: Date.now() };
  }
}
