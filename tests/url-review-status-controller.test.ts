import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState, UrlReviewStatusClearFilter, UrlReviewStatusStore } from '../extension/src/core/types.js';
import { UrlReviewStatusController, type UrlReviewStatusControllerDeps } from '../extension/src/ui/panel/url-review-status-controller.js';

// Window-free paths only: the `all` clear scope resolves without a hostname, and save short-circuits
// before hostnameFromLocation() when there is no store or no fields. Host-scoped paths run under
// happy-dom in tests/dom/url-review-status-controller.test.ts.
interface Harness {
  readonly controller: UrlReviewStatusController;
  readonly log: string[];
  readonly cleared: UrlReviewStatusClearFilter[];
  getState(): PanelState;
  store: UrlReviewStatusStore | null;
}

function createHarness(options: { readonly store?: UrlReviewStatusStore | null } = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const cleared: UrlReviewStatusClearFilter[] = [];
  const defaultStore: UrlReviewStatusStore = {
    save: async () => void log.push('save'),
    clear: async (filter: UrlReviewStatusClearFilter) => {
      cleared.push(filter);
      return 3;
    },
  } as unknown as UrlReviewStatusStore;
  const harness: Harness = {
    controller: undefined as unknown as UrlReviewStatusController,
    log,
    cleared,
    getState: () => state,
    store: options.store === undefined ? defaultStore : options.store,
  };
  const deps: UrlReviewStatusControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    urlReviewStatusStore: () => harness.store,
    urlReviewStatusLimit: () => 50,
    fieldStatePageUrl: () => 'https://images.example.test/gallery',
  };
  (harness as { controller: UrlReviewStatusController }).controller = new UrlReviewStatusController(deps);
  return harness;
}

test('saveUrlReviewStatus is a no-op without a store', async () => {
  const harness = createHarness({ store: null });
  await harness.controller.saveUrlReviewStatus('failed', 'https://x/1', ['f1']);
  assert.deepEqual(harness.log, []);
});

test('saveUrlReviewStatus is a no-op when there are no attempted fields', async () => {
  const harness = createHarness();
  await harness.controller.saveUrlReviewStatus('failed', 'https://x/1', []);
  assert.ok(!harness.log.includes('save'));
});

test('clearUrlReviewStatus("all") clears every record and reports the count', async () => {
  const harness = createHarness();
  await harness.controller.clearUrlReviewStatus('all');
  assert.deepEqual(harness.cleared, [{ scope: 'all' }]);
  assert.match(harness.getState().message, /Cleared 3 URL review status records/);
  // start → render, complete → render.
  assert.deepEqual(
    harness.log.filter((entry) => entry === 'render'),
    ['render', 'render'],
  );
});
