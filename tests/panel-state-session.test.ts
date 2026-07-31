import test from 'node:test';
import assert from 'node:assert/strict';
import { reducePanelAction } from '../extension/src/core/actions.js';
import { createInitialPanelState, setTargetState } from '../extension/src/core/state.js';
import { isUnsupportedUrlEditorInput } from '../extension/src/ui/components/url-editor-view.js';
import { projectionSessionOwnsSelectedTarget, urlReviewStatusForLoadResult } from '../extension/src/ui/panel.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../extension/src/core/url/templates.js';

test('secondary manual controls disclosure state is panel state', () => {
  const initial = createInitialPanelState();

  const opened = reducePanelAction(initial, { name: 'panel/secondary-controls-open', open: true });
  const closed = reducePanelAction(opened, { name: 'panel/secondary-controls-open', open: false });
  const unchanged = reducePanelAction(initial, { name: 'panel/secondary-controls-open', open: false });

  assert.equal(initial.secondaryControlsOpen, false);
  assert.equal(opened.secondaryControlsOpen, true);
  assert.equal(closed.secondaryControlsOpen, false);
  assert.equal(unchanged, initial);
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

test('URL editor blocks pasted data URLs before projection', () => {
  assert.equal(isUnsupportedUrlEditorInput('data:image/png;base64,abc'), true);
  assert.equal(isUnsupportedUrlEditorInput('  data:image/jpeg;base64,abc'), true);
  assert.equal(isUnsupportedUrlEditorInput('DATA:image/webp;base64,abc'), true);
  assert.equal(isUnsupportedUrlEditorInput('https://example.test/image.jpg'), false);
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

test('removing a grab source pattern preserves URL templates', () => {
  const identityKey = '42'.repeat(32);
  const template: UrlTemplateRecord = {
    id: 'template-001',
    schemaVersion: 2,
    hostname: 'example.test',
    templateUrl: 'https://example.test/image.jpg?page={query-page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactIdentity: '11'.repeat(32),
      pathShapeSignature: 'shape',
      queryShapeSignature: '0:int',
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
    schemaVersion: 2,
    hostname: 'example.test',
    patternUrl: 'https://example.test/post/123',
    matchRules: {
      mode: 'exact-page-shape',
      hostname: 'example.test',
      exactIdentity: '22'.repeat(32),
      pathShapeSignature: 'post:int',
      queryShapeSignature: '',
    },
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
    useCount: 1,
  };

  const withTemplate = reducePanelAction(createInitialPanelState(), {
    name: 'url-templates/load',
    templates: [template],
    identityKey,
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
