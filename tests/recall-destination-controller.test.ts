import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import { createDisplayRecord } from '../extension/src/core/display-records.js';
import type { PanelState, RecallCandidate } from '../extension/src/core/types.js';
import type { RecallStore, RecallCandidatesResult, RecallRecordsResult } from '../extension/src/content/recall-store.js';
import {
  RecallDestinationController,
  type RecallDestinationControllerDeps,
} from '../extension/src/ui/panel/recall-destination-controller.js';

// This flat suite stubs window with a manual timer registry so the destination-open animation window
// (waitForRecallOpening) and the success-message clear timer fire deterministically instead of on
// the real clock. Browser timer behavior lives in tests/dom/recall-destination-controller.test.ts.
interface StubTimer {
  readonly id: number;
  readonly callback: () => void;
  readonly delayMs: number;
}

const timers: StubTimer[] = [];
const clearedTimerIds: number[] = [];
let nextTimerId = 1;

globalThis.window = {
  location: { href: 'https://images.example.test/gallery' },
  setTimeout: (callback: () => void, delayMs: number): number => {
    const id = nextTimerId++;
    timers.push({ id, callback, delayMs });
    return id;
  },
  clearTimeout: (id: number): void => {
    clearedTimerIds.push(id);
  },
} as unknown as Window & typeof globalThis;

