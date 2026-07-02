import test from 'node:test';
import assert from 'node:assert/strict';
import { ParsedFieldStateSync, type ParsedFieldStateSyncDeps } from '../extension/src/ui/panel/parsed-field-state-sync.js';
import type { ParsedFieldStateRecord, ParsedFieldStateStore } from '../extension/src/core/types.js';

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
  readonly savedRecords: ParsedFieldStateRecord[];
  readonly appliedRestores: {
    readonly record: ParsedFieldStateRecord;
    readonly sameSource: boolean;
    readonly projectSavedSource: boolean;
  }[];
  readonly loadCalls: string[];
  setPageHref(href: string): void;
}

function createHarness(overrides: Partial<ParsedFieldStateSyncDeps> = {}, storeOverrides: Partial<ParsedFieldStateStore> = {}): Harness {
  const savedRecords: ParsedFieldStateRecord[] = [];
  const appliedRestores: Harness['appliedRestores'][number][] = [];
  const loadCalls: string[] = [];
  let pageHref = PAGE_URL;
  const store: ParsedFieldStateStore = {
    load: async (hostname, pageUrl) => {
      loadCalls.push(pageUrl);
      return createRecord({ hostname, pageUrl });
    },
    loadForSource: async () => null,
    save: async (record) => {
      savedRecords.push(record);
    },
    ...storeOverrides,
  };
  const deps: ParsedFieldStateSyncDeps = {
    store: () => store,
    hostname: () => 'example.test',
    currentPageHref: () => pageHref,
    currentSelectedUrl: () => SOURCE_URL,
    selectedHandleId: () => 'target-1',
    syncTargetStateFromSnapshot: () => {},
    createRecord: () => createRecord(),
    applyRestoredRecord: async (record, ctx) => {
      appliedRestores.push({ record, ...ctx });
    },
    ...overrides,
  };
  return {
    sync: new ParsedFieldStateSync(deps),
    savedRecords,
    appliedRestores,
    loadCalls,
    setPageHref: (href) => {
      pageHref = href;
    },
  };
}

test('save() serializes concurrent saves so records persist in call order', async () => {
  const firstSave = createDeferred<void>();
  const started: ParsedFieldStateRecord[] = [];
  const finished: ParsedFieldStateRecord[] = [];
  let recordIndex = 0;
  const harness = createHarness(
    { createRecord: () => createRecord({ activeFieldId: `field-${(recordIndex += 1)}` }) },
    {
      save: async (record) => {
        started.push(record);
        if (started.length === 1) await firstSave.promise;
        finished.push(record);
      },
    },
  );

  const first = harness.sync.save();
  const second = harness.sync.save();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(started.length, 1, 'the second save must wait for the first to settle');

  firstSave.resolve();
  await Promise.all([first, second]);

  assert.deepEqual(
    finished.map((record) => record.activeFieldId),
    ['field-1', 'field-2'],
  );
});

test('save() no-ops when the store is missing or the record is null', async () => {
  const noStore = createHarness({ store: () => null });
  await noStore.sync.save();
  assert.equal(noStore.savedRecords.length, 0);

  const noRecord = createHarness({ createRecord: () => null });
  await noRecord.sync.save();
  assert.equal(noRecord.savedRecords.length, 0);
});

test('enqueueFieldInteraction runs tasks in order and survives a rejected task', async () => {
  const harness = createHarness();
  const ran: string[] = [];
  const firstTask = createDeferred<void>();

  harness.sync.enqueueFieldInteraction(async () => {
    await firstTask.promise;
    ran.push('first');
  });
  harness.sync.enqueueFieldInteraction(async () => {
    ran.push('second');
    throw new Error('boom');
  });
  harness.sync.enqueueFieldInteraction(async () => {
    ran.push('third');
  });

  assert.deepEqual(ran, [], 'tasks must not run before the queue reaches them');
  firstTask.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(ran, ['first', 'second', 'third']);
});

test('restore() applies the exact page record when it matches', async () => {
  const harness = createHarness();

  await harness.sync.restore();

  assert.equal(harness.appliedRestores.length, 1);
  assert.equal(harness.appliedRestores[0]!.record.pageUrl, PAGE_URL);
  assert.equal(harness.appliedRestores[0]!.sameSource, true);
  assert.equal(harness.appliedRestores[0]!.projectSavedSource, false);
});

