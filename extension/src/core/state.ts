import type { PanelState, TargetState } from './types.js';

export const EMPTY_TARGET_STATE: TargetState = {
  mode: 'none',
  picking: false,
  candidateCount: 0,
  selectedUrl: null,
  selectedHandleId: null,
  selectedDimensions: null,
  message: 'No target selected.',
};

export function createInitialPanelState(now = Date.now()): PanelState {
  return {
    visible: false,
    status: 'idle',
    message: 'Image Trail is ready.',
    lastUpdatedAt: now,
    target: EMPTY_TARGET_STATE,
    history: [],
    bookmarks: [],
  };
}

export function showPanel(state: PanelState, now = Date.now()): PanelState {
  return { ...state, visible: true, status: 'ready', message: 'Panel connected. Target selection is ready.', lastUpdatedAt: now };
}

export function closePanel(state: PanelState, now = Date.now()): PanelState {
  return {
    ...state,
    visible: false,
    status: 'closed',
    message: 'Panel closed.',
    lastUpdatedAt: now,
    target: { ...state.target, picking: false },
  };
}

export function setTargetState(state: PanelState, target: TargetState, now = Date.now()): PanelState {
  return {
    ...state,
    status: target.picking ? 'picking' : 'ready',
    message: target.message,
    target,
    lastUpdatedAt: now,
  };
}