// Fires the destination-open animation timers (waitForRecallOpening and the deferred busy check, both
// <= 200ms) round by round, draining real micro/macrotasks in between so awaited timer promises
// resume before the next batch fires. The 1800ms message-clear timer is deliberately left pending —
// tests fire it explicitly.
async function flushAnimationTimers(): Promise<void> {
  for (let round = 0; round < 5; round += 1) {
    // Settle real micro/macrotasks first so in-flight awaits register their timers before firing.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const due = timers.filter((timer) => timer.delayMs <= 200 && !clearedTimerIds.includes(timer.id));
    for (const timer of due) {
      timers.splice(timers.indexOf(timer), 1);
      timer.callback();
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function candidate(id: string): RecallCandidate {
  return {
    ...createDisplayRecord({ id, url: `https://example.test/${id}.jpg`, source: 'bookmark' }),
    envelopeCreatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function okCandidates(candidates: readonly RecallCandidate[], overrides: Partial<RecallCandidatesResult> = {}): RecallCandidatesResult {
  return {
    ok: true,
    candidates,
    total: candidates.length,
    nextOffset: 0,
    hasMore: false,
    failedCount: 0,
    message: 'Recalled records loaded.',
    ...overrides,
  };
}

interface Harness {
  readonly controller: RecallDestinationController;
  readonly log: string[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

interface HarnessOptions {
  readonly loadCandidates?: (input: { readonly offset: number }) => Promise<RecallCandidatesResult>;
  readonly recall?: (ids: readonly string[]) => Promise<RecallRecordsResult>;
  readonly hasStore?: boolean;
}

function createHarness(options: HarnessOptions = {}): Harness {
  timers.length = 0;
  clearedTimerIds.length = 0;
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const store = {
    loadCandidates: async (input: { readonly offset: number }) => {
      log.push(`loadCandidates:${input.offset}`);
      if (options.loadCandidates) return options.loadCandidates(input);
      return okCandidates([candidate('candidate-1')]);
    },
    recall: async (ids: readonly string[]) => {
      log.push(`recall:${ids.join(',')}`);
      if (options.recall) return options.recall(ids);
      return { ok: true, records: [], failedCount: 0, message: 'Recalled 1 record.' } as RecallRecordsResult;
    },
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
    loadBookmarkPage: async (offset, opts) => {
      log.push(`loadBookmarkPage:${offset}:${String(opts?.render ?? true)}`);
    },
    ensurePanelPositionRestored: async () => {
      log.push('ensurePanelPositionRestored');
    },
    refreshBlobKeyStatus: async () => {
      log.push('refreshBlobKeyStatus');
    },
    recallStore: () => (options.hasStore === false ? null : store),
  };
  return {
    controller: new RecallDestinationController(deps),
    log,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

test('openRecallDestination restores panel position, activates Recall, and pages from the visible-queue limit', async () => {
  const harness = createHarness();
  await harness.controller.openRecallDestination();
  assert.equal(harness.log[0], 'ensurePanelPositionRestored');
  assert.equal(harness.getState().activeDestination, 'recall');
  assert.equal(harness.getState().recall.busy, true, 'stale candidates stay non-interactive while the route reloads');
  assert.ok(harness.log.includes('loadCandidates:30'), 'the initial page starts past the visible queue (bookmarkLimit)');
  await flushAnimationTimers();
  assert.equal(harness.getState().recall.candidates.length, 1);
});

test('openRecallDestination without a recall store still activates Recall and skips loading', async () => {
  const harness = createHarness({ hasStore: false });
  await harness.controller.openRecallDestination();
  assert.equal(harness.getState().activeDestination, 'recall');
  assert.deepEqual(harness.log, ['ensurePanelPositionRestored', 'render']);
});

test('the initial route render exposes busy state without a redundant targeted render', async () => {
  let releaseLoad = (): void => {};
  const gate = new Promise<void>((resolve) => {
    releaseLoad = resolve;
  });
  const harness = createHarness({ loadCandidates: () => gate.then(() => okCandidates([candidate('candidate-1')])) });
  await harness.controller.openRecallDestination();
  assert.equal(harness.getState().recall.busy, true);
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'render' || entry === 'renderRecallOnly'),
    ['render'],
    'the first full route render owns the visible busy state',
  );
  await flushAnimationTimers();
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'renderRecallOnly'),
    [],
    'the still-pending load does not rebuild a busy state that is already visible',
  );
  releaseLoad();
  await flushAnimationTimers();
  assert.equal(harness.getState().recall.busy, false);
  assert.equal(harness.getState().recall.candidates.length, 1);
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'renderRecallOnly'),
    ['renderRecallOnly'],
  );
});

test('the deferred busy render is dropped when the load completes within the animation window', async () => {
  const harness = createHarness();
  await harness.controller.openRecallDestination();
  await flushAnimationTimers();
  // One render for the completed load; the deferred busy check found pending=false and skipped.
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'renderRecallOnly'),
    ['renderRecallOnly'],
  );
  assert.equal(harness.getState().recall.busy, false);
});

test('loadRecallCandidates append merges new candidates and replace resets them', async () => {
  const pages: Record<number, RecallCandidatesResult> = {
    0: okCandidates([candidate('candidate-1')]),
    1: okCandidates([candidate('candidate-2')]),
    2: okCandidates([candidate('candidate-3')]),
  };
  const harness = createHarness({ loadCandidates: async (input) => pages[input.offset] ?? okCandidates([]) });
  await harness.controller.loadRecallCandidates({ offset: 0, append: false });
  await harness.controller.loadRecallCandidates({ offset: 1, append: true });
  assert.deepEqual(
    harness.getState().recall.candidates.map((record) => record.id),
    ['candidate-1', 'candidate-2'],
  );
  await harness.controller.loadRecallCandidates({ offset: 2, append: false });
  assert.deepEqual(
    harness.getState().recall.candidates.map((record) => record.id),
    ['candidate-3'],
  );
});

test("renderScope 'panel' routes both the busy and completion renders through the full panel render", async () => {
  const harness = createHarness();
  await harness.controller.loadRecallCandidates({ offset: 0, append: false, renderScope: 'panel' });
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'render' || entry === 'renderRecallOnly'),
    ['render', 'render'],
  );
});

test('showBusy:false skips the busy state and renders once on completion', async () => {
  const harness = createHarness();
  await harness.controller.loadRecallCandidates({ offset: 0, append: false, showBusy: false });
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'render' || entry === 'renderRecallOnly'),
    ['renderRecallOnly'],
  );
});

