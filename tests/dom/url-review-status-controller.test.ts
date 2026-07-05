import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type {
  PanelState,
  UrlReviewStatusClearFilter,
  UrlReviewStatusRecord,
  UrlReviewStatusStore,
} from '../../extension/src/core/types.js';
import {
  UrlReviewStatusController,
  type UrlReviewStatusControllerDeps,
} from '../../extension/src/ui/panel/url-review-status-controller.js';

// Runs under happy-dom: host-scoped save/clear resolve the hostname from window.location.
window.location.href = 'https://images.example.test/gallery';

interface Harness {
  readonly controller: UrlReviewStatusController;
  readonly saved: { record: UrlReviewStatusRecord; options?: { readonly maxRecordsPerHost?: number } }[];
  readonly cleared: UrlReviewStatusClearFilter[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

function createHarness(): Harness {
  let state = createInitialPanelState(0);
  const saved: { record: UrlReviewStatusRecord; options?: { readonly maxRecordsPerHost?: number } }[] = [];
  const cleared: UrlReviewStatusClearFilter[] = [];
  const store: UrlReviewStatusStore = {
    save: async (record: UrlReviewStatusRecord, options?: { readonly maxRecordsPerHost?: number }) => {
      saved.push({ record, options });
    },
    clear: async (filter: UrlReviewStatusClearFilter) => {
      cleared.push(filter);
      return 1;
    },
  } as unknown as UrlReviewStatusStore;
  const harness: Harness = {
    controller: undefined as unknown as UrlReviewStatusController,
    saved,
    cleared,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
  const deps: UrlReviewStatusControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    urlReviewStatusStore: () => store,
    urlReviewStatusLimit: () => 42,
    fieldStatePageUrl: () => 'https://images.example.test/gallery',
  };
  (harness as { controller: UrlReviewStatusController }).controller = new UrlReviewStatusController(deps);
  return harness;
}

test('saveUrlReviewStatus persists a host-keyed record with the configured per-host cap', async () => {
  const harness = createHarness();
  harness.patchState({ activeFieldId: 'f1' });
  await harness.controller.saveUrlReviewStatus('failed', 'https://images.example.test/a/1.jpg', ['f1', 'f2'], 'looks off');
  assert.equal(harness.saved.length, 1);
  const saved = harness.saved[0];
  assert.ok(saved, 'a save call was recorded');
  const { record, options } = saved;
  assert.equal(record.hostname, 'images.example.test');
  assert.equal(record.pageUrl, 'https://images.example.test/gallery');
  assert.equal(record.sourceUrl, 'https://images.example.test/a/1.jpg');
  assert.equal(record.status, 'failed');
  assert.deepEqual(record.fieldIds, ['f1', 'f2']);
  assert.equal(record.activeFieldId, 'f1');
  assert.equal(record.reason, 'looks off');
  assert.equal(options?.maxRecordsPerHost, 42);
});

test('clearUrlReviewStatus resolves the hostname scope', async () => {
  const harness = createHarness();
  await harness.controller.clearUrlReviewStatus('hostname');
  assert.deepEqual(harness.cleared, [{ scope: 'hostname', hostname: 'images.example.test' }]);
});

test('clearUrlReviewStatus resolves the page scope with the current page url', async () => {
  const harness = createHarness();
  await harness.controller.clearUrlReviewStatus('page');
  assert.deepEqual(harness.cleared, [{ scope: 'page', hostname: 'images.example.test', pageUrl: 'https://images.example.test/gallery' }]);
});

test('clearUrlReviewStatus resolves the source scope from the draft/selected url', async () => {
  const harness = createHarness();
  harness.patchState({ draftUrl: 'https://images.example.test/a/7.jpg' });
  await harness.controller.clearUrlReviewStatus('source');
  assert.deepEqual(harness.cleared, [
    { scope: 'source', hostname: 'images.example.test', sourceUrl: 'https://images.example.test/a/7.jpg' },
  ]);
});

test('clearUrlReviewStatus with no selected source clears nothing', async () => {
  const harness = createHarness();
  await harness.controller.clearUrlReviewStatus('source');
  assert.deepEqual(harness.cleared, [], 'no filter means no store.clear call');
  assert.match(harness.getState().message, /Cleared 0 URL review status records/);
});
