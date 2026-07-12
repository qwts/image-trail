import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { applyFieldSplitSpecs } from '../extension/src/core/url/field-splits.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel } from '../extension/src/core/url/types.js';
import { FieldEditorController, type FieldEditorControllerDeps } from '../extension/src/ui/panel/field-editor-controller.js';
import { parsedFieldResetBaselineFromState } from '../extension/src/ui/panel/parsed-field-reset-baseline.js';

// Window-free paths only: the controller reaches the panel root, DOM, and the projection load exclusively
// through injected callbacks, so every collaborator here is a fake that records into `log`/`applyCalls`.
// The render-through-DOM integration lives in tests/dom/field-editor-controller.test.ts.

interface ApplyCall {
  readonly url: string;
  readonly attemptedFieldIds: readonly string[];
  readonly options?: { readonly pushVisibleUrl?: boolean; readonly resetFieldState?: boolean } | undefined;
}

interface ResetCall {
  readonly updatedAt: number;
  readonly mode: string;
}

interface HarnessOptions {
  readonly rawUrl?: string;
  readonly applyResult?: boolean;
  readonly prune?: (state: PanelState, url: string) => PanelState;
  readonly currentUrlModel?: () => ParsedUrlModel;
}

interface Harness {
  readonly controller: FieldEditorController;
  readonly log: string[];
  readonly applyCalls: ApplyCall[];
  readonly resetCalls: ResetCall[];
  pruneCalls(): number;
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
  fieldId(label: string): string;
  settle(): Promise<void>;
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const rawUrl = options.rawUrl ?? 'https://example.test/image?p=5';
  const log: string[] = [];
  const applyCalls: ApplyCall[] = [];
  const resetCalls: ResetCall[] = [];
  const pending: Promise<unknown>[] = [];
  let pruneCallCount = 0;
  const applyResult = options.applyResult ?? true;
  const deps: FieldEditorControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {
      log.push('render');
    },
    scheduleFiniteCaptureErrorReset: (updatedAt, mode) => {
      resetCalls.push({ updatedAt, mode });
      log.push(`scheduleReset:${mode}`);
    },
    currentRawUrl: () => rawUrl,
    currentUrlModel: options.currentUrlModel ?? (() => parseUrl(rawUrl)),
    pruneInvalidFieldSplitSpecsForUrl: (current, url) => {
      pruneCallCount += 1;
      return options.prune ? options.prune(current, url) : current;
    },
    // Mirror the panel-owned applyPanelState it stands in for: replace state, then fan out save/render.
    applyPanelState: (nextState, opts = {}) => {
      if (nextState === state) return false;
      state = nextState;
      if (opts.saveParsedFieldState) log.push('save');
      if (opts.render) log.push('render');
      return true;
    },
    enqueueFieldInteraction: (run) => {
      pending.push(run());
    },
    saveFieldState: async () => {
      log.push('saveFieldState');
    },
    saveUrlTemplateFromCurrentFields: async () => {
      log.push('saveTemplate');
    },
    applySelectedUrl: async (url, attemptedFieldIds, opts) => {
      applyCalls.push({ url, attemptedFieldIds, options: opts });
      log.push(`applySelectedUrl:${url}`);
      return applyResult;
    },
  };
  return {
    controller: new FieldEditorController(deps),
    log,
    applyCalls,
    resetCalls,
    pruneCalls: () => pruneCallCount,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
    fieldId: (label) => {
      const field = collectUrlFields(parseUrl(rawUrl)).find((candidate) => candidate.label === label);
      assert.ok(field, `field "${label}" not found in ${rawUrl}`);
      return field.id;
    },
    settle: () => Promise.all(pending).then(() => undefined),
  };
}

test('rejectUrlEditorInput surfaces the data-URL error and schedules the reset against the new timestamp', () => {
  const harness = createHarness();
  harness.controller.rejectUrlEditorInput();
  assert.equal(harness.getState().status, 'error');
  assert.match(harness.getState().message, /cannot use data URLs/);
  assert.deepEqual(harness.log, ['scheduleReset:status', 'render']);
  assert.equal(harness.resetCalls.length, 1);
  // The reset reads state.lastUpdatedAt *after* setState, so it must see the freshly stamped value.
  assert.equal(harness.resetCalls[0]!.updatedAt, harness.getState().lastUpdatedAt);
});

test('enqueueSelectedUrlApply rejects a data URL without loading it', async () => {
  const harness = createHarness();
  harness.controller.enqueueSelectedUrlApply('data:image/png;base64,AAAA');
  await harness.settle();
  assert.equal(harness.getState().status, 'error');
  assert.deepEqual(harness.applyCalls, []);
  assert.deepEqual(harness.log, ['scheduleReset:status', 'render']);
});

