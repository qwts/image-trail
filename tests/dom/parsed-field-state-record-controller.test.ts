import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import {
  ParsedFieldStateRecordController,
  type ParsedFieldStateRecordControllerDeps,
} from '../../extension/src/ui/panel/parsed-field-state-record-controller.js';

// Runs under happy-dom: hostnameFromLocation() and imageResourceUrlsEqual() read window.location.
window.location.href = 'https://images.example.test/gallery';

interface Harness {
  readonly controller: ParsedFieldStateRecordController;
  readonly log: string[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
  currentRawUrl: string;
  applySelectedUrlResult: boolean;
}

function createHarness(): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const harness: Harness = {
    controller: undefined as unknown as ParsedFieldStateRecordController,
    log,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
    currentRawUrl: 'https://images.example.test/a/1.jpg',
    applySelectedUrlResult: true,
  };
  const deps: ParsedFieldStateRecordControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    currentRawUrl: () => harness.currentRawUrl,
    applySelectedUrl: async (url, attemptedFieldIds, options) => {
      log.push(`applySelectedUrl:${url}:${attemptedFieldIds.length}:${options.reason}`);
      return harness.applySelectedUrlResult;
    },
    syncGrabSettings: () => log.push('syncGrabSettings'),
    loadGrabSettings: async () => {},
    fieldStatePageUrl: () => 'https://images.example.test/gallery',
    nextFieldStateUpdatedAt: () => '2026-07-03T00:00:00.000Z',
    saveFieldState: async () => void log.push('saveFieldState'),
    restoreFieldState: async () => {},
  };
  (harness as { controller: ParsedFieldStateRecordController }).controller = new ParsedFieldStateRecordController(deps);
  return harness;
}

test('createParsedFieldStateRecord snapshots the current field state keyed to the host', () => {
  const harness = createHarness();
  harness.patchState({
    target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg', selectedHandleId: 'h1' },
    activeFieldId: 'f1',
    successfulFieldIds: ['f1'],
    manuallyExcludedFieldIds: ['f2'],
  });
  const record = harness.controller.createParsedFieldStateRecord();
  assert.ok(record);
  assert.equal(record.hostname, 'images.example.test');
  assert.equal(record.sourceUrl, 'https://images.example.test/a/1.jpg');
  assert.equal(record.pageUrl, 'https://images.example.test/gallery');
  assert.equal(record.selectedHandleId, 'h1');
  assert.equal(record.activeFieldId, 'f1');
  assert.deepEqual(record.successfulFieldIds, ['f1']);
  assert.deepEqual(record.manuallyExcludedFieldIds, ['f2']);
  assert.equal(record.updatedAt, '2026-07-03T00:00:00.000Z');
});

test('createParsedFieldStateRecord returns null when there is no selected or draft url', () => {
  const harness = createHarness();
  assert.equal(harness.controller.createParsedFieldStateRecord(), null);
});

test('applyRestoredParsedFieldState projects the saved source, then restores and persists', async () => {
  const harness = createHarness();
  // Build a real record from a selected state so the reducer has valid input, then point it at a
  // different saved source so the projection branch runs.
  harness.patchState({ target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg' } });
  const built = harness.controller.createParsedFieldStateRecord();
  assert.ok(built);
  const restoreInput = { ...built, sourceUrl: 'https://images.example.test/a/9.jpg' };
  await harness.controller.applyRestoredParsedFieldState(restoreInput, { sameSource: false, projectSavedSource: true });
  assert.ok(harness.log.includes('applySelectedUrl:https://images.example.test/a/9.jpg:0:parsed-field-restore'));
  assert.ok(harness.log.includes('syncGrabSettings'));
  assert.ok(harness.log.includes('saveFieldState'));
  assert.ok(harness.log.includes('render'));
});

test('applyRestoredParsedFieldState bails when the projection fails and the URL did not land', async () => {
  const harness = createHarness();
  harness.applySelectedUrlResult = false;
  harness.currentRawUrl = 'https://images.example.test/a/1.jpg';
  harness.patchState({ target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg' } });
  const built = harness.controller.createParsedFieldStateRecord();
  assert.ok(built);
  const restoreInput = { ...built, sourceUrl: 'https://images.example.test/a/9.jpg' };
  await harness.controller.applyRestoredParsedFieldState(restoreInput, { sameSource: false, projectSavedSource: true });
  assert.ok(harness.log.includes('applySelectedUrl:https://images.example.test/a/9.jpg:0:parsed-field-restore'));
  assert.ok(!harness.log.includes('saveFieldState'), 'restore is abandoned when the projection did not land');
  assert.ok(!harness.log.includes('render'));
});

test('applyRestoredParsedFieldState skips projection when the source already matches (sameSource)', async () => {
  const harness = createHarness();
  harness.patchState({ target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg' } });
  const built = harness.controller.createParsedFieldStateRecord();
  assert.ok(built);
  await harness.controller.applyRestoredParsedFieldState(built, { sameSource: true, projectSavedSource: true });
  assert.ok(!harness.log.some((entry) => entry.startsWith('applySelectedUrl')), 'no projection when the source is unchanged');
  assert.ok(harness.log.includes('saveFieldState'));
  assert.ok(harness.log.includes('render'));
});

test('applyRestoredParsedFieldState keeps a live edit-session reset baseline instead of stomping it (#429)', async () => {
  const harness = createHarness();
  harness.patchState({ target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg' } });
  const built = harness.controller.createParsedFieldStateRecord();
  assert.ok(built);
  const sessionBaseline = {
    sourceUrl: 'https://images.example.test/a/0.jpg',
    activeFieldId: null,
    failedFieldId: null,
    successfulFieldIds: [],
    unchangedFieldIds: [],
    unlockedFieldIds: [],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    fieldDigitWidthSpecs: [],
  };
  harness.patchState({ parsedFieldResetBaseline: sessionBaseline });

  // The snapshot-subscription restore runs after every successful load; it must not replace the
  // baseline captured at the user's first edit — that is what made Reset all flicker and vanish.
  await harness.controller.applyRestoredParsedFieldState(built, { sameSource: true, projectSavedSource: false });

  assert.equal(harness.getState().parsedFieldResetBaseline, sessionBaseline, 'the session baseline object survives the restore');
});

test('applyRestoredParsedFieldState adopts the record baseline when no session baseline exists', async () => {
  const harness = createHarness();
  harness.patchState({ target: { ...harness.getState().target, selectedUrl: 'https://images.example.test/a/1.jpg' } });
  const built = harness.controller.createParsedFieldStateRecord();
  assert.ok(built);
  assert.equal(harness.getState().parsedFieldResetBaseline, null);

  await harness.controller.applyRestoredParsedFieldState(built, { sameSource: true, projectSavedSource: false });

  assert.equal(
    harness.getState().parsedFieldResetBaseline?.sourceUrl,
    built.sourceUrl,
    'a fresh restore seeds the baseline from the record',
  );
});
