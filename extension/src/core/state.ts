import { createDisplayRecord } from './display-records.js';
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
  const selectedUrlChanged = target.selectedUrl !== null && target.selectedUrl !== state.target.selectedUrl;
  const history = selectedUrlChanged
    ? [
        createDisplayRecord({
          url: target.selectedUrl,
          timestamp: new Date(now).toISOString(),
          source: 'history',
        }),
        ...state.history.filter((item) => item.url !== target.selectedUrl),
      ].slice(0, 30)
    : state.history;

  return {
    ...state,
    status: target.picking ? 'picking' : 'ready',
    message: target.message,
    target,
    history,
    lastUpdatedAt: now,
  };
}
