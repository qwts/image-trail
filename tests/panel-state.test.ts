import test from 'node:test';
import assert from 'node:assert/strict';
import { applyFieldLoadFailureToState, reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState, setTargetState } from '../extension/src/core/state.js';
import {
  isLockedPrivatePin,
  nextParsedFieldStatePageKey,
  originalBlobIdsForFullBackup,
  projectionSessionOwnsSelectedTarget,
  shouldRestoreParsedFieldState,
  urlReviewStatusForLoadResult,
} from '../extension/src/ui/panel.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import {
  PRIVACY_RECORD_META,
  PRIVACY_RECORD_NAME,
  recordDisplayName,
  recordMetadataText,
} from '../extension/src/ui/components/record-metadata.js';
import { selectedRangeIds } from '../extension/src/ui/components/selection-ranges.js';
import { recallDeleteCountForQueue } from '../extension/src/ui/render.js';
import type { ImportRestorePreviewState } from '../extension/src/core/types.js';
import type { UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from '../extension/src/core/url/types.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../extension/src/core/url/templates.js';

function restorePreviewFixture(overrides: Partial<ImportRestorePreviewState> = {}): ImportRestorePreviewState {
  return {
    fileName: 'image-trail-bookmarks-2026-06-27.json',
    payloadLabel: 'Bookmarks',
    recordCount: 2,
    capturedOriginalCount: 1,
    skippedCount: 0,
    unsupportedCount: 0,
    plaintext: false,
    message: 'Preview loaded.',
    samples: [
      {
        label: 'sample.jpg',
        url: 'https://example.test/sample.jpg',
        detail: 'Bookmark metadata with original reference',
      },
    ],
    ...overrides,
  };
}

test('switching active fields clears a previous failed field marker', () => {
  const failed = { ...createInitialPanelState(), activeFieldId: 'query-src-0', failedFieldId: 'query-src-0' };

  const next = reducePanelAction(failed, { name: 'active-field/set', id: 'query-page-0' });

  assert.equal(next.activeFieldId, 'query-page-0');
  assert.equal(next.failedFieldId, null);
});

test('target changes clear failed field markers', () => {
  const failed = {
    ...createInitialPanelState(),
    failedFieldId: 'query-src-0',
    successfulFieldIds: ['query-src-0'],
    unchangedFieldIds: ['query-page-0'],
    unlockedFieldIds: ['query-src-0'],
    manuallyExcludedFieldIds: ['query-src-0'],
    fieldSplitSpecs: [
      {
        baseFieldId: 'q:0:0',
        location: 'query' as const,
        queryIndex: 0,
        tokenIndex: 0,
        lengths: [2, 2, 4],
        pattern: '2-2-4',
      },
    ],
    currentImageFingerprint: 'a'.repeat(64),
  };

  const next = setTargetState(failed, {
    mode: 'manual',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    fillScreen: false,
    objectFit: 'contain',
    message: 'Target selected.',
  });

  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, []);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.deepEqual(next.manuallyExcludedFieldIds, []);
  assert.deepEqual(next.fieldSplitSpecs, []);
  assert.equal(next.currentImageFingerprint, null);
});

test('URL review status requires a definitive image fingerprint comparison', () => {
  assert.equal(urlReviewStatusForLoadResult('b'.repeat(64), 'a'.repeat(64)), 'passed');
  assert.equal(urlReviewStatusForLoadResult('a'.repeat(64), 'a'.repeat(64)), 'unchanged');
  assert.equal(urlReviewStatusForLoadResult(null, 'a'.repeat(64)), null);
  assert.equal(urlReviewStatusForLoadResult('a'.repeat(64), null), null);
});

test('same target load snapshots preserve learned field markers', () => {
  const learned = {
    ...createInitialPanelState(),
    target: {
      mode: 'manual' as const,
      picking: false,
      grabModeActive: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/image-1.jpg',
      selectedHandleId: 'handle-1',
      selectedDimensions: '100 x 100',
      fillScreen: false,
      objectFit: 'contain' as const,
      message: 'Target selected.',
    },
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: ['q:1:0'],
    unlockedFieldIds: ['q:0:0'],
    currentImageFingerprint: 'a'.repeat(64),
  };

  const next = setTargetState(learned, {
    mode: 'manual',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image-2.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    fillScreen: false,
    objectFit: 'contain',
    message: 'Target loaded.',
  });

  assert.deepEqual(next.successfulFieldIds, ['q:0:0']);
  assert.deepEqual(next.unchangedFieldIds, ['q:1:0']);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0']);
  assert.equal(next.currentImageFingerprint, 'a'.repeat(64));
});

test('same target load snapshots preserve edited draft URL', () => {
  const learned = {
    ...createInitialPanelState(),
    draftUrl: 'https://example.test/image-2.jpg',
    target: {
      mode: 'manual' as const,
      picking: false,
      grabModeActive: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/image-1.jpg',
      selectedHandleId: 'handle-1',
      selectedDimensions: '100 x 100',
      fillScreen: false,
      objectFit: 'contain' as const,
      message: 'Target selected.',
    },
  };

  const next = setTargetState(learned, {
    mode: 'manual',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: 'https://example.test/image-1.jpg',
    selectedHandleId: 'handle-1',
    selectedDimensions: '100 x 100',
    fillScreen: false,
    objectFit: 'contain',
    message: 'Target refreshed.',
  });

  assert.equal(next.draftUrl, 'https://example.test/image-2.jpg');
});