test('restore() falls back to the source record when the page record does not match', async () => {
  const sourceRecord = createRecord({ pageUrl: 'https://example.test/other-page', activeFieldId: 'from-source' });
  const harness = createHarness(
    {},
    {
      load: async () =>
        createRecord({
          pageUrl: 'https://example.test/stale',
          sourceUrl: 'https://cdn.example.test/unrelated.jpg',
          selectedHandleId: 'target-2',
          selectedUrl: null,
        }),
      loadForSource: async () => sourceRecord,
    },
  );

  await harness.sync.restore();

  assert.equal(harness.appliedRestores.length, 1);
  assert.equal(harness.appliedRestores[0]!.record.activeFieldId, 'from-source');
});

test('restore() no-ops when no candidate record passes the match check', async () => {
  const harness = createHarness(
    {},
    {
      load: async () =>
        createRecord({
          pageUrl: 'https://example.test/stale',
          sourceUrl: 'https://cdn.example.test/unrelated.jpg',
          selectedHandleId: 'target-2',
          selectedUrl: null,
        }),
      loadForSource: async () => null,
    },
  );

  await harness.sync.restore();

  assert.equal(harness.appliedRestores.length, 0);
});

test('restore() passes projectSavedSource through and reports a different source', async () => {
  const harness = createHarness({ currentSelectedUrl: () => 'https://cdn.example.test/image-0002.jpg' });

  await harness.sync.restore({ projectSavedSource: true });

  assert.equal(harness.appliedRestores.length, 1);
  assert.equal(harness.appliedRestores[0]!.sameSource, false);
  assert.equal(harness.appliedRestores[0]!.projectSavedSource, true);
});

test('restore() ignores reentrant calls while a restore is in progress', async () => {
  const applying = createDeferred<void>();
  const harness = createHarness({
    applyRestoredRecord: async () => {
      await applying.promise;
    },
  });

  const first = harness.sync.restore();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(harness.loadCalls.length, 1);

  const second = harness.sync.restore();
  await second;
  assert.equal(harness.loadCalls.length, 1, 'a reentrant restore must return without touching the store');

  applying.resolve();
  await first;

  await harness.sync.restore();
  assert.equal(harness.loadCalls.length, 2, 'a later restore proceeds once the first completes');
});

test('restore() ignores reentrant calls issued while the initial load is still pending', async () => {
  const loading = createDeferred<ParsedFieldStateRecord | null>();
  let loadCallCount = 0;
  const harness = createHarness(
    {},
    {
      load: async (hostname, pageUrl) => {
        loadCallCount += 1;
        return loading.promise.then(() => createRecord({ hostname, pageUrl }));
      },
    },
  );

  const first = harness.sync.restore();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(loadCallCount, 1, 'the first restore must have started its load');

  const second = harness.sync.restore();
  await second;
  assert.equal(loadCallCount, 1, 'a reentrant restore issued mid-load must not start a second load');
  assert.equal(harness.appliedRestores.length, 0, 'nothing has resolved yet');

  loading.resolve(null);
  await first;
  assert.equal(harness.appliedRestores.length, 1);
});

test('pageUrl() keeps the stored key while on an extension-projected URL and clears it on real navigation', () => {
  const harness = createHarness();
  const projectedUrl = 'https://example.test/projected-image.jpg';
  const spaRoute = 'https://example.test/gallery/page/2';

  assert.equal(harness.sync.pageUrl(), PAGE_URL);

  harness.sync.setExtensionProjectedPageUrl(projectedUrl);
  harness.setPageHref(projectedUrl);
  assert.equal(harness.sync.pageUrl(), PAGE_URL, 'a projected URL must not replace the stored page key');

  harness.setPageHref(spaRoute);
  assert.equal(harness.sync.pageUrl(), spaRoute, 'a real navigation replaces the stored page key');

  harness.setPageHref(projectedUrl);
  assert.equal(harness.sync.pageUrl(), projectedUrl, 'the projected URL is cleared after a real navigation');
});

test('nextUpdatedAt() is strictly monotonic across rapid calls', () => {
  const harness = createHarness();
  const stamps = [harness.sync.nextUpdatedAt(), harness.sync.nextUpdatedAt(), harness.sync.nextUpdatedAt()];

  assert.ok(new Date(stamps[0]!).getTime() < new Date(stamps[1]!).getTime());
  assert.ok(new Date(stamps[1]!).getTime() < new Date(stamps[2]!).getTime());
});
