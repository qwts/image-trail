import type { PanelState } from './types.js';

export function createInitialPanelState(now = Date.now()): PanelState {
  return { visible: false, status: 'idle', message: 'Image Trail is ready.', lastUpdatedAt: now };
}

export function showPanel(state: PanelState, now = Date.now()): PanelState {
  return { ...state, visible: true, status: 'ready', message: 'Panel connected. Message contracts are active.', lastUpdatedAt: now };
}

export function closePanel(state: PanelState, now = Date.now()): PanelState {
  return { ...state, visible: false, status: 'closed', message: 'Panel closed.', lastUpdatedAt: now };
}
