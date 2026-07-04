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

interface Harness {
  readonly controller: FieldEditorController;
  readonly status: HTMLElement;
  getState(): PanelState;
  fieldId(label: string): string;
  settle(): Promise<void>;
}

function createHarness(rawUrl: string): Harness {
  let state = createInitialPanelState(0);
  const pending: Promise<unknown>[] = [];
  const status = document.createElement('div');
  document.body.append(status);
  const render = (): void => {
    // Stand in for the panel's real render: reflect the observable state into the DOM.
    status.textContent = state.message;
    status.dataset.status = state.status;
    status.dataset.splitCount = String(state.fieldSplitSpecs.length);
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
      pending.push(run());
    },
    saveFieldState: async () => {},
    saveUrlTemplateFromCurrentFields: async () => {},
    applySelectedUrl: async () => true,
  };
  return {
    controller: new FieldEditorController(deps),
    status,
    getState: () => state,
    fieldId: (label) => {
      const field = collectUrlFields(parseUrl(rawUrl)).find((candidate) => candidate.label === label);
      assert.ok(field, `field "${label}" not found in ${rawUrl}`);
      return field.id;
    },
    settle: () => Promise.all(pending).then(() => undefined),
  };
}

test('rejectUrlEditorInput renders the data-URL error into the DOM', () => {
  const harness = createHarness('https://example.test/image?date=01012001');
  harness.controller.rejectUrlEditorInput();
  assert.equal(harness.status.dataset.status, 'error');
  assert.match(harness.status.textContent ?? '', /cannot use data URLs/);
});

test('a valid split-apply renders the new split count into the DOM', async () => {
  const harness = createHarness('https://example.test/image?date=01012001');
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern: '2-2-4' });
  await harness.settle();
  assert.equal(harness.status.dataset.splitCount, '1');
  assert.equal(harness.getState().fieldSplitSpecs.length, 1);
});

test('an invalid split-apply renders the failure message into the DOM', async () => {
  const harness = createHarness('https://example.test/image?date=01012001');
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern: '2-2' });
  await harness.settle();
  assert.equal(harness.status.dataset.status, 'error');
  assert.match(harness.status.textContent ?? '', /Split pattern totals/);
});