test('enqueueSelectedUrlApply loads a differing URL and resets field state', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/a.jpg' });
  harness.controller.enqueueSelectedUrlApply('https://example.test/b.jpg');
  await harness.settle();
  assert.equal(harness.applyCalls.length, 1);
  assert.equal(harness.applyCalls[0]!.url, 'https://example.test/b.jpg');
  assert.deepEqual(harness.applyCalls[0]!.attemptedFieldIds, []);
  assert.equal(harness.applyCalls[0]!.options?.pushVisibleUrl, true);
  assert.equal(harness.applyCalls[0]!.options?.resetFieldState, true);
});

test('enqueueSelectedUrlApply keeps field state when the URL matches the current one', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/a.jpg' });
  harness.controller.enqueueSelectedUrlApply('https://example.test/a.jpg');
  await harness.settle();
  assert.equal(harness.applyCalls[0]!.options?.resetFieldState, false);
});

test('set-value projects the rebuilt URL and skips the template save without unlocked fields', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  const fieldId = harness.fieldId('query p');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '6' });
  await harness.settle();
  assert.equal(harness.applyCalls.length, 1);
  assert.match(harness.applyCalls[0]!.url, /p=6/);
  assert.deepEqual(harness.applyCalls[0]!.attemptedFieldIds, [fieldId]);
  assert.ok(!harness.log.includes('saveTemplate'));
  assert.equal(harness.getState().parsedFieldResetBaseline?.sourceUrl, 'https://example.test/image?p=5');
});

test('set-value captures the reset baseline after stale split specs are pruned', async () => {
  const staleSplitSpec = {
    baseFieldId: 'missing-field',
    location: 'query' as const,
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [1, 1],
    pattern: '1-1',
  };
  const harness = createHarness({
    rawUrl: 'https://example.test/image?p=5',
    prune: (state) => ({ ...state, fieldSplitSpecs: [] }),
  });
  const fieldId = harness.fieldId('query p');
  harness.patchState({ fieldSplitSpecs: [staleSplitSpec] });

  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '6' });
  await harness.settle();

  assert.equal(harness.pruneCalls(), 1);
  assert.deepEqual(harness.getState().fieldSplitSpecs, []);
  assert.deepEqual(harness.getState().parsedFieldResetBaseline?.fieldSplitSpecs, []);
});

test('set-value saves the template when a field is unlocked', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  const fieldId = harness.fieldId('query p');
  harness.patchState({ unlockedFieldIds: [fieldId] });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '6' });
  await harness.settle();
  assert.ok(harness.log.includes('saveTemplate'));
});

test('step always saves the template and sets the active field even without unlocked fields', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  const fieldId = harness.fieldId('query p');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: 1 });
  await harness.settle();
  assert.match(harness.applyCalls[0]!.url, /p=6/);
  assert.ok(harness.log.includes('saveTemplate'));
  assert.equal(harness.getState().activeFieldId, fieldId);
});

test('a failed load skips the template save', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5', applyResult: false });
  const fieldId = harness.fieldId('query p');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'step', delta: 1 });
  await harness.settle();
  assert.equal(harness.applyCalls.length, 1);
  assert.ok(!harness.log.includes('saveTemplate'));
});

test('set-value with an unchanged value is a silent no-op', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  const fieldId = harness.fieldId('query p');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '5' });
  await harness.settle();
  assert.deepEqual(harness.applyCalls, []);
  assert.deepEqual(harness.log, []);
});

test('set-value accepts a retokenizing empty text commit', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?q=word' });
  const fieldId = harness.fieldId('query q');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '' });
  await harness.settle();
  assert.equal(harness.applyCalls[0]?.url, 'https://example.test/image?q=');
});

test('set-value projects delimiter-changing numeric text for reparsing', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/images/400' });
  const fieldId = harness.fieldId('path 3.0');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '400/53' });
  await harness.settle();
  assert.equal(harness.applyCalls[0]?.url, 'https://example.test/images/400/53');
});

