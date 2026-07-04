import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import type { TargetSelectionSnapshot } from '../extension/src/content/page-adapter.js';
import type { ProjectionSession } from '../extension/src/core/projection-session.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../extension/src/core/url/types.js';
import {
  ParsedFieldNavigationController,
  type ParsedFieldNavigationControllerDeps,
} from '../extension/src/ui/panel/parsed-field-navigation-controller.js';

// Window-free paths only: the buffered fast-path drain, applyBufferedNavigationUrl, and the
// pure field-selection / context-key helpers. The candidate-scan drain reaches
// checkImageRequestPolicy (which reads document.location) and lives in tests/dom/.

const BASE_URL = 'https://example.test/gallery?image=10';

function baseModel(): ParsedUrlModel {
  return parseUrl(BASE_URL);
}

function navigableQueryField(field: UrlField): boolean {
  return field.location === 'query' && (field.tokenKind === 'int' || field.tokenKind === 'hex');
}

function intFieldId(): string {
  const field = collectUrlFields(baseModel()).find(navigableQueryField);
  assert.ok(field, 'expected a navigable int query field in the base URL');
  return field.id;
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

function fakeSession(overrides: Partial<ProjectionSession> = {}): ProjectionSession {
  return {
    id: 'session-1',
    reason: 'parsed-field-navigation',
    sourceUrl: BASE_URL,
    displayUrl: null,
    selectedHandleId: 'handle-1',
    originalSourceUrl: null,
    status: 'preloading',
    ...overrides,
  };
}

interface BufferedStepCall {
  readonly model: ParsedUrlModel;
  readonly fields: readonly UrlField[];
  readonly direction: 1 | -1;
}

interface ApplySelectedUrlCall {
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
  readonly options: { readonly preloadDirection?: 1 | -1; readonly quietFailure?: boolean } | undefined;
}

interface HarnessOptions {
  readonly baseUrl?: string;
  readonly snapshot?: TargetSelectionSnapshot;
  readonly neighborPreloadActive?: boolean;
  readonly bufferedStep?: (call: BufferedStepCall) => Promise<'loaded' | 'blocked'>;
  readonly beginSession?: () => ProjectionSession | null;
  readonly applyProjection?: () => TargetSelectionSnapshot | null;
  readonly isCurrentSession?: () => boolean;
  readonly currentKnownImageFingerprint?: () => string | null;
  readonly requestStatus?: 'ok' | 'throttled';
}

interface Harness {
  readonly controller: ParsedFieldNavigationController;
  readonly log: string[];
  readonly bufferedStepCalls: BufferedStepCall[];
  readonly applyCalls: ApplySelectedUrlCall[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const bufferedStepCalls: BufferedStepCall[] = [];
  const applyCalls: ApplySelectedUrlCall[] = [];

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
    currentKnownImageFingerprint: options.currentKnownImageFingerprint ?? (() => null),
    applyFieldLoadResult: (input, attemptedFieldIds, nextFingerprint, previousFingerprint) => {
      log.push(`applyFieldLoadResult:${attemptedFieldIds.join(',')}:${nextFingerprint}:${previousFingerprint}`);
      return { ...input, currentImageFingerprint: nextFingerprint ?? input.currentImageFingerprint };
    },
    saveUrlReviewStatus: async (status, sourceUrl, fieldIds) => {
      log.push(`saveUrlReviewStatus:${status}:${sourceUrl}:${fieldIds.join(',')}`);
    },
    isNavigableQueryField: navigableQueryField,
    neighborPreloadRadius: () => 3,
    governor: () => ({
      request: <T>(operation: () => T) =>
        options.requestStatus === 'throttled'
          ? { value: null, status: 'throttled' as const }
          : { value: operation(), status: 'ok' as const },
      nextReadyDelayMs: () => 0,
      requestsInWindow: () => 1,
    }),
    bufferedNav: () => ({
      step: async (model, fields, direction) => {
        const call: BufferedStepCall = { model, fields, direction };
        bufferedStepCalls.push(call);
        return options.bufferedStep ? options.bufferedStep(call) : 'blocked';
      },
    }),
    neighborPreload: () => ({
      get isActive() {
        return options.neighborPreloadActive ?? false;
      },
      get runId() {
        return 7;
      },
    }),
    projectionApplication: () => ({
      applySelectedUrl: async (url, attemptedFieldIds, opts) => {
        applyCalls.push({ url, attemptedFieldIds: attemptedFieldIds ?? [], options: opts });
        return true;
      },
      beginProjectionSession: () => (options.beginSession ? options.beginSession() : fakeSession()),
      applyProjectionToSelectedImage: () =>
        options.applyProjection
          ? options.applyProjection()
          : makeSnapshot({ url: 'https://example.test/gallery?image=11', handleId: 'handle-1' }),
      isCurrentProjectionSession: () => options.isCurrentSession?.() ?? true,
    }),
    pageAdapter: () => ({
      getSnapshot: () => options.snapshot ?? makeSnapshot({ url: BASE_URL, handleId: 'handle-1' }),
    }),
  };

  return {
    controller: new ParsedFieldNavigationController(deps),
    log,
    bufferedStepCalls,
    applyCalls,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

function field(id: string): UrlField {
  return { id, location: 'query', tokenKind: 'int' } as UrlField;
}

test('includedNavigationFields keeps only unlocked navigable fields and is empty when none are unlocked', () => {
  const harness = createHarness();
  const fields = [field('a'), field('b'), { id: 'c', location: 'query', tokenKind: 'text' } as UrlField];

  harness.patchState({ unlockedFieldIds: [] });
  assert.deepEqual(harness.controller.includedNavigationFields(fields), []);

  harness.patchState({ unlockedFieldIds: ['a', 'c'] });
  // 'c' is a string field -> not navigable; only 'a' survives.
  assert.deepEqual(
    harness.controller.includedNavigationFields(fields).map((f) => f.id),
    ['a'],
  );
});

test('includedNavigationFields keeps every included navigable field regardless of success history', () => {
  const harness = createHarness();
  const fields = [field('a'), field('b'), field('c')];
  harness.patchState({ unlockedFieldIds: ['a', 'b', 'c'], successfulFieldIds: ['a', 'c'] });

  // Prev/next steps ALL included fields together — the "image trail" walk (#263). Success history
  // must not collapse the set to a single field.
  assert.deepEqual(
    harness.controller.includedNavigationFields(fields).map((f) => f.id),
    ['a', 'b', 'c'],
  );
});

test('navigateBy hands every included field to the buffered step so one press walks the whole trail', async () => {
  // Two navigable int query fields, both included ("locked").
  const twoFieldUrl = 'https://example.test/gallery?album=3&image=10';
  const harness = createHarness({
    baseUrl: twoFieldUrl,
    snapshot: makeSnapshot({ url: twoFieldUrl, handleId: 'handle-1' }),
    neighborPreloadActive: true,
    bufferedStep: async () => 'loaded',
  });
  const fieldIds = collectUrlFields(parseUrl(twoFieldUrl))
    .filter(navigableQueryField)
    .map((f) => f.id);
  assert.equal(fieldIds.length, 2, 'expected two navigable int query fields');
  harness.patchState({ unlockedFieldIds: fieldIds, successfulFieldIds: [fieldIds[0]!] });

  harness.controller.navigateBy(1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.bufferedStepCalls.length, 1);
  // Both included fields step together — not just the most recently successful one.
  assert.deepEqual(harness.bufferedStepCalls[0]!.fields.map((f) => f.id).sort(), [...fieldIds].sort());
});

test('parsedFieldRequestContextKey composes the navigation cache key from base url, specs, handle and direction', () => {
  const harness = createHarness();
  harness.patchState({
    fieldSplitSpecs: [{ baseFieldId: 'a', pattern: 'p' } as PanelState['fieldSplitSpecs'][number]],
    fieldDigitWidthSpecs: [{ fieldId: 'a', width: 3, sourceWidth: 2 } as PanelState['fieldDigitWidthSpecs'][number]],
    target: { ...harness.getState().target, selectedHandleId: 'handle-9' },
  });

  const key = harness.controller.parsedFieldRequestContextKey(['a', 'b'], 1, 42);
  assert.deepEqual(key.split('\n'), ['parsed-field-navigation', '42', BASE_URL, 'a,b', 'a:p', 'a:3:2', 'handle-9', '1']);

  // An undefined direction serializes to a trailing empty segment.
  const noDirection = harness.controller.parsedFieldRequestContextKey(['a'], undefined, 42);
  assert.equal(noDirection.split('\n').at(-1), '');
});

test('applyBufferedNavigationUrl applies the projection, records a passed review, and refreshes in order', async () => {
  const harness = createHarness({ currentKnownImageFingerprint: () => 'old-fp' });

  const applied = await harness.controller.applyBufferedNavigationUrl('https://example.test/gallery?image=11', 'display-11', 'new-fp', [
    'a',
  ]);

  assert.equal(applied, true);
  assert.equal(harness.getState().draftUrl, null);
  assert.equal(harness.getState().currentImageFingerprint, 'new-fp');
  assert.deepEqual(harness.log, [
    'applyFieldLoadResult:a:new-fp:old-fp',
    'saveUrlReviewStatus:passed:https://example.test/gallery?image=11:a',
    'saveFieldState',
    'render',
    'loadGrabSettings',
  ]);
});

test('applyBufferedNavigationUrl does not persist a review status when the fingerprint is unchanged', async () => {
  const harness = createHarness({ currentKnownImageFingerprint: () => 'same-fp' });

  const applied = await harness.controller.applyBufferedNavigationUrl('https://example.test/gallery?image=11', 'display-11', 'same-fp', [
    'a',
  ]);

  assert.equal(applied, true);
  assert.ok(!harness.log.some((entry) => entry.startsWith('saveUrlReviewStatus')));
});

test('applyBufferedNavigationUrl returns false without touching state when no projection session begins', async () => {
  const harness = createHarness({ beginSession: () => null });

  const applied = await harness.controller.applyBufferedNavigationUrl('https://example.test/gallery?image=11', 'display-11', 'new-fp', [
    'a',
  ]);

  assert.equal(applied, false);
  assert.deepEqual(harness.log, []);
});

test('applyBufferedNavigationUrl bails after a stale session is detected, before applying the field-load result', async () => {
  const harness = createHarness({ currentKnownImageFingerprint: () => 'old-fp', isCurrentSession: () => false });

  const applied = await harness.controller.applyBufferedNavigationUrl('https://example.test/gallery?image=11', 'display-11', 'new-fp', [
    'a',
  ]);

  assert.equal(applied, false);
  assert.ok(!harness.log.some((entry) => entry.startsWith('applyFieldLoadResult')));
});

test('applyBufferedNavigationUrl still applies the field-load result when the snapshot has no selected image', async () => {
  const harness = createHarness({ currentKnownImageFingerprint: () => 'old-fp', snapshot: makeSnapshot(null) });

  const applied = await harness.controller.applyBufferedNavigationUrl('https://example.test/gallery?image=11', 'display-11', 'new-fp', [
    'a',
  ]);

  assert.equal(applied, true);
  // The projection-to-selected block is skipped, so draftUrl is not forced to null here.
  assert.deepEqual(harness.log, [
    'applyFieldLoadResult:a:new-fp:old-fp',
    'saveUrlReviewStatus:passed:https://example.test/gallery?image=11:a',
    'saveFieldState',
    'render',
    'loadGrabSettings',
  ]);
});

test('navigateBy drains through the buffered fast path without a candidate scan and consumes the delta', async () => {
  const harness = createHarness({ neighborPreloadActive: true, bufferedStep: async () => 'loaded' });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(harness.bufferedStepCalls.length, 1);
  assert.equal(harness.bufferedStepCalls[0]!.direction, 1);
  assert.deepEqual(
    harness.bufferedStepCalls[0]!.fields.map((f) => f.id),
    [intFieldId()],
  );
  assert.deepEqual(harness.applyCalls, [], 'buffered fast path must not fall through to applySelectedUrl');
  assert.ok(harness.log.includes('saveUrlTemplate'));
});

test('navigateBy stops immediately when the snapshot has no selected image', async () => {
  const harness = createHarness({ snapshot: makeSnapshot(null) });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(harness.bufferedStepCalls, []);
  assert.deepEqual(harness.applyCalls, []);
  assert.deepEqual(harness.log, [], 'a blocked first step renders nothing');
});

test('navigateBy stops when no navigable fields are unlocked', async () => {
  const harness = createHarness({ neighborPreloadActive: true });
  harness.patchState({ unlockedFieldIds: [] });

  harness.controller.navigateBy(1);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(harness.bufferedStepCalls, [], 'no navigable fields -> blocked before the buffered step');
  assert.deepEqual(harness.applyCalls, []);
});

test('navigateBy is single-flight: a re-entrant call queues its delta instead of starting a parallel drain', async () => {
  let resolveFirst!: (value: 'loaded' | 'blocked') => void;
  let stepIndex = 0;
  const harness = createHarness({
    neighborPreloadActive: true,
    bufferedStep: () => {
      stepIndex += 1;
      if (stepIndex === 1) return new Promise<'loaded' | 'blocked'>((resolve) => (resolveFirst = resolve));
      return Promise.resolve('loaded');
    },
  });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  harness.controller.navigateBy(1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  // First step is still pending; a re-entrant navigateBy must not launch a second concurrent step.
  assert.equal(harness.bufferedStepCalls.length, 1);
  harness.controller.navigateBy(1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.bufferedStepCalls.length, 1, 'the running guard blocks a parallel drain');

  // Draining the first step lets the queued delta run, and the drain re-arms for it.
  resolveFirst('loaded');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.bufferedStepCalls.length, 2, 'the queued delta drains after the first step completes');
});

test('cancelQueuedSlideshowNavigation drops the queued slideshow steps mid-drain', async () => {
  let resolveFirst!: (value: 'loaded' | 'blocked') => void;
  let stepIndex = 0;
  const harness = createHarness({
    neighborPreloadActive: true,
    bufferedStep: () => {
      stepIndex += 1;
      if (stepIndex === 1) return new Promise<'loaded' | 'blocked'>((resolve) => (resolveFirst = resolve));
      return Promise.resolve('loaded');
    },
  });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  // Two queued slideshow steps; the drain parks on the first (deferred) step.
  harness.controller.navigateBy(1, 'slideshow');
  harness.controller.navigateBy(1, 'slideshow');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.bufferedStepCalls.length, 1);

  // Cancelling zeroes the slideshow queue, so once the in-flight step resolves the drain nets to empty.
  harness.controller.cancelQueuedSlideshowNavigation();
  resolveFirst('loaded');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.bufferedStepCalls.length, 1, 'the cancelled slideshow steps never drain');
});

test('an opposite manual step nets against a queued slideshow step so nothing extra drains', async () => {
  let resolveFirst!: (value: 'loaded' | 'blocked') => void;
  let stepIndex = 0;
  const directions: (1 | -1)[] = [];
  const harness = createHarness({
    neighborPreloadActive: true,
    bufferedStep: (call) => {
      stepIndex += 1;
      directions.push(call.direction);
      if (stepIndex === 1) return new Promise<'loaded' | 'blocked'>((resolve) => (resolveFirst = resolve));
      return Promise.resolve('loaded');
    },
  });
  harness.patchState({ unlockedFieldIds: [intFieldId()] });

  // A +1 slideshow step is in flight; a -1 manual step arrives, summing the queue to zero.
  harness.controller.navigateBy(1, 'slideshow');
  await new Promise((resolve) => setTimeout(resolve, 0));
  harness.controller.navigateBy(-1, 'manual');
  resolveFirst('loaded');
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(directions, [1], 'only the in-flight slideshow step ran; the opposite manual cleared the queue');
});