test('an encryption-locked load refreshes the blob-key status before surfacing the error', async () => {
  const harness = createHarness({
    loadCandidates: async () =>
      ({ ...okCandidates([]), ok: false, reason: 'encryption-locked', message: 'Unlock encryption to recall.' }) as RecallCandidatesResult,
  });
  await harness.controller.loadRecallCandidates({ offset: 0, append: false });
  const tail = harness.log.slice(-2);
  assert.deepEqual(tail, ['refreshBlobKeyStatus', 'renderRecallOnly']);
  assert.equal(harness.getState().recall.message, 'Unlock encryption to recall.');
  assert.equal(harness.getState().recall.messageIsError, true);
});

test('a successful load schedules the message clear; firing it clears the message and rerenders Recall', async () => {
  const harness = createHarness();
  await harness.controller.loadRecallCandidates({ offset: 0, append: false });
  const messageTimer = timers.find((timer) => timer.delayMs === 1800);
  assert.ok(messageTimer, 'the success message must schedule its clear timer');
  assert.equal(harness.getState().recall.message, 'Recalled records loaded.');
  messageTimer.callback();
  assert.equal(harness.getState().recall.message, undefined);
  assert.equal(harness.log.at(-1), 'renderRecallOnly');
});

test('clearRecallMessageTimer cancels a scheduled message clear', async () => {
  const harness = createHarness();
  await harness.controller.loadRecallCandidates({ offset: 0, append: false });
  const messageTimer = timers.find((timer) => timer.delayMs === 1800);
  assert.ok(messageTimer);
  harness.controller.clearRecallMessageTimer();
  assert.ok(clearedTimerIds.includes(messageTimer.id));
  harness.controller.clearRecallMessageTimer();
  assert.equal(clearedTimerIds.length, 1, 'a second clear must be a no-op');
});

test('refreshRecallIfOpen refreshes only the active Recall destination, without the busy state', async () => {
  const closed = createHarness();
  closed.controller.refreshRecallIfOpen();
  assert.deepEqual(closed.log, []);

  const open = createHarness();
  open.patchState({ activeDestination: 'recall' });
  open.controller.refreshRecallIfOpen();
  await flushAnimationTimers();
  assert.ok(open.log.includes('loadCandidates:30'));
  assert.deepEqual(
    open.log.filter((entry) => entry === 'render' || entry === 'renderRecallOnly'),
    ['renderRecallOnly'],
    'a background refresh must not flash the busy state',
  );
});

test('recallSelectedRecords is a no-op without a selection', async () => {
  const harness = createHarness();
  await harness.controller.recallSelectedRecords();
  assert.deepEqual(harness.log, []);
});

test('recallSelectedRecords reloads the first queue page before completing and refreshing', async () => {
  const harness = createHarness({
    recall: async () =>
      ({
        ok: true,
        records: [createDisplayRecord({ id: 'candidate-1', url: 'https://example.test/candidate-1.jpg', source: 'bookmark' })],
        failedCount: 0,
        message: 'Recalled 1 record.',
      }) as RecallRecordsResult,
  });
  harness.patchState({ recall: { ...harness.getState().recall, selectedIds: ['candidate-1'] } });
  await harness.controller.recallSelectedRecords();
  assert.deepEqual(harness.log, ['renderRecallOnly', 'recall:candidate-1', 'loadBookmarkPage:0:false', 'renderPanelAndRefreshRecall']);
  assert.equal(harness.getState().recall.message, 'Recalled 1 record.');
});

test('an encryption-locked recall refreshes the blob-key status and surfaces the error in Recall', async () => {
  const harness = createHarness({
    recall: async () =>
      ({
        ok: false,
        records: [],
        failedCount: 0,
        reason: 'encryption-locked',
        message: 'Unlock encryption to recall.',
      }) as RecallRecordsResult,
  });
  harness.patchState({ recall: { ...harness.getState().recall, selectedIds: ['candidate-1'] } });
  await harness.controller.recallSelectedRecords();
  assert.deepEqual(harness.log.slice(-2), ['refreshBlobKeyStatus', 'renderRecallOnly']);
  assert.equal(harness.getState().recall.message, 'Unlock encryption to recall.');
});
