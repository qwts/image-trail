import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../../extension/src/core/url/tokenize-fields.js';
import { FieldEditorController, type FieldEditorControllerDeps } from '../../extension/src/ui/panel/field-editor-controller.js';

// The field editor has no window/DOM code of its own, but the reject path and every state-only effect
// end in a `render`. This suite runs under happy-dom (tests/dom/register.ts preload) with `render`
// (and the panel-owned `applyPanelState` it stands in for) wired to a real element, so the editor flow
// is exercised as an integration: an observable state change must surface in the DOM the panel rebuilds.

interface HarnessOptions {
  // Mirror the real parsed-field-state-sync queue (`transformQueue.then(run)`): thunks start on a
  // microtask, not at enqueue time — the window in which rapid +/- steps coalesce (#373).
  readonly chainedQueue?: boolean;
}

interface Harness {
  readonly controller: FieldEditorController;
  readonly status: HTMLElement;
  readonly appliedUrls: string[];
  getState(): PanelState;
  fieldId(label: string): string;
  settle(): Promise<void>;
}

function createHarness(rawUrl: string, options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const pending: Promise<unknown>[] = [];
  const appliedUrls: string[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const status = document.createElement('div');
  document.body.append(status);
  const render = (): void => {
    // Stand in for the panel's real render: reflect the observable state into the DOM.
    status.textContent = state.message;
    status.dataset['status'] = state.status;
    status.dataset['splitCount'] = String(state.fieldSplitSpecs.length);
  };
  const deps: FieldEditorControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render,
    scheduleFiniteCaptureErrorReset: () => {},
    currentRawUrl: () => rawUrl,
    currentUrlModel: () => parseUrl(rawUrl),
    pruneInvalidFieldSplitSpecsForUrl: (current) => current,
    applyPanelState: (nextState, opts = {}) => {
      if (nextState === state) return false;
      state = nextState;
      if (opts.render) render();
      return true;
    },
    enqueueFieldInteraction: (run) => {
      if (options.chainedQueue) {
        queue = queue.then(run);
        return;
      }
      pending.push(run());
    },
    saveFieldState: async () => {},
    saveUrlTemplateFromCurrentFields: async () => {},
    applySelectedUrl: async (url) => {
      appliedUrls.push(url);
      return true;
    },
  };
  return {
    controller: new FieldEditorController(deps),
    status,
    appliedUrls,
    getState: () => state,
    fieldId: (label) => {
      const field = collectUrlFields(parseUrl(rawUrl)).find((candidate) => candidate.label === label);
      assert.ok(field, `field "${label}" not found in ${rawUrl}`);
      return field.id;
    },
    settle: async () => {
      await Promise.all(pending);
      await queue;
    },
  };
}

test('rejectUrlEditorInput renders the data-URL error into the DOM', () => {
  const harness = createHarness('https://example.test/image?date=01012001');
  harness.controller.rejectUrlEditorInput();
  assert.equal(harness.status.dataset['status'], 'error');
  assert.match(harness.status.textContent ?? '', /cannot use data URLs/);
});

test('a valid split-apply renders the new split count into the DOM', async () => {
  const harness = createHarness('https://example.test/image?date=01012001');
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern: '2-2-4' });
  await harness.settle();
  assert.equal(harness.status.dataset['splitCount'], '1');
  assert.equal(harness.getState().fieldSplitSpecs.length, 1);
});

test('an invalid split-apply renders the failure message into the DOM', async () => {
  const harness = createHarness('https://example.test/image?date=01012001');
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern: '2-2' });
  await harness.settle();
  assert.equal(harness.status.dataset['status'], 'error');
  assert.match(harness.status.textContent ?? '', /Split pattern totals/);
});

test('rapid +/- steps on one field coalesce into a single net load (latest wins, #373)', async () => {
  const harness = createHarness('https://example.test/image?index=10', { chainedQueue: true });
  const fieldId = harness.fieldId('query index');

  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: 1 });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: 1 });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: 1 });
  await harness.settle();

  assert.deepEqual(harness.appliedUrls, ['https://example.test/image?index=13'], 'three queued presses load once, at the net value');
});

test('a queued +/- pair nets to zero and loads nothing (#373)', async () => {
  const harness = createHarness('https://example.test/image?index=10', { chainedQueue: true });
  const fieldId = harness.fieldId('query index');

  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: 1 });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: -1 });
  await harness.settle();

  assert.deepEqual(harness.appliedUrls, [], 'the netted-out burst must not issue any load');
});

test('an interleaved non-step interaction stops step folding so ordering is preserved (#373)', async () => {
  const harness = createHarness('https://example.test/image?index=10&date=01012001', { chainedQueue: true });
  const stepFieldId = harness.fieldId('query index');
  const splitFieldId = harness.fieldId('query date');

  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: stepFieldId, transformId: 'step', delta: 1 });
  harness.controller.enqueueFieldTransform({
    name: 'field/transform',
    fieldId: splitFieldId,
    transformId: 'split-apply',
    pattern: '2-2-4',
  });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: stepFieldId, transformId: 'step', delta: 1 });
  await harness.settle();

  // The second step runs AFTER the split in queue order instead of folding into the first step.
  // The harness URL never advances, so each step loads +1 from the same base.
  assert.deepEqual(harness.appliedUrls, [
    'https://example.test/image?index=11&date=01012001',
    'https://example.test/image?index=11&date=01012001',
  ]);
  assert.equal(harness.getState().fieldSplitSpecs.length, 1, 'the split between the steps still applied');
});