test('successful same target projection can explicitly clear edited draft URL', () => {
  const learned = {
    ...createInitialPanelState(),
    draftUrl: 'https://example.test/image-2.jpg',
    target: {
      mode: 'manual' as const,
      picking: false,
      grabModeActive: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/image-1.jpg',
      selectedHandleId: 'handle-1',
      selectedDimensions: '100 x 100',
      fillScreen: false,
      objectFit: 'contain' as const,
      message: 'Target selected.',
    },
  };

  const projected = {
    ...setTargetState(learned, {
      mode: 'manual',
      picking: false,
      grabModeActive: false,
      candidateCount: 1,
      selectedUrl: 'https://example.test/image-3.jpg',
      selectedHandleId: 'handle-1',
      selectedDimensions: '100 x 100',
      fillScreen: false,
      objectFit: 'contain',
      message: 'Target refreshed.',
    }),
    draftUrl: null,
  };

  assert.equal(projected.target.selectedUrl, 'https://example.test/image-3.jpg');
  assert.equal(projected.draftUrl, null);
});

test('Grab Mode actions expose sticky page-image grab status', () => {
  const state = createInitialPanelState();

  const started = reducePanelAction(state, { name: 'grab-mode/start' });
  assert.equal(started.status, 'ready');
  assert.match(started.message, /Grab Mode is active/u);

  const stopped = reducePanelAction(started, { name: 'grab-mode/stop' });
  assert.equal(stopped.status, 'ready');
  assert.equal(stopped.message, 'Grab Mode stopped.');
});

test('minimized panel stays visible without stopping Grab Mode', () => {
  const state = {
    ...createInitialPanelState(),
    visible: true,
    target: { ...createInitialPanelState().target, grabModeActive: true, picking: true },
  };

  const minimized = reducePanelAction(state, { name: 'panel/minimize' });
  assert.equal(minimized.visible, true);
  assert.equal(minimized.minimized, true);
  assert.equal(minimized.target.grabModeActive, true);
  assert.equal(minimized.target.picking, true);

  const expanded = reducePanelAction(minimized, { name: 'panel/expand' });
  assert.equal(expanded.visible, true);
  assert.equal(expanded.minimized, false);
  assert.equal(expanded.target.grabModeActive, true);

  const closed = reducePanelAction(expanded, { name: 'close-panel' });
  assert.equal(closed.visible, false);
  assert.equal(closed.minimized, false);
  assert.equal(closed.target.grabModeActive, true);
  assert.equal(closed.target.picking, false);
});

