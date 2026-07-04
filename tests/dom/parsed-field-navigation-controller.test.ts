import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState } from '../../extension/src/core/types.js';
import type { TargetSelectionSnapshot } from '../../extension/src/content/page-adapter.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../../extension/src/core/url/types.js';
import {
  ParsedFieldNavigationController,
  type ParsedFieldNavigationControllerDeps,
} from '../../extension/src/ui/panel/parsed-field-navigation-controller.js';

// Runs under happy-dom (tests/dom/register.ts preload) to exercise the candidate-scan drain: it
// funnels through checkImageRequestPolicy, which reads document.location.href. With no extension
// runtime the policy resolves to 'unknown' (non-skippable), so the ordered neighbor candidates are
// tried directly and failures are governed by the injected applySelectedUrl.
window.location.href = 'https://example.test/gallery';

const BASE_URL = 'https://example.test/gallery?image=10';

function baseModel(): ParsedUrlModel {
  return parseUrl(BASE_URL);
}

function navigableQueryField(field: UrlField): boolean {
  return field.location === 'query' && (field.tokenKind === 'int' || field.tokenKind === 'hex');
}

function intFieldId(): string {
  const found = collectUrlFields(baseModel()).find(navigableQueryField);
  assert.ok(found, 'expected a navigable int query field in the base URL');
  return found.id;
}

function makeSnapshot(selected: { readonly url: string; readonly handleId: string } | null): TargetSelectionSnapshot {
  return {
    mode: selected ? 'manual' : 'none',
    picking: false,
    grabModeActive: false,
    candidateCount: selected ? 1 : 0,
    selected: selected
      ? ({ url: selected.url, handleId: selected.handleId, width: 100, height: 80 } as TargetSelectionSnapshot['selected'])
      : null,
    fillScreen: false,
    objectFit: 'contain',
    message: '',
  } as TargetSelectionSnapshot;
}

interface ApplyCall {
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
  readonly options: { readonly preloadDirection?: 1 | -1; readonly quietFailure?: boolean } | undefined;
}

interface HarnessOptions {
  readonly applyResult?: (url: string, callIndex: number) => boolean;
  readonly requestResult?: (callIndex: number) => 'ok' | 'throttled';
}

interface Harness {
  readonly controller: ParsedFieldNavigationController;
  readonly log: string[];
  readonly applyCalls: ApplyCall[];
  requestCalls(): number;
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const applyCalls: ApplyCall[] = [];
  let requestCalls = 0;

  const deps: ParsedFieldNavigationControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    loadGrabSettings: async () => {
      log.push('loadGrabSettings');
    },
    saveFieldState: async () => {
      log.push('saveFieldState');
    },
    saveUrlTemplateFromCurrentFields: async () => {
      log.push('saveUrlTemplate');
    },
    currentNavigationBaseModel: () => baseModel(),
    currentNavigationBaseRawUrl: () => BASE_URL,
    currentKnownImageFingerprint: () => null,
    applyFieldLoadResult: (input) => input,
    saveUrlReviewStatus: async () => {},
    isNavigableQueryField: navigableQueryField,
    governor: () => ({
      request: <T>(operation: () => T) => {
        requestCalls += 1;
        const status = options.requestResult ? options.requestResult(requestCalls) : 'ok';
        return status === 'ok' ? { value: operation(), status: 'ok' as const } : { value: null, status: 'throttled' as const };
      },
      nextReadyDelayMs: () => 0,
      requestsInWindow: () => 1,
    }),
    bufferedNav: () => ({
      step: async () => 'blocked',
    }),
    neighborPreload: () => ({
      get isActive() {
        return false;
      },
      get runId() {
        return 7;
      },
    }),
    projectionApplication: () => ({
      applySelectedUrl: async (url, attemptedFieldIds, opts) => {
        const callIndex = applyCalls.length;
        applyCalls.push({ url, attemptedFieldIds: attemptedFieldIds ?? [], options: opts });
        return options.applyResult ? options.applyResult(url, callIndex) : true;
      },
      beginProjectionSession: () => null,
      applyProjectionToSelectedImage: () => null,
      isCurrentProjectionSession: () => true,
    }),
    pageAdapter: () => ({
      getSnapshot: () => makeSnapshot({ url: BASE_URL, handleId: 'handle-1' }),
    }),
  };

  return {
    controller: new ParsedFieldNavigationController(deps),
    log,
    applyCalls,
    requestCalls: () => requestCalls,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

// The drain parks itself with a real 25ms delay() between retry/wait steps, so polling (rather than
// a fixed microtask flush) is what lets those later steps run before we assert.
async function until(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
}

test('the candidate scan applies the nearest neighbor as a quiet, direction-tagged parsed-field load', async () => {
  const harness = createHarness();
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await until(() => harness.applyCalls.length >= 1);

  assert.equal(harness.applyCalls.length, 1);
  assert.match(harness.applyCalls[0]!.url, /image=11$/);
  assert.deepEqual(harness.applyCalls[0]!.attemptedFieldIds, [intFieldId()]);
  assert.deepEqual(harness.applyCalls[0]!.options, { preloadDirection: 1, quietFailure: true });
  assert.ok(harness.log.includes('saveUrlTemplate'));
});

test('a throttled governor makes the drain wait and retry instead of dropping the step', async () => {
  const harness = createHarness({ requestResult: (call) => (call === 1 ? 'throttled' : 'ok') });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await until(() => harness.applyCalls.length >= 1);

  assert.ok(harness.requestCalls() >= 2, 'the throttled step is retried, not abandoned');
  assert.equal(harness.applyCalls.length, 1, 'the load happens once the governor frees up');
  assert.match(harness.applyCalls[0]!.url, /image=11$/);
});

test('a failed candidate is skipped and the drain advances to the next loadable neighbor', async () => {
  const harness = createHarness({ applyResult: (url) => !url.endsWith('image=11') });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await until(() => harness.applyCalls.length >= 2);

  assert.deepEqual(
    harness.applyCalls.map((call) => call.url),
    ['https://example.test/gallery?image=11', 'https://example.test/gallery?image=12'],
  );
  assert.ok(harness.log.includes('saveUrlTemplate'), 'the eventual load still saves the URL template');
});

test('a run of unloadable candidates terminates under the skip budget instead of hammering forever', async () => {
  const harness = createHarness({ applyResult: () => false });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  // Poll until the bounded drain has parked itself (message set, no loads pending).
  for (let i = 0; i < 200 && !harness.getState().message.startsWith('Stopped after skipping'); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.match(harness.getState().message, /^Stopped after skipping \d+ unavailable images?; no loadable image found in that direction\.$/);
  // Bounded: every attempt is a distinct neighbor, capped by the fill-scan window (no infinite retry).
  assert.ok(harness.applyCalls.length > 0 && harness.applyCalls.length <= 50, `bounded attempts, got ${harness.applyCalls.length}`);
  const urls = new Set(harness.applyCalls.map((call) => call.url));
  assert.equal(urls.size, harness.applyCalls.length, 'each attempt is a distinct URL');
});
