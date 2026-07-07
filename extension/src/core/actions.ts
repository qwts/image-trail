import { createDisplayRecord } from './display-records.js';
import type { ImageDisplayRecord } from './display-records.js';
import type { CaptureResult } from './image/capture-result.js';
import { isCapturedResult } from './image/capture-result.js';
import { closePanel, EMPTY_AUTOMATION_STATE, showPanel } from './state.js';
import type { PanelAction, PanelState } from './types.js';
import { validFieldSplitSpecsForModel } from './url/field-splits.js';
import { updateGrabSourcePatternSettings, updateTemplateSettings } from './url/templates.js';
import type { ParsedUrlModel, UrlFieldSplitSpec } from './url/types.js';

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
function updateRecordPinned(
  records: readonly ImageDisplayRecord[],
  sourceRecordId: string,
  pinnedAt: string,
  pinnedRecordId: string,
): readonly ImageDisplayRecord[] {
  return records.map((record) => (record.id === sourceRecordId ? { ...record, pinnedAt, pinnedRecordId } : record));
}

function syncHistoryWithBookmarks(
  history: readonly ImageDisplayRecord[],
  bookmarks: readonly ImageDisplayRecord[],
): readonly ImageDisplayRecord[] {
  if (history.length === 0 || bookmarks.length === 0) return history;
  const bookmarksById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  const bookmarksByUrl = new Map(bookmarks.map((bookmark) => [bookmark.url, bookmark]));
  return history.map((record) => {
    const linkedBookmark = record.pinnedRecordId ? bookmarksById.get(record.pinnedRecordId) : undefined;
    const urlBookmark = linkedBookmark ?? bookmarksByUrl.get(record.url);
    if (!urlBookmark) return record;
    const pinnedAt = record.pinnedAt ?? urlBookmark.timestamp;
    const pinnedRecordId = record.pinnedRecordId ?? urlBookmark.id;
    if (linkedBookmark) {
      return {
        ...record,
        pinnedAt,
        pinnedRecordId,
        captureStatus: linkedBookmark.captureStatus,
        blobId: linkedBookmark.blobId,
        capturedAt: linkedBookmark.capturedAt,
        storedOriginal: linkedBookmark.storedOriginal,
      };
    }
    if (urlBookmark.captureStatus !== 'captured') return { ...record, pinnedAt, pinnedRecordId };
    return {
      ...record,
      pinnedAt,
      pinnedRecordId,
      captureStatus: urlBookmark.captureStatus,
      blobId: urlBookmark.blobId,
      capturedAt: urlBookmark.capturedAt,
      storedOriginal: urlBookmark.storedOriginal,
    };
  });
}

function captureMatchesRecord(record: ImageDisplayRecord, id: string, blobId?: string): boolean {
  return (
    record.id === id ||
    (blobId !== undefined &&
      (record.blobId === blobId || record.storedOriginal?.blobId === blobId || record.protectedPin?.storedOriginalBlobId === blobId))
  );
}

function clearRecordCapture<T extends ImageDisplayRecord>(records: readonly T[], id: string, blobId?: string): readonly T[] {
  return records.map((record) => {
    if (!captureMatchesRecord(record, id, blobId)) return record;
    const protectedPin = record.protectedPin
      ? { ...record.protectedPin, storedOriginalBlobId: undefined, hasStoredOriginal: false }
      : undefined;
    return {
      ...record,
      captureStatus: undefined,
      blobId: undefined,
      capturedAt: undefined,
      storedOriginal: undefined,
      protectedPin,
    } as T;
  });
}

function clearRecallCandidateCapture(state: PanelState['recall'], id: string, blobId?: string): PanelState['recall'] {
  return {
    ...state,
    candidates: clearRecordCapture(state.candidates, id, blobId),
  };
}