test('Previous/Next inclusion toggle only changes successful fields', () => {
  const state = { ...createInitialPanelState(), successfulFieldIds: ['q:0:0'] };

  const included = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(included.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(included.manuallyExcludedFieldIds, []);

  const excluded = reducePanelAction(included, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(excluded.unlockedFieldIds, []);
  assert.deepEqual(excluded.manuallyExcludedFieldIds, ['q:0:0']);

  const includedAgain = reducePanelAction(excluded, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(includedAgain.unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(includedAgain.manuallyExcludedFieldIds, []);

  const ignored = reducePanelAction(state, { name: 'field-unlock/toggle', id: 'q:1:0' });
  assert.deepEqual(ignored.unlockedFieldIds, []);
  assert.deepEqual(ignored.manuallyExcludedFieldIds, []);
});

test('loaded active URL templates restore included fields for navigation', () => {
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 1,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactPathSignature: 'exact',
      pathShapeSignature: 'shape',
      querySignature: 'page:int',
    },
    fields: [
      {
        id: 'q:0:0',
        label: 'query page',
        placeholder: '{query-page}',
        location: 'query',
        tokenKind: 'int',
        queryIndex: 0,
        queryKey: 'page',
        tokenIndex: 0,
      },
    ],
    hideExcludedFields: true,
    autoApplyEnabled: true,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  const loaded = reducePanelAction(createInitialPanelState(), {
    name: 'url-templates/load',
    templates: [template],
    activeTemplateId: template.id,
  });
  assert.equal(loaded.activeUrlTemplateId, template.id);
  assert.deepEqual(loaded.unlockedFieldIds, ['q:0:0']);

  const excluded = reducePanelAction(loaded, { name: 'field-unlock/toggle', id: 'q:0:0' });
  assert.deepEqual(excluded.unlockedFieldIds, []);
  assert.deepEqual(excluded.manuallyExcludedFieldIds, ['q:0:0']);

  const inactive = reducePanelAction(
    { ...loaded, unlockedFieldIds: ['q:0:0', 'q:1:0'], manuallyExcludedFieldIds: ['q:0:0', 'q:2:0'] },
    { name: 'url-templates/load', templates: [template], activeTemplateId: null },
  );
  assert.equal(inactive.activeUrlTemplateId, null);
  assert.deepEqual(inactive.unlockedFieldIds, ['q:1:0']);
  assert.deepEqual(inactive.manuallyExcludedFieldIds, ['q:0:0', 'q:2:0']);

  const failedDraft = reducePanelAction(
    {
      ...loaded,
      draftUrl: 'https://example.test/missing.jpg?page=404',
      status: 'error',
      message: 'Image failed to load: HTTP 404',
    },
    { name: 'url-templates/load', templates: [template], activeTemplateId: null },
  );
  assert.equal(failedDraft.activeUrlTemplateId, template.id);
  assert.deepEqual(failedDraft.unlockedFieldIds, ['q:0:0']);

  const cleared = reducePanelAction(
    { ...loaded, unlockedFieldIds: ['q:0:0', 'q:1:0'], manuallyExcludedFieldIds: ['q:0:0', 'q:2:0'] },
    { name: 'url-template/remove', id: template.id },
  );
  assert.equal(cleared.activeUrlTemplateId, null);
  assert.deepEqual(cleared.unlockedFieldIds, ['q:1:0']);
  assert.deepEqual(cleared.manuallyExcludedFieldIds, ['q:2:0']);
});

test('failed field load preserves Previous/Next inclusion choices', () => {
  const state = {
    ...createInitialPanelState(),
    successfulFieldIds: ['q:0:0', 'q:1:0'],
    unchangedFieldIds: ['q:0:0'],
    unlockedFieldIds: ['q:0:0', 'q:1:0'],
    manuallyExcludedFieldIds: ['q:2:0'],
  };

  const next = applyFieldLoadFailureToState(state, {
    draftUrl: 'https://example.test/missing.jpg?date=02012001&page=2',
    attemptedFieldIds: ['q:0:0', 'q:1:0'],
    message: 'Image failed to load: HTTP 404',
  });

  assert.equal(next.failedFieldId, 'q:0:0');
  assert.equal(next.draftUrl, 'https://example.test/missing.jpg?date=02012001&page=2');
  assert.deepEqual(next.successfulFieldIds, ['q:0:0', 'q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:0', 'q:1:0']);
  assert.deepEqual(next.manuallyExcludedFieldIds, ['q:2:0']);
});

test('removing a grab source pattern preserves URL templates', () => {
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 1,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactPathSignature: 'exact',
      pathShapeSignature: 'shape',
      querySignature: 'page:int',
    },
    fields: [],
    hideExcludedFields: false,
    autoApplyEnabled: true,
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };
  const pattern: GrabSourcePattern = {
    id: 'grab-source-1',
    schemaVersion: 1,
    hostname: 'example.test',
    patternUrl: 'https://example.test/post/123',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactPathSignature: 'post:int',
      pathShapeSignature: 'post:int',
      querySignature: '',
    },
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  const withTemplate = reducePanelAction(createInitialPanelState(), {
    name: 'url-templates/load',
    templates: [template],
    activeTemplateId: template.id,
  });
  const loaded = reducePanelAction(withTemplate, {
    name: 'grab-source-patterns/load',
    patterns: [pattern],
  });
  const next = reducePanelAction(loaded, { name: 'grab-source-pattern/remove', id: pattern.id });

  assert.equal(next.urlTemplates.length, 1);
  assert.deepEqual(next.urlTemplates[0], template);
  assert.deepEqual(next.grabSourcePatterns, []);
});

test('record selection toggles can span visible lists', () => {
  const state = {
    ...createInitialPanelState(),
    selectedBookmarkIds: ['bookmark-1'],
  };

  const historySelected = reducePanelAction(state, { name: 'history-selection/toggle', id: 'history-1' });
  assert.deepEqual(historySelected.selectedHistoryIds, ['history-1']);
  assert.deepEqual(historySelected.selectedBookmarkIds, ['bookmark-1']);

  const historyUnselected = reducePanelAction(historySelected, { name: 'history-selection/toggle', id: 'history-1' });
  assert.deepEqual(historyUnselected.selectedHistoryIds, []);

  const bookmarkSelected = reducePanelAction(historySelected, { name: 'bookmark-selection/toggle', id: 'bookmark-2' });
  assert.deepEqual(bookmarkSelected.selectedBookmarkIds, ['bookmark-1', 'bookmark-2']);
  assert.deepEqual(bookmarkSelected.selectedHistoryIds, ['history-1']);

  const historyCleared = reducePanelAction(
    { ...createInitialPanelState(), selectedHistoryIds: ['history-1', 'history-2'] },
    { name: 'history-selection/clear' },
  );
  assert.deepEqual(historyCleared.selectedHistoryIds, []);

  const bookmarksCleared = reducePanelAction(
    { ...createInitialPanelState(), selectedBookmarkIds: ['bookmark-1', 'bookmark-2'] },
    { name: 'bookmark-selection/clear' },
  );
  assert.deepEqual(bookmarksCleared.selectedBookmarkIds, []);
});

test('select-all and range actions update only their own selection surface', () => {
  const state = {
    ...createInitialPanelState(),
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1'],
    recall: { ...createInitialPanelState().recall, selectedIds: ['recall-1'] },
  };

  const historySelected = reducePanelAction(state, {
    name: 'history-selection/select',
    ids: ['history-2', 'history-3', 'history-2'],
  });
  assert.deepEqual(historySelected.selectedHistoryIds, ['history-2', 'history-3']);
  assert.deepEqual(historySelected.selectedBookmarkIds, ['bookmark-1']);
  assert.deepEqual(historySelected.recall.selectedIds, ['recall-1']);

  const bookmarkRange = reducePanelAction(historySelected, {
    name: 'bookmark-selection/select',
    ids: ['bookmark-2', 'bookmark-3'],
    mode: 'add',
  });
  assert.deepEqual(bookmarkRange.selectedBookmarkIds, ['bookmark-1', 'bookmark-2', 'bookmark-3']);
  assert.deepEqual(bookmarkRange.selectedHistoryIds, ['history-2', 'history-3']);

  const recallRange = reducePanelAction(bookmarkRange, {
    name: 'recall-selection/select',
    ids: ['recall-2', 'recall-3'],
    mode: 'add',
  });
  assert.deepEqual(recallRange.recall.selectedIds, ['recall-1', 'recall-2', 'recall-3']);
  assert.deepEqual(recallRange.selectedBookmarkIds, ['bookmark-1', 'bookmark-2', 'bookmark-3']);
});

test('select visible selects recents, visible queue rows, and loaded Recall rows', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history-1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
      { id: 'history-2', url: 'https://example.test/history-2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark-1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
    recall: {
      ...createInitialPanelState().recall,
      open: true,
      candidates: [
        {
          id: 'recall-1',
          url: 'https://example.test/recall-1.jpg',
          timestamp: '2026-06-20T00:00:00.000Z',
          source: 'bookmark' as const,
          envelopeCreatedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    },
  };

  const selected = reducePanelAction(state, { name: 'selection/select-visible' });

  assert.deepEqual(selected.selectedHistoryIds, ['history-1', 'history-2']);
  assert.deepEqual(selected.selectedBookmarkIds, ['bookmark-1']);
  assert.deepEqual(selected.recall.selectedIds, ['recall-1']);
});

test('select visible ignores cached Recall rows while the drawer is closed', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history-1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark-1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
    recall: {
      ...createInitialPanelState().recall,
      open: false,
      candidates: [
        {
          id: 'hidden-recall-1',
          url: 'https://example.test/hidden-recall-1.jpg',
          timestamp: '2026-06-20T00:00:00.000Z',
          source: 'bookmark' as const,
          envelopeCreatedAt: '2026-06-20T00:00:00.000Z',
        },
      ],
    },
  };

  const selected = reducePanelAction(state, { name: 'selection/select-visible' });

  assert.deepEqual(selected.selectedHistoryIds, ['history-1']);
  assert.deepEqual(selected.selectedBookmarkIds, ['bookmark-1']);
  assert.deepEqual(selected.recall.selectedIds, []);
});

