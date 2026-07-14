import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord } from '../../extension/src/core/display-records.js';
import type { PanelState, RecallCandidate } from '../../extension/src/core/types.js';
import type { RecallStore, RecallCandidatesResult } from '../../extension/src/content/recall-store.js';
import {
  RecallDestinationController,
  type RecallDestinationControllerDeps,
} from '../../extension/src/ui/panel/recall-destination-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) to exercise destination opening
// and its animation window against real browser timers.
window.location.href = 'https://images.example.test/gallery';

function candidate(id: string): RecallCandidate {
  return {
    ...createDisplayRecord({ id, url: `https://example.test/${id}.jpg`, source: 'bookmark' }),
    envelopeCreatedAt: '2026-01-01T00:00:00.000Z',
  };
}

interface Harness {
  readonly controller: RecallDestinationController;
  readonly log: string[];
  getState(): PanelState;
}

function createHarness(options: { readonly loadDelayMs?: number } = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const store = {
    loadCandidates: async (): Promise<RecallCandidatesResult> => {
      if (options.loadDelayMs) await new Promise((resolve) => setTimeout(resolve, options.loadDelayMs));
      return {
        ok: true,
        candidates: [candidate('candidate-1')],
        total: 1,
        nextOffset: 0,
        hasMore: false,
        failedCount: 0,
        message: 'Recalled records loaded.',
      };
    },
    recall: async () => ({ ok: true, records: [], failedCount: 0, message: '' }),
  } as unknown as RecallStore;
  const deps: RecallDestinationControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      log.push('render');
    },
    renderRecallOnly: () => {
      log.push('renderRecallOnly');
    },
    renderPanelAndRefreshRecall: () => {
      log.push('renderPanelAndRefreshRecall');
    },
    loadBookmarkPage: async () => {},
    ensurePanelPositionRestored: async () => {},
    refreshBlobKeyStatus: async () => {},
    recallStore: () => store,
  };
  return { controller: new RecallDestinationController(deps), log, getState: () => state };
}

test('opening Recall activates the in-panel destination route', async () => {
  const harness = createHarness();
  await harness.controller.openRecallDestination();
  assert.equal(harness.getState().activeDestination, 'recall');
});

test('a load finishing within the open animation renders once, after the animation settles', async () => {
  const harness = createHarness({ loadDelayMs: 30 });
  await harness.controller.openRecallDestination();
  await new Promise((resolve) => setTimeout(resolve, 60));
  // The load is done but the 190ms open-animation window is still running: no targeted render yet.
  assert.equal(harness.log.filter((entry) => entry === 'renderRecallOnly').length, 0);
  await new Promise((resolve) => setTimeout(resolve, 220));
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'renderRecallOnly'),
    ['renderRecallOnly'],
    'the completed load renders exactly once — the deferred busy render is dropped',
  );
  assert.equal(harness.getState().recall.busy, false);
  assert.deepEqual(
    harness.getState().recall.candidates.map((record) => record.id),
    ['candidate-1'],
  );
});
