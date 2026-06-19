import { createDisplayRecord } from './display-records.js';
import type { ImageDisplayRecord } from './display-records.js';
import { isCapturedResult } from './image/capture-result.js';
import { closePanel, EMPTY_AUTOMATION_STATE, showPanel } from './state.js';
import type { PanelAction, PanelState } from './types.js';

function updateRecordCapture(
  records: readonly ImageDisplayRecord[],
  sourceRecordId: string | undefined,
  blobId: string,
  capturedAt: string,
): readonly ImageDisplayRecord[] {
  if (!sourceRecordId) return records;
  return records.map((r) => (r.id === sourceRecordId ? { ...r, captureStatus: 'captured' as const, blobId, capturedAt } : r));
}

function clearRecordCapture(records: readonly ImageDisplayRecord[], id: string): readonly ImageDisplayRecord[] {
  return records.map((r) => (r.id === id ? { ...r, captureStatus: undefined, blobId: undefined } : r));
}

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
    case 'capture/request':
      return state;
    case 'capture/start':
      return { ...state, captureInProgress: true, captureResult: null, lastUpdatedAt: Date.now() };
    case 'capture/complete': {
      const now = new Date();
      const updated: PanelState = { ...state, captureInProgress: false, captureResult: action.result, lastUpdatedAt: now.getTime() };
      if (isCapturedResult(action.result) && action.sourceRecordId) {
        const capturedAt = now.toISOString();
        return {
          ...updated,
          history: updateRecordCapture(updated.history, action.sourceRecordId, action.result.blobId, capturedAt),
          bookmarks: updateRecordCapture(updated.bookmarks, action.sourceRecordId, action.result.blobId, capturedAt),
          message: `Captured ${(action.result.byteLength / 1024).toFixed(1)} KB image.`,
        };
      }
      return updated;
    }
    case 'capture/clear':
      return { ...state, captureResult: null, lastUpdatedAt: Date.now() };
    case 'capture/delete':
      return {
        ...state,
        history: clearRecordCapture(state.history, action.id),
        bookmarks: clearRecordCapture(state.bookmarks, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'storage/update':
      return { ...state, storageUsage: action.usage, lastUpdatedAt: Date.now() };
    case 'undo-last':
      return state;
    case 'slideshow-start':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'running', slideshowCount: 0 }, lastUpdatedAt: Date.now() };
    case 'slideshow-stop':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'stopped' }, lastUpdatedAt: Date.now() };
    case 'slideshow-pause':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'paused' }, lastUpdatedAt: Date.now() };
    case 'slideshow-resume':
      return { ...state, automation: { ...state.automation, slideshowPhase: 'running' }, lastUpdatedAt: Date.now() };
    case 'retry-start':
      return { ...state, automation: { ...state.automation, retryPhase: 'running', retriesUsed: 0 }, lastUpdatedAt: Date.now() };
    case 'retry-stop':
      return { ...state, automation: { ...state.automation, retryPhase: 'stopped' }, lastUpdatedAt: Date.now() };
    case 'navigate-next':
    case 'navigate-previous':
      return state;
    case 'stop-all':
      return { ...state, automation: { ...EMPTY_AUTOMATION_STATE }, lastUpdatedAt: Date.now() };
    default:
      return state;
  }
}