test('visible range selection uses the most recent selected anchor', () => {
  assert.deepEqual(selectedRangeIds(['a', 'b', 'c', 'd'], ['b'], 'd'), ['b', 'c', 'd']);
  assert.deepEqual(selectedRangeIds(['a', 'b', 'c', 'd'], ['a', 'c'], 'b'), ['b', 'c']);
  assert.deepEqual(selectedRangeIds(['a', 'b', 'c', 'd'], [], 'c'), ['c']);
});

test('single bookmark selection clears history selection and selects only clicked bookmark', () => {
  const state = {
    ...createInitialPanelState(),
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1', 'bookmark-2'],
  };

  const selected = reducePanelAction(state, { name: 'bookmark-selection/single', id: 'bookmark-3' });

  assert.deepEqual(selected.selectedHistoryIds, []);
  assert.deepEqual(selected.selectedBookmarkIds, ['bookmark-3']);
});

test('updating visible bookmark soft max resets the queue window', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarkOffset: 30,
    bookmarkLimit: 30,
  };

  const updated = reducePanelAction(state, { name: 'settings/update-visible-bookmark-soft-max', value: 10 });

  assert.equal(updated.bookmarkLimit, 10);
  assert.equal(updated.bookmarkOffset, 0);
});

test('toggling privacy mode does not mutate rows or selections', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
    selectedHistoryIds: ['history-1'],
    selectedBookmarkIds: ['bookmark-1'],
  };

  const updated = reducePanelAction(state, { name: 'settings/update-privacy-mode', enabled: true });

  assert.equal(updated.privacyModeEnabled, true);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
  assert.deepEqual(updated.selectedHistoryIds, ['history-1']);
  assert.deepEqual(updated.selectedBookmarkIds, ['bookmark-1']);
});

test('updating URL review status retention settings only changes review policy state', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-url-review-status-retention',
    limit: 250,
    clearAfterExport: true,
  });

  assert.equal(updated.urlReviewStatusLimit, 250);
  assert.equal(updated.clearUrlReviewStatusAfterExport, true);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
});

test('updating neighbor preload settings only changes preload policy state', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-neighbor-preload',
    enabled: true,
    radius: 2,
    cacheLimit: 0,
  });

  assert.equal(updated.neighborPreloadEnabled, true);
  assert.equal(updated.neighborPreloadRadius, 2);
  assert.equal(updated.neighborPreloadCacheLimit, 0);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
});

test('updating request throttle settings only changes throttle policy state', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/history.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
    ],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const updated = reducePanelAction(state, {
    name: 'settings/update-request-throttle',
    minimumIntervalMs: 100,
    maxRequests: 12,
    windowMs: 5_000,
  });

  assert.equal(updated.requestThrottleMs, 100);
  assert.equal(updated.requestThrottleMaxRequests, 12);
  assert.equal(updated.requestThrottleWindowMs, 5_000);
  assert.equal(updated.history, state.history);
  assert.equal(updated.bookmarks, state.bookmarks);
});

test('clearing visible bookmarks is presentation-only state', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
      { id: 'bookmark-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'bookmark' as const },
    ],
    selectedBookmarkIds: ['bookmark-1'],
    bookmarkTotal: 2,
    hasOlderBookmarks: true,
  };

  const cleared = reducePanelAction(state, { name: 'bookmarks/clear-visible' });

  assert.deepEqual(cleared.bookmarks, []);
  assert.deepEqual(cleared.selectedBookmarkIds, []);
  assert.equal(cleared.bookmarkTotal, 0);
  assert.equal(cleared.hasOlderBookmarks, false);
});

