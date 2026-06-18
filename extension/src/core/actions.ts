import { createDisplayRecord } from './display-records.js';
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
    case 'history/add-loaded': {
      const item = createDisplayRecord({ url: action.url, title: action.title, timestamp: action.timestamp, source: 'history' });
      return {
        ...state,
        history: [item, ...state.history.filter((entry) => entry.url !== item.url && entry.id !== item.id)].slice(0, 30),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'history/remove':
      return { ...state, history: state.history.filter((item) => item.id !== action.id), lastUpdatedAt: Date.now() };
    case 'bookmark/current':
      return state.target.selectedUrl
        ? {
            ...state,
            bookmarks: [
              {
                id: state.target.selectedUrl,
                url: state.target.selectedUrl,
                label: state.target.selectedUrl,
                timestamp: new Date().toISOString(),
                source: 'bookmark',
              },
              ...state.bookmarks.filter((item) => item.url !== state.target.selectedUrl),
            ],
            lastUpdatedAt: Date.now(),
          }
        : state;
    case 'bookmark/load': {
      const bookmark = state.bookmarks.find((item) => item.id === action.id);
      return bookmark ? { ...state, message: `Loaded bookmark: ${bookmark.url}`, lastUpdatedAt: Date.now() } : state;
    }
    case 'bookmark/remove':
      return { ...state, bookmarks: state.bookmarks.filter((item) => item.id !== action.id), lastUpdatedAt: Date.now() };
    case 'undo-last':
      return state;
  }
}
