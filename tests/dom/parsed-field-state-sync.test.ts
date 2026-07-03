import test from 'node:test';
import assert from 'node:assert/strict';

import { ParsedFieldStateSync, type ParsedFieldStateSyncDeps } from '../../extension/src/ui/panel/parsed-field-state-sync.js';
import type { ParsedFieldStateRecord } from '../../extension/src/core/types.js';

const PAGE_URL = 'https://example.test/gallery';
const SOURCE_URL = 'https://cdn.example.test/image-0001.jpg';

function createRecord(overrides: Partial<ParsedFieldStateRecord> = {}): ParsedFieldStateRecord {
  return {
    schemaVersion: 1,
    hostname: 'example.test',
    pageUrl: PAGE_URL,
    sourceUrl: SOURCE_URL,
    selectedUrl: SOURCE_URL,
    selectedHandleId: 'target-1',
    activeFieldId: null,
    failedFieldId: null,
    successfulFieldIds: [],
    unchangedFieldIds: [],
    unlockedFieldIds: [],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    fieldDigitWidthSpecs: [],
    activeUrlTemplateId: null,
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function createDeferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

interface Harness {
  readonly sync: ParsedFieldStateSync;
  /** Field ids of records whose store.save() call has started, in start order. */
  readonly saveStarts: (string | null)[];
  /** Records handed to store.save(), in the order the store finished persisting them. */
  readonly saveLog: ParsedFieldStateRecord[];
  readonly appliedRestores: ParsedFieldStateRecord[];
  /** Mutable "current panel state" snapshotted by createRecord(), the way the panel does. */
  setActiveFieldId(fieldId: string): void;
  /** Gates the next store.save() call on the returned deferred. */
  gateNextSave(): { readonly resolve: (value: void) => void };
}

// An in-memory store keyed by pageUrl, so restore() reads back whatever the
// serialized save queue actually persisted last.
function createHarness(): Harness {
  const persisted = new Map<string, ParsedFieldStateRecord>();
  const saveStarts: (string | null)[] = [];
  const saveLog: ParsedFieldStateRecord[] = [];
  const appliedRestores: ParsedFieldStateRecord[] = [];
  let activeFieldId = 'field-initial';
  let gate: Promise<void> | null = null;

  const deps: ParsedFieldStateSyncDeps = {
    store: () => ({
      load: async (_hostname, pageUrl) => persisted.get(pageUrl) ?? null,
      loadForSource: async () => null,
      save: async (record) => {
        saveStarts.push(record.activeFieldId);
        const pendingGate = gate;
        gate = null;
        if (pendingGate) await pendingGate;
        saveLog.push(record);
        persisted.set(record.pageUrl, record);
      },
    }),
    hostname: () => 'example.test',
    currentPageHref: () => PAGE_URL,
    currentSelectedUrl: () => SOURCE_URL,
    selectedHandleId: () => 'target-1',
    syncTargetStateFromSnapshot: () => {},
    createRecord: () => createRecord({ activeFieldId }),
    applyRestoredRecord: async (record) => {
      appliedRestores.push(record);
    },
  };

  return {
    sync: new ParsedFieldStateSync(deps),
    saveStarts,
    saveLog,
    appliedRestores,
    setActiveFieldId: (fieldId) => {
      activeFieldId = fieldId;
    },
    gateNextSave: () => {
      const deferred = createDeferred<void>();
      gate = deferred.promise;
      return deferred;
    },
  };
}

test('concurrent saves are serialized and persist in call order', async () => {
  const harness = createHarness();
  const firstSave = harness.gateNextSave();

  harness.setActiveFieldId('field-1');
  const first = harness.sync.save();
  harness.setActiveFieldId('field-2');
  const second = harness.sync.save();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(harness.saveStarts, ['field-1'], 'the second save must wait behind the gated first one');

  firstSave.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(
    harness.saveLog.map((record) => record.activeFieldId),
    ['field-1', 'field-2'],
  );
});

test('a field transform enqueued after a save persists its result after that save settles', async () => {
  const harness = createHarness();
  const firstSave = harness.gateNextSave();
  const transformSaved = createDeferred<void>();

  harness.setActiveFieldId('field-before-transform');
  const pendingSave = harness.sync.save();

  // The transform mutates panel state and saves, exactly like a field interaction does.
  harness.sync.enqueueFieldInteraction(async () => {
    harness.setActiveFieldId('field-after-transform');
    await harness.sync.save();
    transformSaved.resolve();
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(harness.saveStarts, ['field-before-transform'], "the transform's save must serialize behind the in-flight save");

  firstSave.resolve();
  await pendingSave;
  await transformSaved.promise;

  assert.deepEqual(
    harness.saveLog.map((record) => record.activeFieldId),
    ['field-before-transform', 'field-after-transform'],
    'the pre-transform snapshot lands first, then the transform result overwrites it',
  );

  await harness.sync.restore();

  assert.equal(harness.appliedRestores.length, 1);
  assert.equal(
    harness.appliedRestores[0]!.activeFieldId,
    'field-after-transform',
    'the store must end up with the transform result, never clobbered by the earlier save',
  );
});

test('restore() applies the latest persisted record', async () => {
  const harness = createHarness();

  harness.setActiveFieldId('field-1');
  await harness.sync.save();
  harness.setActiveFieldId('field-2');
  await harness.sync.save();

  await harness.sync.restore();

  assert.equal(harness.saveLog.length, 2);
  assert.equal(harness.appliedRestores.length, 1);
  assert.equal(harness.appliedRestores[0]!.activeFieldId, 'field-2');
});