function unlinkHistoryFromBookmark(history: readonly ImageDisplayRecord[], bookmarkId: string): readonly ImageDisplayRecord[] {
  return history.map((record) => {
    if (record.pinnedRecordId !== bookmarkId) return record;
    return {
      ...record,
      pinnedAt: undefined,
      pinnedRecordId: undefined,
      captureStatus: undefined,
      blobId: undefined,
      capturedAt: undefined,
      storedOriginal: undefined,
    };
  });
}

function removeRecallCandidate(state: PanelState['recall'], id: string): PanelState['recall'] {
  const candidates = state.candidates.filter((candidate) => candidate.id !== id);
  if (candidates.length === state.candidates.length) return state;
  const removedCount = state.candidates.length - candidates.length;
  return {
    ...state,
    candidates,
    selectedIds: removeItem(state.selectedIds, id),
    nextOffset: Math.max(0, state.nextOffset - removedCount),
    total: Math.max(0, state.total - removedCount),
  };
}

function toggleItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function addItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items : [...items, item];
}

function addItems(items: readonly string[], additions: readonly string[]): readonly string[] {
  if (additions.length === 0) return items;
  const next = [...items];
  for (const item of additions) {
    if (!next.includes(item)) next.push(item);
  }
  return next;
}

function uniqueItems(items: readonly string[]): readonly string[] {
  return [...new Set(items)];
}

function removeItem(items: readonly string[], item: string): readonly string[] {
  return items.filter((value) => value !== item);
}

function removeItems(items: readonly string[], removals: readonly string[]): readonly string[] {
  if (removals.length === 0) return items;
  const removalSet = new Set(removals);
  return items.filter((item) => !removalSet.has(item));
}

function keepItems(items: readonly string[], allowedItems: readonly string[]): readonly string[] {
  if (items.length === 0) return items;
  const allowed = new Set(allowedItems);
  return items.filter((item) => allowed.has(item));
}

function visibleRecentHistory(records: readonly ImageDisplayRecord[], limit: number): readonly ImageDisplayRecord[] {
  return records.slice(0, limit);
}

function mergeRecordsById<T extends { readonly id: string }>(existing: readonly T[], additions: readonly T[]): readonly T[] {
  if (additions.length === 0) return existing;
  const seen = new Set(existing.map((item) => item.id));
  return [...existing, ...additions.filter((item) => !seen.has(item.id))];
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
    fieldDigitWidthSpecs: state.fieldDigitWidthSpecs.filter((spec) => !fieldIds.includes(spec.fieldId)),
    activeFieldId: state.activeFieldId && fieldIds.includes(state.activeFieldId) ? null : state.activeFieldId,
  };
}

export function applyFieldSplitSpecToState(state: PanelState, spec: UrlFieldSplitSpec): PanelState {
  const existing = state.fieldSplitSpecs.find((candidate) => candidate.baseFieldId === spec.baseFieldId);
  if (existing && fieldSplitSpecsEqual(existing, spec)) return state;
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
  if (!existing) return state;
  const marked = existing ? clearFieldMarkers(state, affectedSplitFieldIds([existing])) : state;
  return {
    ...marked,
    fieldSplitSpecs: state.fieldSplitSpecs.filter((spec) => spec.baseFieldId !== baseFieldId),
    message: existing ? 'Split pattern cleared.' : state.message,
    status: existing ? 'ready' : state.status,
    lastUpdatedAt: Date.now(),
  };
}

function fieldSplitSpecsEqual(left: UrlFieldSplitSpec, right: UrlFieldSplitSpec): boolean {
  return (
    left.baseFieldId === right.baseFieldId &&
    left.location === right.location &&
    left.partIndex === right.partIndex &&
    left.queryIndex === right.queryIndex &&
    left.tokenIndex === right.tokenIndex &&
    left.pattern === right.pattern &&
    left.lengths.length === right.lengths.length &&
    left.lengths.every((length, index) => length === right.lengths[index])
  );
}

