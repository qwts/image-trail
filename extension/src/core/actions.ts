import { createDisplayRecord } from './display-records.js';
import type { ImageDisplayRecord } from './display-records.js';
import type { CaptureResult } from './image/capture-result.js';
import { isCapturedResult } from './image/capture-result.js';
import { closePanel, EMPTY_AUTOMATION_STATE, showPanel } from './state.js';
import type { PanelAction, PanelState } from './types.js';
import type { UrlFieldSplitSpec } from './url/types.js';

function updateRecordCapture(
  records: readonly ImageDisplayRecord[],
  sourceRecordId: string | undefined,
  result: CaptureResult & { status: 'captured' },
  capturedAt: string,
): readonly ImageDisplayRecord[] {
  if (!sourceRecordId) return records;
  return records.map((r) =>
    r.id === sourceRecordId
      ? {
          ...r,
          captureStatus: 'captured' as const,
          blobId: result.blobId,
          capturedAt,
          storedOriginal: {
            blobId: result.blobId,
            mimeType: result.mimeType,
            byteLength: result.byteLength,
            capturedAt,
          },
        }
      : r,
  );
}

function clearRecordCapture(records: readonly ImageDisplayRecord[], id: string): readonly ImageDisplayRecord[] {
  return records.map((r) => (r.id === id ? { ...r, captureStatus: undefined, blobId: undefined, storedOriginal: undefined } : r));
}

function toggleItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function addItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items : [...items, item];
}

function removeItem(items: readonly string[], item: string): readonly string[] {
  return items.filter((value) => value !== item);
}

function removeItems(items: readonly string[], removals: readonly string[]): readonly string[] {
  if (removals.length === 0) return items;
  const removalSet = new Set(removals);
  return items.filter((item) => !removalSet.has(item));
}

function splitFieldIds(spec: UrlFieldSplitSpec): readonly string[] {
  const prefix = spec.location === 'path' ? `p:${spec.partIndex}` : `q:${spec.queryIndex}`;
  return spec.lengths.map((_, index) => `${prefix}:${spec.tokenIndex + index}`);
}

function affectedSplitFieldIds(specs: readonly UrlFieldSplitSpec[]): readonly string[] {
  return [...new Set(specs.flatMap((spec) => [spec.baseFieldId, ...splitFieldIds(spec)]))];
}

function clearFieldMarkers(state: PanelState, fieldIds: readonly string[]): PanelState {
  if (fieldIds.length === 0) return state;
  return {
    ...state,
    failedFieldId: state.failedFieldId && fieldIds.includes(state.failedFieldId) ? null : state.failedFieldId,
    successfulFieldIds: removeItems(state.successfulFieldIds, fieldIds),
    unchangedFieldIds: removeItems(state.unchangedFieldIds, fieldIds),
    unlockedFieldIds: removeItems(state.unlockedFieldIds, fieldIds),
    manuallyExcludedFieldIds: removeItems(state.manuallyExcludedFieldIds, fieldIds),
    activeFieldId: state.activeFieldId && fieldIds.includes(state.activeFieldId) ? null : state.activeFieldId,
  };
}

export function applyFieldSplitSpecToState(state: PanelState, spec: UrlFieldSplitSpec): PanelState {
  const existing = state.fieldSplitSpecs.find((candidate) => candidate.baseFieldId === spec.baseFieldId);
  const marked = clearFieldMarkers(state, affectedSplitFieldIds(existing ? [existing, spec] : [spec]));
  return {
    ...marked,
    fieldSplitSpecs: [...state.fieldSplitSpecs.filter((candidate) => candidate.baseFieldId !== spec.baseFieldId), spec],
    message: `Split pattern ${spec.pattern} applied.`,
    status: 'ready',
    lastUpdatedAt: Date.now(),
  };
}

export function clearFieldSplitSpecFromState(state: PanelState, baseFieldId: string): PanelState {
  const existing = state.fieldSplitSpecs.find((spec) => spec.baseFieldId === baseFieldId);
  const marked = existing ? clearFieldMarkers(state, affectedSplitFieldIds([existing])) : state;
  return {
    ...marked,
    fieldSplitSpecs: state.fieldSplitSpecs.filter((spec) => spec.baseFieldId !== baseFieldId),
    message: existing ? 'Split pattern cleared.' : state.message,
    status: existing ? 'ready' : state.status,
    lastUpdatedAt: Date.now(),
  };
}

export function applyFieldLoadFailureToState(
  state: PanelState,
  input: { readonly draftUrl: string; readonly attemptedFieldIds: readonly string[]; readonly message: string },
): PanelState {
  return {
    ...state,
    draftUrl: input.draftUrl,
    failedFieldId: input.attemptedFieldIds[0] ?? null,
    unchangedFieldIds: removeItems(state.unchangedFieldIds, input.attemptedFieldIds),
    message: input.message,
    status: 'error',
    lastUpdatedAt: Date.now(),
  };
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
    case 'target/release':
      return state;
    case 'history/add-loaded': {
      const item = createDisplayRecord({
        url: action.url,
        title: action.title,
        timestamp: action.timestamp,
        thumbnail: action.thumbnail,
        source: 'history',
      });
      return {
        ...state,
        history: [item, ...state.history.filter((entry) => entry.url !== item.url && entry.id !== item.id)].slice(0, 30),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'history/remove':
      return { ...state, history: state.history.filter((item) => item.id !== action.id), lastUpdatedAt: Date.now() };
    case 'active-field/set':
      return {
        ...state,
        activeFieldId: action.id,
        failedFieldId: action.id === state.failedFieldId ? state.failedFieldId : null,
        lastUpdatedAt: Date.now(),
      };
    case 'field-unlock/toggle':
      if (!state.successfulFieldIds.includes(action.id)) {
        return { ...state, lastUpdatedAt: Date.now() };
      }
      return {
        ...state,
        unlockedFieldIds: toggleItem(state.unlockedFieldIds, action.id),
        manuallyExcludedFieldIds: state.unlockedFieldIds.includes(action.id)
          ? addItem(state.manuallyExcludedFieldIds, action.id)
          : removeItem(state.manuallyExcludedFieldIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'field-split/apply':
      return state;
    case 'field-split/clear':
      return clearFieldSplitSpecFromState(state, action.baseFieldId);
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
    case 'bookmarks/page-loaded':
      return {
        ...state,
        bookmarks: action.bookmarks,
        bookmarkOffset: action.offset,
        bookmarkLimit: action.limit,
        bookmarkTotal: action.total,
        hasOlderBookmarks: action.hasOlder,
        hasNewerBookmarks: action.hasNewer,
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/toggle-scope':
      return {
        ...state,
        bookmarkVisibilityScope: state.bookmarkVisibilityScope === 'global' ? 'site' : 'global',
        bookmarkOffset: 0,
        lastUpdatedAt: Date.now(),
      };
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
          history: updateRecordCapture(updated.history, action.sourceRecordId, action.result, capturedAt),
          bookmarks: updateRecordCapture(updated.bookmarks, action.sourceRecordId, action.result, capturedAt),
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
    case 'blob-key/status':
      return {
        ...state,
        blobKeyUnlocked: action.unlocked,
        blobKeyAvailable: action.unlocked || action.hasKey === true,
        blobKeyReference: action.unlocked ? (action.keyReference ?? state.blobKeyReference) : null,
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/start':
      return {
        ...state,
        importExportBusy: true,
        importExportMessage: 'Import/export is running...',
        importExportMessageIsError: false,
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/complete':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.message,
        importExportMessageIsError: false,
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/error':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.message,
        importExportMessageIsError: true,
        message: action.message,
        status: 'error',
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