test('split-child set-value accepts a valid replacement and rejects invalidation', async () => {
  const rawUrl = 'https://example.test/image?date=0101';
  const splitSpec = {
    baseFieldId: 'q:0:0',
    location: 'query' as const,
    queryIndex: 0,
    tokenIndex: 0,
    lengths: [2, 2],
    pattern: '2-2',
  };
  const valid = createHarness({ rawUrl, currentUrlModel: () => applyFieldSplitSpecs(parseUrl(rawUrl), [splitSpec]) });
  valid.patchState({ fieldSplitSpecs: [splitSpec] });
  valid.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: 'q:0:1', transformId: 'set-value', value: '02' });
  await valid.settle();
  assert.equal(valid.applyCalls[0]?.url, 'https://example.test/image?date=0102');

  const invalid = createHarness({ rawUrl, currentUrlModel: () => applyFieldSplitSpecs(parseUrl(rawUrl), [splitSpec]) });
  invalid.patchState({ fieldSplitSpecs: [splitSpec] });
  invalid.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: 'q:0:1', transformId: 'set-value', value: '' });
  await invalid.settle();
  assert.deepEqual(invalid.applyCalls, []);
  assert.equal(invalid.getState().status, 'error');
  assert.equal(invalid.getState().message, 'That edit would invalidate the field split.');
  assert.equal(invalid.resetCalls.length, 1);
});

test('invalid numeric commits use bounded generic feedback without projection', async () => {
  const harness = createHarness();
  harness.controller.enqueueRejectedFieldCommit();
  await harness.settle();
  assert.deepEqual(harness.applyCalls, []);
  assert.equal(harness.getState().message, 'Parsed field value is invalid.');
  assert.equal(harness.resetCalls.length, 1);
});

test('reset-structure restores the baseline URL, preserves valid settings, and keeps Reset all available', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?q=' });
  const state = harness.getState();
  const baseline = parsedFieldResetBaselineFromState(state, 'https://example.test/image?q=12');
  harness.patchState({
    parsedFieldResetBaseline: baseline,
    activeFieldId: 'q:0:0',
    unlockedFieldIds: ['q:0:0', 'missing'],
    fieldDigitWidthSpecs: [
      { fieldId: 'q:0:0', width: 3, sourceWidth: undefined },
      { fieldId: 'missing', width: 2, sourceWidth: undefined },
    ],
  });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', transformId: 'reset-structure' });
  await harness.settle();
  assert.equal(harness.applyCalls[0]?.url, baseline.sourceUrl);
  assert.equal(harness.getState().activeFieldId, 'q:0:0');
  assert.deepEqual(harness.getState().unlockedFieldIds, ['q:0:0']);
  assert.deepEqual(
    harness.getState().fieldDigitWidthSpecs.map((spec) => spec.fieldId),
    ['q:0:0'],
  );
  assert.equal(harness.getState().parsedFieldResetBaseline, baseline);
  assert.ok(!harness.log.includes('saveTemplate'));
});

test('set-value on an unknown field is a no-op', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: 'missing', transformId: 'set-value', value: '6' });
  await harness.settle();
  assert.deepEqual(harness.applyCalls, []);
});

test('digit-width pads the field and projects the padded URL', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  const fieldId = harness.fieldId('query p');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'digit-width', value: '3' });
  await harness.settle();
  assert.equal(harness.applyCalls.length, 1);
  assert.match(harness.applyCalls[0]!.url, /p=005/);
  assert.equal(harness.getState().fieldDigitWidthSpecs.length, 1);
  assert.equal(harness.getState().activeFieldId, fieldId);
});

test('reset-field projects the baseline URL and restores field-local editor state without saving templates', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=6' });
  const fieldId = harness.fieldId('query p');
  harness.patchState({
    activeFieldId: fieldId,
    successfulFieldIds: [fieldId],
    unlockedFieldIds: [fieldId],
    manuallyExcludedFieldIds: [fieldId],
    fieldDigitWidthSpecs: [{ fieldId, width: 3 }],
    parsedFieldResetBaseline: {
      sourceUrl: 'https://example.test/image?p=5',
      activeFieldId: null,
      failedFieldId: null,
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      fieldDigitWidthSpecs: [],
    },
  });

  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'reset-field' });
  await harness.settle();

  assert.equal(harness.applyCalls.length, 1);
  assert.equal(harness.applyCalls[0]!.url, 'https://example.test/image?p=5');
  assert.deepEqual(harness.applyCalls[0]!.attemptedFieldIds, []);
  assert.deepEqual(harness.getState().fieldDigitWidthSpecs, []);
  assert.deepEqual(harness.getState().unlockedFieldIds, []);
  assert.deepEqual(harness.getState().manuallyExcludedFieldIds, []);
  assert.equal(harness.getState().activeFieldId, null);
  assert.ok(!harness.log.includes('saveTemplate'));
});