export function pruneInvalidFieldSplitSpecsFromState(state: PanelState, model: ParsedUrlModel): PanelState {
  const validSpecs = validFieldSplitSpecsForModel(model, state.fieldSplitSpecs);
  if (validSpecs.length === state.fieldSplitSpecs.length) return state;

  const validBaseIds = new Set(validSpecs.map((spec) => spec.baseFieldId));
  const removedSpecs = state.fieldSplitSpecs.filter((spec) => !validBaseIds.has(spec.baseFieldId));
  const marked = clearFieldMarkers(state, affectedSplitFieldIds(removedSpecs));
  return {
    ...marked,
    fieldSplitSpecs: validSpecs,
    message: removedSpecs.length === 1 ? 'Cleared stale split pattern.' : `Cleared ${removedSpecs.length} stale split patterns.`,
    status: 'ready',
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
    case 'panel/minimize':
      return { ...state, visible: true, minimized: true, lastUpdatedAt: Date.now() };
    case 'panel/expand':
      return { ...state, visible: true, minimized: false, lastUpdatedAt: Date.now() };
    case 'panel/secondary-controls-open':
      if (state.secondaryControlsOpen === action.open) return state;
      return { ...state, secondaryControlsOpen: action.open, lastUpdatedAt: Date.now() };
    case 'panel/history-section-open':
      return { ...state, historySectionOpen: action.open, lastUpdatedAt: Date.now() };
    case 'panel/bookmarks-section-open':
      return { ...state, bookmarksSectionOpen: action.open, lastUpdatedAt: Date.now() };
    case 'start-target-picker':
      return { ...state, status: 'picking', message: 'Pick mode is active. Click the intended image.', lastUpdatedAt: Date.now() };
    case 'stop-target-picker':
      return { ...state, status: 'ready', message: state.target.message, lastUpdatedAt: Date.now() };
    case 'grab-mode/start':
      return {
        ...state,
        status: 'ready',
        message: 'Grab Mode is active. Click page images to add them to the queue.',
        lastUpdatedAt: Date.now(),
      };
    case 'grab-mode/stop':
      return { ...state, status: 'ready', message: 'Grab Mode stopped.', lastUpdatedAt: Date.now() };
    case 'target/release':
      return state;
    case 'history/add-loaded': {
      const existing = state.history.find((entry) => entry.url === action.url);
      const item = createDisplayRecord({
        ...existing,
        url: action.url,
        title: action.title ?? existing?.title,
        timestamp: action.timestamp,
        thumbnail: action.thumbnail ?? existing?.thumbnail,
        width: action.width ?? existing?.width,
        height: action.height ?? existing?.height,
        source: 'history',
      });
      const history = visibleRecentHistory(
        [item, ...state.history.filter((entry) => entry.url !== item.url && entry.id !== item.id)],
        state.recentHistoryLimit,
      );
      return {
        ...state,
        history,
        selectedHistoryIds: keepItems(
          state.selectedHistoryIds,
          history.map((entry) => entry.id),
        ),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'history/remove':
      return {
        ...state,
        history: state.history.filter((item) => item.id !== action.id),
        selectedHistoryIds: removeItem(state.selectedHistoryIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'history/pin':
      return state;
    case 'history/mark-pinned':
      return {
        ...state,
        history: updateRecordPinned(state.history, action.id, action.pinnedAt, action.pinnedRecordId),
        lastUpdatedAt: Date.now(),
      };
    case 'history/delete-all':
      return {
        ...state,
        history: [],
        selectedHistoryIds: [],
        lastUpdatedAt: Date.now(),
      };
    case 'selection/select-visible':
      return {
        ...state,
        selectedHistoryIds: state.history.map((item) => item.id),
        selectedBookmarkIds: state.bookmarks.map((item) => item.id),
        recall: {
          ...state.recall,
          selectedIds: state.recall.open ? state.recall.candidates.map((candidate) => candidate.id) : [],
        },
        lastUpdatedAt: Date.now(),
      };
    case 'history-selection/toggle':
      return {
        ...state,
        selectedHistoryIds: toggleItem(state.selectedHistoryIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'history-selection/select':
      return {
        ...state,
        selectedHistoryIds: action.mode === 'add' ? addItems(state.selectedHistoryIds, action.ids) : uniqueItems(action.ids),
        lastUpdatedAt: Date.now(),
      };
    case 'history-selection/clear':
      return { ...state, selectedHistoryIds: [], lastUpdatedAt: Date.now() };
    case 'recall/open':
      return {
        ...state,
        recall: { ...state.recall, open: true, side: action.side, message: undefined, messageIsError: false },
        lastUpdatedAt: Date.now(),
      };
    case 'recall/close':
      return { ...state, recall: { ...state.recall, open: false, selectedIds: [] }, lastUpdatedAt: Date.now() };
    case 'recall/load-start':
      return {
        ...state,
        recall: { ...state.recall, busy: true, message: 'Loading recall records...', messageIsError: false },
        lastUpdatedAt: Date.now(),
      };
    case 'recall/load-complete': {
      const candidates = action.append ? mergeRecordsById(state.recall.candidates, action.candidates) : action.candidates;
      return {
        ...state,
        recall: {
          ...state.recall,
          busy: false,
          candidates,
          selectedIds: keepItems(
            state.recall.selectedIds,
            candidates.map((candidate) => candidate.id),
          ),
          offset: action.offset,
          nextOffset: action.nextOffset,
          hasMore: action.hasMore,
          total: action.total,
          failedCount: action.failedCount,
          message: action.message,
          messageIsError: false,
        },
        lastUpdatedAt: Date.now(),
      };
    }
    case 'recall/error':
      return {
        ...state,
        recall: { ...state.recall, busy: false, message: action.message, messageIsError: true },
        status: 'error',
        message: action.message,
        lastUpdatedAt: Date.now(),
      };
    case 'recall/message-clear':
      if (state.recall.message !== action.message || state.recall.messageIsError) return state;
      return {
        ...state,
        recall: { ...state.recall, message: undefined, messageIsError: false },
        lastUpdatedAt: Date.now(),
      };
    case 'recall-selection/toggle':
      return {
        ...state,
        recall: { ...state.recall, selectedIds: toggleItem(state.recall.selectedIds, action.id) },
        lastUpdatedAt: Date.now(),
      };
    case 'recall-selection/select':
      return {
        ...state,
        recall: {
          ...state.recall,
          selectedIds: action.mode === 'add' ? addItems(state.recall.selectedIds, action.ids) : uniqueItems(action.ids),
        },
        lastUpdatedAt: Date.now(),
      };
    case 'recall-selection/clear':
      return { ...state, recall: { ...state.recall, selectedIds: [] }, lastUpdatedAt: Date.now() };
    case 'recall/clear-results':
      return {
        ...state,
        recall: {
          ...state.recall,
          candidates: [],
          selectedIds: [],
          offset: 0,
          nextOffset: 0,
          hasMore: false,
          total: 0,
          failedCount: 0,
          message: undefined,
          messageIsError: false,
        },
        lastUpdatedAt: Date.now(),
      };
    case 'recall/complete': {
      return {
        ...state,
        recall: {
          ...state.recall,
          busy: false,
          selectedIds: [],
          message: action.message,
          messageIsError: action.records.length === 0 || action.failedCount > 0,
        },
        status: action.records.length === 0 ? 'error' : 'ready',
        message: action.message,
        lastUpdatedAt: Date.now(),
      };
    }
    case 'active-field/set': {
      const failedFieldId = action.id === state.failedFieldId ? state.failedFieldId : null;
      if (state.activeFieldId === action.id && state.failedFieldId === failedFieldId) return state;
      return {
        ...state,
        activeFieldId: action.id,
        failedFieldId,
        lastUpdatedAt: Date.now(),
      };
    }
    case 'field-unlock/toggle':
      if (!state.successfulFieldIds.includes(action.id) && !state.unlockedFieldIds.includes(action.id)) return state;
      return {
        ...state,
        unlockedFieldIds: toggleItem(state.unlockedFieldIds, action.id),
        manuallyExcludedFieldIds: state.unlockedFieldIds.includes(action.id)
          ? addItem(state.manuallyExcludedFieldIds, action.id)
          : removeItem(state.manuallyExcludedFieldIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'field/transform':
      return action.transformId === 'split-clear' ? clearFieldSplitSpecFromState(state, action.fieldId) : state;
    case 'pin/current':
    case 'bookmark/current':
      if (!state.target.selectedUrl) return state;
      {
        const bookmarks = [
          {
            id: state.target.selectedUrl,
            url: state.target.selectedUrl,
            label: state.target.selectedUrl,
            timestamp: new Date().toISOString(),
            source: 'bookmark' as const,
          },
          ...state.bookmarks.filter((item) => item.url !== state.target.selectedUrl),
        ];
        return {
          ...state,
          bookmarks,
          selectedBookmarkIds: keepItems(
            state.selectedBookmarkIds,
            bookmarks.map((bookmark) => bookmark.id),
          ),
          lastUpdatedAt: Date.now(),
        };
      }
    case 'bookmark/load': {
      const bookmark = state.bookmarks.find((item) => item.id === action.id);
      return bookmark ? { ...state, message: `Loaded bookmark: ${bookmark.url}`, lastUpdatedAt: Date.now() } : state;
    }
    case 'bookmark/remove':
      return {
        ...state,
        bookmarks: state.bookmarks.filter((item) => item.id !== action.id),
        history: unlinkHistoryFromBookmark(state.history, action.id),
        recall: removeRecallCandidate(state.recall, action.id),
        selectedBookmarkIds: removeItem(state.selectedBookmarkIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmark/clear':
      return {
        ...state,
        bookmarks: state.bookmarks.filter((item) => item.id !== action.id),
        selectedBookmarkIds: removeItem(state.selectedBookmarkIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmark-selection/toggle':
      return {
        ...state,
        selectedBookmarkIds: toggleItem(state.selectedBookmarkIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmark-selection/single':
      return {
        ...state,
        selectedBookmarkIds: [action.id],
        selectedHistoryIds: [],
        lastUpdatedAt: Date.now(),
      };
    case 'bookmark-selection/clear':
      return { ...state, selectedBookmarkIds: [], lastUpdatedAt: Date.now() };
    case 'bookmark-selection/select':
      return {
        ...state,
        selectedBookmarkIds: action.mode === 'add' ? addItems(state.selectedBookmarkIds, action.ids) : uniqueItems(action.ids),
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/page-loaded':
      return {
        ...state,
        bookmarks: action.bookmarks,
        history: syncHistoryWithBookmarks(state.history, action.bookmarks),
        selectedBookmarkIds: keepItems(
          state.selectedBookmarkIds,
          action.bookmarks.map((bookmark) => bookmark.id),
        ),
        bookmarkOffset: action.offset,
        bookmarkLimit: action.limit,
        bookmarkTotal: action.total,
        hasOlderBookmarks: action.hasOlder,
        hasNewerBookmarks: action.hasNewer,
        lastUpdatedAt: Date.now(),
      };
    case 'bookmarks/clear-visible': {
      const visibleIds = state.bookmarks.map((bookmark) => bookmark.id);
      return {
        ...state,
        bookmarks: [],
        selectedBookmarkIds: state.selectedBookmarkIds.filter((id) => !visibleIds.includes(id)),
        bookmarkOffset: 0,
        bookmarkTotal: 0,
        hasOlderBookmarks: false,
        hasNewerBookmarks: false,
        lastUpdatedAt: Date.now(),
      };
    }
    case 'bookmarks/toggle-scope':
      return {
        ...state,
        bookmarkVisibilityScope: state.bookmarkVisibilityScope === 'global' ? 'site' : 'global',
        bookmarkOffset: 0,
        lastUpdatedAt: Date.now(),
      };
    case 'settings/toggle':
      return { ...state, settingsOpen: !state.settingsOpen, lastUpdatedAt: Date.now() };
    case 'help/toggle':
      return { ...state, helpOpen: !state.helpOpen, lastUpdatedAt: Date.now() };
    case 'section/detach':
      if (state.detachedSections.includes(action.sectionId)) return state;
      return { ...state, detachedSections: [...state.detachedSections, action.sectionId], lastUpdatedAt: Date.now() };
    case 'section/restore':
      if (!state.detachedSections.includes(action.sectionId)) return state;
      return {
        ...state,
        detachedSections: state.detachedSections.filter((sectionId) => sectionId !== action.sectionId),
        lastUpdatedAt: Date.now(),
      };
    case 'settings/update-visible-bookmark-soft-max':
      return { ...state, bookmarkLimit: action.value, bookmarkOffset: 0, lastUpdatedAt: Date.now() };
    case 'settings/update-recent-history-retention': {
      const history = visibleRecentHistory(state.history, action.limit);
      return {
        ...state,
        recentHistoryLimit: action.limit,
        recentHistoryRetainedLimit: action.retainedLimit,
        recentHistoryOverflowBehavior: action.overflowBehavior,
        history,
        selectedHistoryIds: keepItems(
          state.selectedHistoryIds,
          history.map((item) => item.id),
        ),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'settings/update-recent-sparse-row-display-mode':
      return { ...state, recentSparseRowDisplayMode: action.mode, lastUpdatedAt: Date.now() };
    case 'settings/update-pin-save-storage-preference':
      return { ...state, pinSaveStoragePreference: action.value, lastUpdatedAt: Date.now() };
    case 'settings/update-privacy-mode':
      return { ...state, privacyModeEnabled: action.enabled, lastUpdatedAt: Date.now() };
    case 'settings/update-metadata-policy':
      return { ...state, searchableMetadataPolicy: action.policy, lastUpdatedAt: Date.now() };
    case 'settings/update-build-info-overlay-visibility':
      return { ...state, buildInfoOverlayVisible: action.visible, lastUpdatedAt: Date.now() };
    case 'settings/update-url-review-status-retention':
      return {
        ...state,
        urlReviewStatusLimit: action.limit,
        clearUrlReviewStatusAfterExport: action.clearAfterExport,
        lastUpdatedAt: Date.now(),
      };
    case 'settings/update-request-throttle':
      return {
        ...state,
        requestThrottleMs: action.minimumIntervalMs,
        requestThrottleMaxRequests: action.maxRequests,
        requestThrottleWindowMs: action.windowMs,
        lastUpdatedAt: Date.now(),
      };
    case 'settings/update-neighbor-preload':
      return {
        ...state,
        neighborPreloadEnabled: action.enabled,
        neighborPreloadRadius: action.radius,
        neighborPreloadCacheLimit: action.cacheLimit,
        neighborPreloadProbeMethod: action.probeMethod,
        loadFailureFeedback: action.loadFailureFeedback,
        lastUpdatedAt: Date.now(),
      };
    case 'url-templates/load': {
      const previousActiveTemplate = state.urlTemplates.find((template) => template.id === state.activeUrlTemplateId);
      const preservedFailedDraftTemplate =
        state.status === 'error' && state.draftUrl && previousActiveTemplate
          ? action.templates.find((template) => template.id === previousActiveTemplate.id)
          : undefined;
      const activeTemplate = action.templates.find((template) => template.id === action.activeTemplateId) ?? preservedFailedDraftTemplate;
      const previousActiveFieldIds =
        !activeTemplate && previousActiveTemplate ? previousActiveTemplate.fields.map((field) => field.id) : [];
      return {
        ...state,
        urlTemplates: action.templates,
        activeUrlTemplateId: activeTemplate?.id ?? null,
        unlockedFieldIds: activeTemplate
          ? activeTemplate.fields.map((field) => field.id)
          : removeItems(state.unlockedFieldIds, previousActiveFieldIds),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'url-template/remove': {
      const removedTemplate = state.urlTemplates.find((template) => template.id === action.id);
      const removedFieldIds =
        removedTemplate && state.activeUrlTemplateId === action.id ? removedTemplate.fields.map((field) => field.id) : [];
      return {
        ...state,
        urlTemplates: state.urlTemplates.filter((template) => template.id !== action.id),
        activeUrlTemplateId: state.activeUrlTemplateId === action.id ? null : state.activeUrlTemplateId,
        unlockedFieldIds: removeItems(state.unlockedFieldIds, removedFieldIds),
        manuallyExcludedFieldIds: removeItems(state.manuallyExcludedFieldIds, removedFieldIds),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'url-template/update-settings':
      return {
        ...state,
        urlTemplates: state.urlTemplates.map((template) =>
          template.id === action.id
            ? updateTemplateSettings(template, {
                matchMode: action.matchMode,
                hideExcludedFields: action.hideExcludedFields,
                autoApplyEnabled: action.autoApplyEnabled,
                grabStrategy: action.grabStrategy,
              })
            : template,
        ),
        lastUpdatedAt: Date.now(),
      };
    case 'url-template/update-fields':
      return {
        ...state,
        unlockedFieldIds: state.activeUrlTemplateId === action.id ? action.includedFieldIds : state.unlockedFieldIds,
        lastUpdatedAt: Date.now(),
      };
    case 'grab-source-patterns/load':
      return { ...state, grabSourcePatterns: action.patterns, lastUpdatedAt: Date.now() };
    case 'grab-source-pattern/remove':
      return {
        ...state,
        grabSourcePatterns: state.grabSourcePatterns.filter((pattern) => pattern.id !== action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'grab-source-pattern/update-settings':
      return {
        ...state,
        grabSourcePatterns: state.grabSourcePatterns.map((pattern) =>
          pattern.id === action.id
            ? updateGrabSourcePatternSettings(pattern, {
                matchMode: action.matchMode,
                grabStrategy: action.grabStrategy,
              })
            : pattern,
        ),
        lastUpdatedAt: Date.now(),
      };
    case 'parsed-field-state/restore':
      return {
        ...state,
        activeFieldId: action.record.activeFieldId,
        failedFieldId: action.record.failedFieldId,
        successfulFieldIds: action.record.successfulFieldIds,
        unchangedFieldIds: action.record.unchangedFieldIds,
        unlockedFieldIds: action.record.unlockedFieldIds,
        manuallyExcludedFieldIds: action.record.manuallyExcludedFieldIds,
        fieldSplitSpecs: action.record.fieldSplitSpecs,
        fieldDigitWidthSpecs: action.record.fieldDigitWidthSpecs ?? [],
        activeUrlTemplateId: action.record.activeUrlTemplateId,
        draftUrl: action.record.sourceUrl === action.record.selectedUrl ? null : action.record.sourceUrl,
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
        history: clearRecordCapture(state.history, action.id, action.blobId),
        bookmarks: clearRecordCapture(state.bookmarks, action.id, action.blobId),
        recall: clearRecallCandidateCapture(state.recall, action.id, action.blobId),
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
        importRestorePreview: undefined,
        lastUpdatedAt: Date.now(),
      };
    case 'import-export/complete':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.message,
        importExportMessageIsError: false,
        importRestorePreview: undefined,
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
        importRestorePreview: undefined,
        message: action.message,
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
    case 'import/restore-preview-ready':
      return {
        ...state,
        importExportBusy: false,
        importExportMessage: action.preview.message,
        importExportMessageIsError: action.preview.messageIsError === true,
        importRestorePreview: action.preview,
        message: action.preview.message ?? 'Restore preview loaded.',
        status: action.preview.messageIsError ? 'error' : 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'import/cancel-restore-preview':
      return {
        ...state,
        importExportBusy: false,
        importRestorePreview: undefined,
        importExportMessage: 'Restore preview canceled.',
        importExportMessageIsError: false,
        message: 'Restore preview canceled.',
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/status':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: action.status.connected ? 'connected' : 'disconnected',
          apiHost: action.status.apiHost,
          connectedAt: action.status.connectedAt,
          accountPremium: action.status.accountPremium,
          quotaBytes: action.status.quotaBytes,
          usedQuotaBytes: action.status.usedQuotaBytes,
          pendingOperation: undefined,
          message: action.status.message,
          messageIsError: action.status.messageIsError === true,
        },
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/busy':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'busy',
          pendingOperation: action.pendingOperation,
          message: action.message,
          messageIsError: false,
        },
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/message':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/upload-complete':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'connected',
          pendingOperation: undefined,
          apiHost: action.apiHost,
          lastBackupAt: action.uploadedAt,
          lastBackupFileName: action.fileName,
          lastBackupSizeBytes: action.sizeBytes,
          lastBackupSha256: action.sha256,
          lastBackupOriginalCount: action.originalCount,
          lastBackupOriginalBytes: action.originalBytes,
          lastBackupMissingOriginalCount: action.missingOriginalCount,
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/upload-error':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: action.status
            ? action.status.connected
              ? 'connected'
              : 'disconnected'
            : state.pcloudBackup.apiHost
              ? 'connected'
              : state.pcloudBackup.connectionState === 'busy'
                ? 'connected'
                : state.pcloudBackup.connectionState,
          pendingOperation: undefined,
          apiHost: action.status ? action.status.apiHost : state.pcloudBackup.apiHost,
          connectedAt: action.status ? action.status.connectedAt : state.pcloudBackup.connectedAt,
          accountPremium: action.status ? action.status.accountPremium : state.pcloudBackup.accountPremium,
          quotaBytes: action.status ? action.status.quotaBytes : state.pcloudBackup.quotaBytes,
          usedQuotaBytes: action.status ? action.status.usedQuotaBytes : state.pcloudBackup.usedQuotaBytes,
          message: action.message,
          messageIsError: true,
        },
        message: action.message,
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/restore-candidates-loaded':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'connected',
          pendingOperation: undefined,
          apiHost: action.apiHost,
          restoreCandidates: action.candidates,
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/restore-downloaded':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'connected',
          pendingOperation: undefined,
          apiHost: action.apiHost,
          lastRestoreFileName: action.fileName,
          lastRestoreSizeBytes: action.sizeBytes,
          lastRestoreSha256: action.sha256,
          lastRestoreDownloadedAt: action.downloadedAt,
          message: action.message,
          messageIsError: false,
        },
        message: action.message,
        status: 'ready',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/restore-error':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: action.status
            ? action.status.connected
              ? 'connected'
              : 'disconnected'
            : state.pcloudBackup.apiHost
              ? 'connected'
              : state.pcloudBackup.connectionState === 'busy'
                ? 'connected'
                : state.pcloudBackup.connectionState,
          pendingOperation: undefined,
          apiHost: action.status ? action.status.apiHost : state.pcloudBackup.apiHost,
          connectedAt: action.status ? action.status.connectedAt : state.pcloudBackup.connectedAt,
          accountPremium: action.status ? action.status.accountPremium : state.pcloudBackup.accountPremium,
          quotaBytes: action.status ? action.status.quotaBytes : state.pcloudBackup.quotaBytes,
          usedQuotaBytes: action.status ? action.status.usedQuotaBytes : state.pcloudBackup.usedQuotaBytes,
          message: action.message,
          messageIsError: true,
        },
        message: action.message,
        status: 'error',
        lastUpdatedAt: Date.now(),
      };
    case 'pcloud-backup/error':
      return {
        ...state,
        pcloudBackup: {
          ...state.pcloudBackup,
          connectionState: 'error',
          pendingOperation: undefined,
          message: action.message,
          messageIsError: true,
        },
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
