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
  readonly baseUrl?: string;
  readonly applyResult?: (url: string, callIndex: number) => boolean;
  readonly requestResult?: (callIndex: number) => 'ok' | 'throttled';
  readonly neighborPreloadRadius?: number;
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
    currentNavigationBaseModel: () => (options.baseUrl ? parseUrl(options.baseUrl) : baseModel()),
    currentNavigationBaseRawUrl: () => options.baseUrl ?? BASE_URL,
    currentKnownImageFingerprint: () => null,
    applyFieldLoadResult: (input) => input,
    saveUrlReviewStatus: async () => {},
    isNavigableQueryField: navigableQueryField,
    neighborPreloadRadius: () => options.neighborPreloadRadius ?? 3,
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
      getSnapshot: () => makeSnapshot({ url: options.baseUrl ?? BASE_URL, handleId: 'handle-1' }),
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

test('one press steps every included field into a single combined URL (the image-trail walk)', async () => {
  // Two navigable int query fields, both included; success history on only one of them must not
  // shrink the step to that field (#263).
  const twoFieldUrl = 'https://example.test/gallery?album=3&image=10';
  const harness = createHarness({ baseUrl: twoFieldUrl });
  const fieldIds = collectUrlFields(parseUrl(twoFieldUrl))
    .filter(navigableQueryField)
    .map((f) => f.id);
  assert.equal(fieldIds.length, 2, 'expected two navigable int query fields');
  harness.patchState({ unlockedFieldIds: fieldIds, successfulFieldIds: [fieldIds[1]!] });

  harness.controller.navigateBy(1);
  await until(() => harness.applyCalls.length >= 1);

  assert.equal(harness.applyCalls.length, 1);
  // Both fields advanced together in one combined URL — same result as clicking each field's "+".
  assert.equal(harness.applyCalls[0]!.url, 'https://example.test/gallery?album=4&image=11');
  assert.deepEqual([...harness.applyCalls[0]!.attemptedFieldIds].sort(), [...fieldIds].sort());
  // Automation navigation stays quiet on failures; they land in URL history, not a red status.
  assert.deepEqual(harness.applyCalls[0]!.options, { preloadDirection: 1, quietFailure: true });
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

// Poll until the bounded drain has parked itself (message set, no loads pending).
async function untilStopped(harness: Harness, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!harness.getState().message.startsWith('Stopped after skipping') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('a dead run short-circuits after a few consecutive misses instead of walking the scan window (#287)', async () => {
  const harness = createHarness({ applyResult: () => false });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await untilStopped(harness);

  // Every miss is a real remote request, so the drain gives up after the small consecutive-miss
  // threshold (3 at the default preload radius), not the 50-candidate scan window.
  assert.equal(harness.applyCalls.length, 3, `short-circuits after 3 consecutive misses, got ${harness.applyCalls.length}`);
  assert.equal(harness.getState().message, 'Stopped after skipping 3 unavailable images; no loadable image found in that direction.');
  const urls = new Set(harness.applyCalls.map((call) => call.url));
  assert.equal(urls.size, harness.applyCalls.length, 'each attempt is a distinct URL');
});

test('a larger neighbor-preload radius raises the consecutive-miss threshold with it', async () => {
  const harness = createHarness({ applyResult: () => false, neighborPreloadRadius: 8 });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await untilStopped(harness);

  // A user who asked for a deeper preload buffer has opted into probing that far.
  assert.equal(harness.applyCalls.length, 8, `threshold follows the radius, got ${harness.applyCalls.length}`);
});

test('a successful load resets the consecutive-miss budget so sparse galleries keep navigating', async () => {
  // Misses at call indexes 0,1 and 3,4; loads at 2 and 5 — two queued steps across two gaps of 2.
  const harness = createHarness({ applyResult: (_url, callIndex) => callIndex % 3 === 2 });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  harness.controller.navigateBy(1);
  await until(() => harness.applyCalls.filter((_, index) => index % 3 === 2).length >= 2, 5000);

  assert.equal(harness.applyCalls.length, 6, 'both steps land after skipping 2-wide gaps');
  assert.ok(!harness.getState().message.startsWith('Stopped after skipping'), 'no stop message — the drain finished by loading');
});

test('the outer safety net caps TOTAL skips per drain even when successes keep resetting the budget', async () => {
  // Repeating miss,miss,load pattern: consecutive misses never reach 3, but total skips climb by 2
  // per loaded image. A long queued burst must still park at the 50-skip outer net.
  const harness = createHarness({ applyResult: (_url, callIndex) => callIndex % 3 === 2 });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  for (let press = 0; press < 30; press += 1) harness.controller.navigateBy(1);
  await untilStopped(harness, 15000);

  assert.equal(harness.getState().message, 'Stopped after skipping 50 unavailable images; no loadable image found in that direction.');
  const misses = harness.applyCalls.filter((_, index) => index % 3 !== 2).length;
  assert.equal(misses, 50, `the drain stops at 50 total skips, got ${misses}`);
});