test('deleting recents drops transient history and selections', () => {
  const state = {
    ...createInitialPanelState(),
    history: [
      { id: 'history-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
      { id: 'history-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'history' as const },
    ],
    selectedHistoryIds: ['history-1'],
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/bookmark.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
    ],
  };

  const deleted = reducePanelAction(state, { name: 'history/delete-all' });

  assert.deepEqual(deleted.history, []);
  assert.deepEqual(deleted.selectedHistoryIds, []);
  assert.equal(deleted.bookmarks, state.bookmarks);
});

test('recall delete count is derived from durable queue totals', () => {
  assert.equal(recallDeleteCountForQueue({ bookmarkTotal: 47, bookmarkLimit: 3 }), 44);
  assert.equal(recallDeleteCountForQueue({ bookmarkTotal: 2, bookmarkLimit: 3 }), 0);
});

test('settings toggle opens and closes the panel settings section', () => {
  const opened = reducePanelAction(createInitialPanelState(), { name: 'settings/toggle' });
  assert.equal(opened.settingsOpen, true);

  const closed = reducePanelAction(opened, { name: 'settings/toggle' });
  assert.equal(closed.settingsOpen, false);
});

test('updating pin save storage preference only changes future save preference state', () => {
  const state = createInitialPanelState();
  const updated = reducePanelAction(state, { name: 'settings/update-pin-save-storage-preference', value: 'plaintext' });

  assert.equal(updated.pinSaveStoragePreference, 'plaintext');
  assert.equal(updated.bookmarkOffset, state.bookmarkOffset);
  assert.deepEqual(updated.bookmarks, state.bookmarks);
});

test('import restore preview ready stores preview and status message', () => {
  const preview = restorePreviewFixture({ message: 'Preview loaded. Import has not changed local records yet.' });

  const next = reducePanelAction(createInitialPanelState(), { name: 'import/restore-preview-ready', preview });

  assert.equal(next.importExportBusy, false);
  assert.equal(next.importExportMessage, preview.message);
  assert.equal(next.importExportMessageIsError, false);
  assert.equal(next.importRestorePreview, preview);
  assert.equal(next.message, preview.message);
  assert.equal(next.status, 'ready');
});

test('import restore preview ready preserves error review state', () => {
  const preview = restorePreviewFixture({ message: 'Some sections cannot be imported by this version.', messageIsError: true });

  const next = reducePanelAction(createInitialPanelState(), { name: 'import/restore-preview-ready', preview });

  assert.equal(next.importExportMessageIsError, true);
  assert.equal(next.importRestorePreview, preview);
  assert.equal(next.message, preview.message);
  assert.equal(next.status, 'error');
});

test('import restore preview clears on cancel and new import start', () => {
  const preview = restorePreviewFixture({ message: 'Preview loaded. Import has not changed local records yet.' });
  const ready = reducePanelAction(createInitialPanelState(), { name: 'import/restore-preview-ready', preview });

  const canceled = reducePanelAction(ready, { name: 'import/cancel-restore-preview' });
  assert.equal(canceled.importRestorePreview, undefined);
  assert.equal(canceled.importExportMessage, 'Restore preview canceled.');
  assert.equal(canceled.status, 'ready');

  const restarted = reducePanelAction(ready, { name: 'import-export/start' });
  assert.equal(restarted.importRestorePreview, undefined);
  assert.equal(restarted.importExportBusy, true);
  assert.equal(restarted.importExportMessage, 'Import/export is running...');
});

test('record selection prunes removed and unloaded rows', () => {
  const state = {
    ...createInitialPanelState(),
    bookmarks: [
      { id: 'bookmark-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'bookmark' as const },
      { id: 'bookmark-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'bookmark' as const },
    ],
    history: [
      { id: 'history-1', url: 'https://example.test/1.jpg', timestamp: '2026-06-20T00:00:00.000Z', source: 'history' as const },
      { id: 'history-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'history' as const },
    ],
    selectedBookmarkIds: ['bookmark-1', 'bookmark-2'],
    selectedHistoryIds: ['history-1', 'history-2'],
  };

  const removedHistory = reducePanelAction(state, { name: 'history/remove', id: 'history-1' });
  assert.deepEqual(removedHistory.selectedHistoryIds, ['history-2']);

  const removedBookmark = reducePanelAction(state, { name: 'bookmark/remove', id: 'bookmark-1' });
  assert.deepEqual(removedBookmark.selectedBookmarkIds, ['bookmark-2']);

  const reloadedBookmarks = reducePanelAction(state, {
    name: 'bookmarks/page-loaded',
    bookmarks: [
      { id: 'bookmark-2', url: 'https://example.test/2.jpg', timestamp: '2026-06-20T00:00:01.000Z', source: 'bookmark' as const },
    ],
    offset: 0,
    limit: 30,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });
  assert.deepEqual(reloadedBookmarks.selectedBookmarkIds, ['bookmark-2']);
});

test('recall drawer loads candidates and toggles selection', () => {
  const state = createInitialPanelState();
  const opened = reducePanelAction(state, { name: 'recall/open', side: 'left' });
  const loading = reducePanelAction(opened, { name: 'recall/load-start' });
  const loaded = reducePanelAction(loading, {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/recall.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'history' as const,
        envelopeCreatedAt: '2026-06-20T00:00:01.000Z',
      },
    ],
    append: false,
    offset: 30,
    nextOffset: 31,
    hasMore: false,
    total: 1,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });
  const selected = reducePanelAction(loaded, { name: 'recall-selection/toggle', id: 'recall-1' });
  const closed = reducePanelAction(selected, { name: 'recall/close' });

  assert.equal(opened.recall.open, true);
  assert.equal(opened.recall.side, 'left');
  assert.equal(loading.recall.busy, true);
  assert.equal(loaded.recall.busy, false);
  assert.equal(loaded.recall.candidates.length, 1);
  assert.equal(loaded.recall.nextOffset, 31);
  assert.equal(loaded.recall.hasMore, false);
  assert.deepEqual(selected.recall.selectedIds, ['recall-1']);
  assert.equal(closed.recall.open, false);
  assert.deepEqual(closed.recall.selectedIds, []);
});

test('clearing recall results does not mutate visible bookmarks', () => {
  const state = reducePanelAction(createInitialPanelState(), {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/1.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:00.000Z',
      },
    ],
    append: false,
    offset: 30,
    nextOffset: 31,
    hasMore: true,
    total: 4,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });
  const selected = reducePanelAction(state, { name: 'recall-selection/toggle', id: 'recall-1' });

  const cleared = reducePanelAction(selected, { name: 'recall/clear-results' });

  assert.deepEqual(cleared.recall.candidates, []);
  assert.deepEqual(cleared.recall.selectedIds, []);
  assert.equal(cleared.recall.hasMore, false);
  assert.equal(cleared.bookmarks.length, 0);
});

test('locked private placeholders are detected before image export', () => {
  assert.equal(
    isLockedPrivatePin({
      id: 'private-pin',
      url: 'image-trail-private:private-pin',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
      privacyStatus: 'locked',
    }),
    true,
  );
  assert.equal(
    isLockedPrivatePin({
      id: 'plain-pin',
      url: 'https://example.test/plain.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark',
    }),
    false,
  );
});

test('privacy display helpers mask row name and metadata only in privacy mode', () => {
  const record = {
    id: 'record-1',
    url: 'https://example.test/private-name.jpg',
    label: 'private-name.jpg',
    timestamp: '2026-06-20T00:00:00.000Z',
    width: 640,
    height: 480,
    source: 'bookmark' as const,
  };

  assert.equal(recordDisplayName(record), 'private-name.jpg');
  assert.notEqual(recordMetadataText(record), PRIVACY_RECORD_META);
  assert.equal(recordDisplayName(record, { privacyMode: true }), PRIVACY_RECORD_NAME);
  assert.equal(recordMetadataText(record, { privacyMode: true }), PRIVACY_RECORD_META);
});

