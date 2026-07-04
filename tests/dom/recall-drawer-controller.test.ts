import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord } from '../../extension/src/core/display-records.js';
import type { PanelState, RecallCandidate } from '../../extension/src/core/types.js';
import type { RecallStore, RecallCandidatesResult } from '../../extension/src/content/recall-store.js';
import { RecallDrawerController, type RecallDrawerControllerDeps } from '../../extension/src/ui/panel/recall-drawer-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) to exercise the drawer-side
// geometry against a real element rect and window.innerWidth, and the drawer-open animation window
// against real window timers. happy-dom elements report a zero rect, so each harness pins
// getBoundingClientRect to the geometry under test; the viewport is happy-dom's default 1024x768.
window.location.href = 'https://images.example.test/gallery';

function candidate(id: string): RecallCandidate {
  return {
    ...createDisplayRecord({ id, url: `https://example.test/${id}.jpg`, source: 'bookmark' }),
    envelopeCreatedAt: '2026-01-01T00:00:00.000Z',
  };
}

interface Harness {
  readonly controller: RecallDrawerController;
  readonly log: string[];
  getState(): PanelState;
}

function createHarness(options: { readonly rect?: { left: number; right: number }; readonly loadDelayMs?: number } = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const root = document.createElement('div');
  document.body.append(root);
  const rect = options.rect ?? { left: 20, right: 340 };
  Object.defineProperty(root, 'getBoundingClientRect', {
    value: () => ({ left: rect.left, right: rect.right, top: 100, bottom: 400, width: rect.right - rect.left, height: 300 }),
  });
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
  const deps: RecallDrawerControllerDeps = {
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
    root: () => root,
    recallStore: () => store,
  };
  return { controller: new RecallDrawerController(deps), log, getState: () => state };
}

test('the drawer opens to the right when there is room beside the panel', async () => {
  const harness = createHarness({ rect: { left: 20, right: 340 } });
  await harness.controller.openRecallDrawer();
  assert.equal(harness.getState().recall.side, 'right');
});

test('the drawer opens to the left when the panel sits near the right edge', async () => {
  // rightSpace = 1024 - 1010 = 14 (< 360) and leftSpace = 700, so the drawer flips left.
  const harness = createHarness({ rect: { left: 700, right: 1010 } });
  await harness.controller.openRecallDrawer();
  assert.equal(harness.getState().recall.side, 'left');
});

test('a load finishing within the open animation renders once, after the animation settles', async () => {
  const harness = createHarness({ loadDelayMs: 30 });
  await harness.controller.openRecallDrawer();
  await new Promise((resolve) => setTimeout(resolve, 60));
  // The load is done but the 190ms open-animation window is still running: no drawer render yet.
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
