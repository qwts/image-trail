import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import {
  ParsedFieldStateRecordController,
  type ParsedFieldStateRecordControllerDeps,
} from '../extension/src/ui/panel/parsed-field-state-record-controller.js';

// Window-free paths only: `restoreParsedFieldStateForCurrentPanel` chains the injected grab-settings
// load and the field-state restore without touching window. The record build/apply paths read
// window.location via hostnameFromLocation and run in tests/dom/parsed-field-state-record-controller.test.ts.
interface Harness {
  readonly controller: ParsedFieldStateRecordController;
  readonly log: string[];
}

function createHarness(): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const deps: ParsedFieldStateRecordControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    currentRawUrl: () => 'https://images.example.test/a/1.jpg',
    applySelectedUrl: async () => {
      log.push('applySelectedUrl');
      return true;
    },
    syncGrabSettings: () => log.push('syncGrabSettings'),
    loadGrabSettings: async (options) => {
      log.push(`loadGrabSettings:${String(options?.render ?? true)}`);
    },
    fieldStatePageUrl: () => 'https://images.example.test/gallery',
    nextFieldStateUpdatedAt: () => '2026-07-03T00:00:00.000Z',
    saveFieldState: async () => void log.push('saveFieldState'),
    restoreFieldState: async (options) => {
      log.push(`restoreFieldState:${String(options?.projectSavedSource ?? false)}`);
    },
  };
  return { controller: new ParsedFieldStateRecordController(deps), log };
}

test('restoreParsedFieldStateForCurrentPanel loads grab settings (no render) then restores projecting the saved source', async () => {
  const { controller, log } = createHarness();
  controller.restoreParsedFieldStateForCurrentPanel();
  // The chain is promise-driven; flush microtasks.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(log, ['loadGrabSettings:false', 'restoreFieldState:true']);
});