test('recall drawer appends paged candidates without duplicating rows', () => {
  const state = reducePanelAction(createInitialPanelState(), {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/recall-1.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:01.000Z',
      },
    ],
    append: false,
    offset: 30,
    nextOffset: 31,
    hasMore: true,
    total: 3,
    failedCount: 0,
    message: 'Loaded 1 recall record.',
  });

  const appended = reducePanelAction(state, {
    name: 'recall/load-complete',
    candidates: [
      {
        id: 'recall-1',
        url: 'https://example.test/recall-1.jpg',
        timestamp: '2026-06-20T00:00:00.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:01.000Z',
      },
      {
        id: 'recall-2',
        url: 'https://example.test/recall-2.jpg',
        timestamp: '2026-06-20T00:00:02.000Z',
        source: 'bookmark' as const,
        envelopeCreatedAt: '2026-06-20T00:00:03.000Z',
      },
    ],
    append: true,
    offset: 31,
    nextOffset: 33,
    hasMore: false,
    total: 3,
    failedCount: 0,
    message: 'Loaded 2 recall records.',
  });

  assert.deepEqual(
    appended.recall.candidates.map((candidate) => candidate.id),
    ['recall-1', 'recall-2'],
  );
  assert.equal(appended.recall.hasMore, false);
});

test('recall message clear restores default instructions without clearing errors', () => {
  const loaded = reducePanelAction(createInitialPanelState(), {
    name: 'recall/load-complete',
    candidates: [],
    append: false,
    offset: 30,
    nextOffset: 30,
    hasMore: false,
    total: 0,
    failedCount: 0,
    message: 'Loaded 0 recall records.',
  });

  const staleClear = reducePanelAction(loaded, { name: 'recall/message-clear', message: 'Loaded 1 recall record.' });
  const cleared = reducePanelAction(loaded, { name: 'recall/message-clear', message: 'Loaded 0 recall records.' });
  const errored = reducePanelAction(loaded, { name: 'recall/error', message: 'Recall failed.' });
  const errorClear = reducePanelAction(errored, { name: 'recall/message-clear', message: 'Recall failed.' });

  assert.equal(staleClear.recall.message, 'Loaded 0 recall records.');
  assert.equal(cleared.recall.message, undefined);
  assert.equal(errorClear.recall.message, 'Recall failed.');
  assert.equal(errorClear.recall.messageIsError, true);
});

test('recall completion clears drawer state without mutating visible recents directly', () => {
  const baseHistory = [
    {
      id: 'history-1',
      url: 'https://example.test/history.jpg',
      timestamp: '2026-06-20T00:00:00.000Z',
      source: 'history' as const,
    },
  ];
  const recalled = [
    {
      id: 'bookmark-1',
      url: 'https://example.test/new.jpg',
      timestamp: '2026-06-21T00:00:00.000Z',
      source: 'bookmark' as const,
    },
  ];

  const completed = reducePanelAction(
    {
      ...createInitialPanelState(),
      history: baseHistory,
      recall: { ...createInitialPanelState().recall, selectedIds: ['bookmark-1'], busy: true },
    },
    {
      name: 'recall/complete',
      records: recalled,
      failedCount: 0,
      message: 'Recalled 1 record.',
    },
  );

  assert.deepEqual(completed.history, baseHistory);
  assert.deepEqual(completed.recall.selectedIds, []);
  assert.equal(completed.recall.busy, false);
  assert.equal(completed.recall.message, 'Recalled 1 record.');
});

test('clearing split specs collapses fields and clears related markers', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2, 4],
    pattern: '2-2-4',
  };
  const state = {
    ...createInitialPanelState(),
    activeFieldId: 'q:0:2',
    failedFieldId: 'q:0:1',
    successfulFieldIds: ['q:0:0', 'q:0:2', 'q:1:0'],
    unchangedFieldIds: ['q:0:1'],
    unlockedFieldIds: ['q:0:0', 'q:0:2'],
    manuallyExcludedFieldIds: ['q:0:1'],
    fieldSplitSpecs: [splitSpec],
    fieldDigitWidthSpecs: [{ fieldId: 'q:0:2', width: 4 }],
  };

  const next = reducePanelAction(state, { name: 'field-split/clear', baseFieldId: 'q:0:0' });

  assert.equal(next.activeFieldId, null);
  assert.equal(next.failedFieldId, null);
  assert.deepEqual(next.successfulFieldIds, ['q:1:0']);
  assert.deepEqual(next.unchangedFieldIds, []);
  assert.deepEqual(next.unlockedFieldIds, []);
  assert.deepEqual(next.manuallyExcludedFieldIds, []);
  assert.deepEqual(next.fieldSplitSpecs, []);
  assert.deepEqual(next.fieldDigitWidthSpecs, []);
});

test('parsed field state restore revives saved field markers', () => {
  const splitSpec: UrlFieldSplitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query',
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2],
    pattern: '2-2',
  };
  const digitWidthSpec: UrlFieldDigitWidthSpec = { fieldId: 'q:0:1', width: 5 };

  const next = reducePanelAction(createInitialPanelState(), {
    name: 'parsed-field-state/restore',
    record: {
      schemaVersion: 1,
      hostname: 'example.test',
      pageUrl: 'https://example.test/gallery',
      sourceUrl: 'https://cdn.example.test/image-0001.jpg',
      selectedUrl: 'https://cdn.example.test/image-0001.jpg',
      selectedHandleId: 'target-1',
      activeFieldId: 'q:0:1',
      failedFieldId: 'q:0:0',
      successfulFieldIds: ['q:0:1'],
      unchangedFieldIds: ['q:1:0'],
      unlockedFieldIds: ['q:0:1'],
      manuallyExcludedFieldIds: ['q:2:0'],
      fieldSplitSpecs: [splitSpec],
      fieldDigitWidthSpecs: [digitWidthSpec],
      activeUrlTemplateId: 'template-1',
      updatedAt: '2026-06-22T00:00:00.000Z',
    },
  });

  assert.equal(next.activeFieldId, 'q:0:1');
  assert.equal(next.failedFieldId, 'q:0:0');
  assert.deepEqual(next.successfulFieldIds, ['q:0:1']);
  assert.deepEqual(next.unchangedFieldIds, ['q:1:0']);
  assert.deepEqual(next.unlockedFieldIds, ['q:0:1']);
  assert.deepEqual(next.manuallyExcludedFieldIds, ['q:2:0']);
  assert.deepEqual(next.fieldSplitSpecs, [splitSpec]);
  assert.deepEqual(next.fieldDigitWidthSpecs, [digitWidthSpec]);
  assert.equal(next.activeUrlTemplateId, 'template-1');
  assert.equal(next.draftUrl, null);
});