test('reset-all restores the baseline state and source URL without saving templates', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=6' });
  const fieldId = harness.fieldId('query p');
  harness.patchState({
    activeFieldId: fieldId,
    successfulFieldIds: [fieldId],
    unlockedFieldIds: [fieldId],
    fieldDigitWidthSpecs: [{ fieldId, width: 3 }],
    parsedFieldResetBaseline: {
      sourceUrl: 'https://example.test/image?p=5',
      activeFieldId: null,
      failedFieldId: null,
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      fieldDigitWidthSpecs: [],
    },
  });

  harness.controller.enqueueFieldTransform({ name: 'field/transform', transformId: 'reset-all' });
  await harness.settle();

  assert.equal(harness.applyCalls.length, 1);
  assert.equal(harness.applyCalls[0]!.url, 'https://example.test/image?p=5');
  assert.deepEqual(harness.getState().fieldDigitWidthSpecs, []);
  assert.deepEqual(harness.getState().unlockedFieldIds, []);
  assert.equal(harness.getState().activeFieldId, null);
  assert.equal(harness.getState().parsedFieldResetBaseline, null);
  assert.ok(!harness.log.includes('saveTemplate'));
});

test('reset-all with matching URL applies state only and saves parsed-field state', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  const fieldId = harness.fieldId('query p');
  harness.patchState({
    activeFieldId: fieldId,
    parsedFieldResetBaseline: {
      sourceUrl: 'https://example.test/image?p=5',
      activeFieldId: null,
      failedFieldId: null,
      successfulFieldIds: [],
      unchangedFieldIds: [],
      unlockedFieldIds: [],
      manuallyExcludedFieldIds: [],
      fieldSplitSpecs: [],
      fieldDigitWidthSpecs: [],
    },
  });

  harness.controller.enqueueFieldTransform({ name: 'field/transform', transformId: 'reset-all' });
  await harness.settle();

  assert.deepEqual(harness.applyCalls, []);
  assert.deepEqual(harness.log, ['save', 'render']);
  assert.equal(harness.getState().parsedFieldResetBaseline, null);
});

test('digit-width on an unknown field is a no-op', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?p=5' });
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: 'missing', transformId: 'digit-width', value: '3' });
  await harness.settle();
  assert.deepEqual(harness.applyCalls, []);
});

test('split-apply produces a state-only effect that saves and renders without loading', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?date=01012001' });
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern: '2-2-4' });
  await harness.settle();
  assert.deepEqual(harness.applyCalls, []);
  assert.deepEqual(harness.log, ['save', 'render']);
  assert.equal(harness.getState().fieldSplitSpecs.length, 1);
});

test('split-apply with an invalid pattern surfaces an error state', async () => {
  const harness = createHarness({ rawUrl: 'https://example.test/image?date=01012001' });
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-apply', pattern: '2-2' });
  await harness.settle();
  assert.deepEqual(harness.applyCalls, []);
  assert.equal(harness.getState().status, 'error');
  assert.match(harness.getState().message, /Split pattern totals/);
});

test('split-clear reduces the action and skips the invalid-split prune', async () => {
  const harness = createHarness({
    rawUrl: 'https://example.test/image?date=01012001',
    prune: (state) => state,
  });
  const fieldId = harness.fieldId('query date');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'split-clear' });
  await harness.settle();
  assert.equal(harness.pruneCalls(), 0);
  assert.deepEqual(harness.applyCalls, []);
});

test('prune-before-effect renders when pruning changes state but the transform is a no-op', async () => {
  const harness = createHarness({
    rawUrl: 'https://example.test/image?p=5',
    prune: (state) => ({ ...state, message: 'pruned' }),
  });
  const fieldId = harness.fieldId('query p');
  harness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId, transformId: 'set-value', value: '5' });
  await harness.settle();
  assert.equal(harness.pruneCalls(), 1);
  assert.equal(harness.getState().message, 'pruned');
  assert.deepEqual(harness.log, ['saveFieldState', 'render']);
  assert.deepEqual(harness.applyCalls, []);
});

test('an unparseable URL errors only for split-apply', async () => {
  const splitHarness = createHarness({
    currentUrlModel: () => {
      throw new Error('unparseable');
    },
  });
  splitHarness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: 'x', transformId: 'split-apply', pattern: '2-2' });
  await splitHarness.settle();
  assert.equal(splitHarness.getState().status, 'error');
  assert.match(splitHarness.getState().message, /could not be parsed for splitting/);

  const setHarness = createHarness({
    currentUrlModel: () => {
      throw new Error('unparseable');
    },
  });
  setHarness.controller.enqueueFieldTransform({ name: 'field/transform', fieldId: 'x', transformId: 'set-value', value: '1' });
  await setHarness.settle();
  assert.deepEqual(setHarness.applyCalls, []);
  assert.deepEqual(setHarness.log, []);
});