test('parsed field state restore revives draft URL attempts', () => {
  const next = reducePanelAction(createInitialPanelState(), {
    name: 'parsed-field-state/restore',
    record: {
      schemaVersion: 1,
      hostname: 'example.test',
      pageUrl: 'https://example.test/gallery',
      sourceUrl: 'https://cdn.example.test/image-0002.jpg',
      selectedUrl: 'https://cdn.example.test/image-0001.jpg',
      selectedHandleId: 'target-1',
      activeFieldId: 'q:0:0',
      failedFieldId: 'q:0:0',
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      activeUrlTemplateId: null,
      updatedAt: '2026-06-22T00:00:00.000Z',
    },
  });

  assert.equal(next.draftUrl, 'https://cdn.example.test/image-0002.jpg');
  assert.equal(next.failedFieldId, 'q:0:0');
});

test('parsed field state restore does not replay drafts onto reused target handles', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0002.jpg', 'target-2'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0001.jpg', 'target-1'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0003.jpg', 'target-1'), false);
});

test('parsed field state restore can replay edits from the original image page URL', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'external-content.duckduckgo.com',
    pageUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0001.jpg',
    sourceUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    selectedUrl: 'https://external-content.duckduckgo.com/iu/?u=https%3A%2F%2Fexample.test%2Fimage-0002.jpg',
    selectedHandleId: 'image-trail-target-1',
    activeFieldId: 'q:0:1',
    failedFieldId: null,
    successfulFieldIds: ['q:0:1'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:1'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, record.pageUrl, 'image-trail-target-1'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://example.test/other-image.jpg', 'image-trail-target-2'), false);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://example.test/other-image.jpg', 'image-trail-target-2', record.pageUrl), true);
});

test('parsed field state restore can replay saved projection when the browser page URL matches', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0009.jpg',
    selectedUrl: 'https://cdn.example.test/image-0008.jpg',
    selectedHandleId: 'target-previous-tab',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/site-default.jpg', 'target-new-tab'), false);
  assert.equal(
    shouldRestoreParsedFieldState(record, 'https://cdn.example.test/site-default.jpg', 'target-new-tab', 'https://example.test/gallery'),
    true,
  );
});

test('parsed field state restore ignores stale draft URLs for same host image elements', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0003.jpg',
    selectedUrl: 'https://cdn.example.test/image-0003.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0003.jpg', 'target-1'), true);
  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0002.jpg', 'target-1'), false);
});

test('parsed field state restore does not auto-project saved drafts onto normal page images', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://example.test/gallery',
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0001.jpg', 'target-1'), true);
});

test('parsed field state restore ignores stale direct-image page keys on normal pages', () => {
  const record = {
    schemaVersion: 1 as const,
    hostname: 'example.test',
    pageUrl: 'https://cdn.example.test/image-0001.jpg',
    sourceUrl: 'https://cdn.example.test/image-0002.jpg',
    selectedUrl: 'https://cdn.example.test/image-0001.jpg',
    selectedHandleId: 'target-1',
    activeFieldId: 'q:0:0',
    failedFieldId: null,
    successfulFieldIds: ['q:0:0'],
    unchangedFieldIds: [],
    unlockedFieldIds: ['q:0:0'],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    activeUrlTemplateId: 'template-1',
    updatedAt: '2026-06-22T00:00:00.000Z',
  };

  assert.equal(shouldRestoreParsedFieldState(record, 'https://cdn.example.test/image-0001.jpg', 'target-1'), true);
});

test('parsed field page key ignores extension projections but follows page navigation', () => {
  const originalPage = 'https://example.test/gallery/1';
  const projectedImage = 'https://example.test/images/2.jpg';
  const spaRoute = 'https://example.test/gallery/2';

  assert.equal(nextParsedFieldStatePageKey(originalPage, originalPage, null), originalPage);
  assert.equal(nextParsedFieldStatePageKey(projectedImage, originalPage, projectedImage), originalPage);
  assert.equal(nextParsedFieldStatePageKey(spaRoute, originalPage, projectedImage), spaRoute);
});

test('projection sessions only own their original selected target handle', () => {
  const session = {
    id: 'projection-1',
    reason: 'record-preview' as const,
    sourceUrl: 'https://example.test/image-2.jpg',
    displayUrl: null,
    selectedHandleId: 'target-1',
    originalSourceUrl: 'https://example.test/image-1.jpg',
    status: 'preloading' as const,
  };

  assert.equal(projectionSessionOwnsSelectedTarget(session, 'target-1'), true);
  assert.equal(projectionSessionOwnsSelectedTarget(session, 'target-2'), false);
  assert.equal(projectionSessionOwnsSelectedTarget(session, null), false);
});

test('pCloud backup reducer tracks backing-up state and verified upload metadata', () => {
  const connected = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'api.pcloud.com',
      connectedAt: '2026-06-27T00:00:00.000Z',
      message: 'pCloud is connected.',
    },
  });
  const backingUp = reducePanelAction(connected, {
    name: 'pcloud-backup/busy',
    pendingOperation: 'backing-up',
    message: 'Uploading encrypted backup to pCloud...',
  });

  assert.equal(backingUp.pcloudBackup.connectionState, 'busy');
  assert.equal(backingUp.pcloudBackup.pendingOperation, 'backing-up');

  const uploaded = reducePanelAction(backingUp, {
    name: 'pcloud-backup/upload-complete',
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
    sizeBytes: 512,
    sha256: 'b'.repeat(64),
    originalCount: 1,
    originalBytes: 96937,
    missingOriginalCount: 0,
    uploadedAt: '2026-06-27T00:00:01.000Z',
    message: 'Uploaded and verified backup.',
  });

  assert.equal(uploaded.pcloudBackup.connectionState, 'connected');
  assert.equal(uploaded.pcloudBackup.pendingOperation, undefined);
  assert.equal(uploaded.pcloudBackup.lastBackupFileName, 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json');
  assert.equal(uploaded.pcloudBackup.lastBackupSizeBytes, 512);
  assert.equal(uploaded.pcloudBackup.lastBackupSha256, 'b'.repeat(64));
  assert.equal(uploaded.pcloudBackup.lastBackupOriginalCount, 1);
  assert.equal(uploaded.pcloudBackup.lastBackupOriginalBytes, 96937);
  assert.equal(uploaded.pcloudBackup.lastBackupMissingOriginalCount, 0);
  assert.equal(uploaded.pcloudBackup.messageIsError, false);
});

test('pCloud full backup collects captured blob ids from durable records', () => {
  const records = [
    createDisplayRecord({
      id: 'captured',
      url: 'https://example.test/captured.jpg',
      timestamp: '2026-06-28T02:26:41.854Z',
      captureStatus: 'captured',
      blobId: 'captured-blob',
    }),
    createDisplayRecord({
      id: 'stored',
      url: 'https://example.test/stored.jpg',
      timestamp: '2026-06-28T02:26:42.854Z',
      storedOriginal: {
        blobId: 'stored-blob',
        mimeType: 'image/jpeg',
        byteLength: 447304,
        capturedAt: '2026-06-28T02:26:42.854Z',
      },
    }),
  ];

  assert.deepEqual([...originalBlobIdsForFullBackup(records)].sort(), ['captured-blob', 'stored-blob']);
});

test('pCloud upload errors keep connected provider state for retry', () => {
  const state = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'eapi.pcloud.com',
      message: 'pCloud is connected.',
    },
  });

  const failed = reducePanelAction(state, {
    name: 'pcloud-backup/upload-error',
    message: 'Downloaded pCloud backup bytes did not match the local export.',
  });

  assert.equal(failed.pcloudBackup.connectionState, 'connected');
  assert.equal(failed.pcloudBackup.pendingOperation, undefined);
  assert.equal(failed.pcloudBackup.messageIsError, true);
  assert.match(failed.pcloudBackup.message ?? '', /Downloaded pCloud backup bytes/u);
});

test('pCloud upload errors apply disconnected provider status for reconnect recovery', () => {
  const connected = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'api.pcloud.com',
      connectedAt: '2026-06-27T00:00:00.000Z',
      message: 'pCloud is connected.',
    },
  });
  const backingUp = reducePanelAction(connected, {
    name: 'pcloud-backup/busy',
    pendingOperation: 'backing-up',
    message: 'Uploading encrypted backup to pCloud...',
  });

  const failed = reducePanelAction(backingUp, {
    name: 'pcloud-backup/upload-error',
    message: 'Connect pCloud before backing up.',
    status: {
      connected: false,
      message: 'Connect pCloud before backing up.',
      messageIsError: true,
    },
  });

  assert.equal(failed.pcloudBackup.connectionState, 'disconnected');
  assert.equal(failed.pcloudBackup.pendingOperation, undefined);
  assert.equal(failed.pcloudBackup.apiHost, undefined);
  assert.equal(failed.pcloudBackup.messageIsError, true);
  assert.match(failed.pcloudBackup.message ?? '', /Connect pCloud/u);
});

test('pCloud restore reducer tracks candidates and downloaded metadata', () => {
  const connected = reducePanelAction(createInitialPanelState(), {
    name: 'pcloud-backup/status',
    status: {
      connected: true,
      apiHost: 'api.pcloud.com',
      message: 'pCloud is connected.',
    },
  });
  const restoring = reducePanelAction(connected, {
    name: 'pcloud-backup/busy',
    pendingOperation: 'restoring',
    message: 'Checking pCloud backups...',
  });

  assert.equal(restoring.pcloudBackup.connectionState, 'busy');
  assert.equal(restoring.pcloudBackup.pendingOperation, 'restoring');

  const candidates = reducePanelAction(restoring, {
    name: 'pcloud-backup/restore-candidates-loaded',
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    candidates: [
      {
        fileId: 402,
        fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
        sizeBytes: 512,
        modifiedAt: 'Sat, 27 Jun 2026 00:00:00 +0000',
      },
    ],
    message: 'Found 1 encrypted pCloud backup.',
  });

  assert.equal(candidates.pcloudBackup.connectionState, 'connected');
  assert.equal(candidates.pcloudBackup.pendingOperation, undefined);
  assert.equal(candidates.pcloudBackup.restoreCandidates?.[0]?.fileId, 402);

  const downloaded = reducePanelAction(candidates, {
    name: 'pcloud-backup/restore-downloaded',
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
    sizeBytes: 512,
    sha256: 'c'.repeat(64),
    downloadedAt: '2026-06-27T00:00:01.000Z',
    message: 'Downloaded backup.',
  });

  assert.equal(downloaded.pcloudBackup.lastRestoreFileName, 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json');
  assert.equal(downloaded.pcloudBackup.lastRestoreSizeBytes, 512);
  assert.equal(downloaded.pcloudBackup.lastRestoreSha256, 'c'.repeat(64));
  assert.equal(downloaded.pcloudBackup.lastRestoreDownloadedAt, '2026-06-27T00:00:01.000Z');
});
