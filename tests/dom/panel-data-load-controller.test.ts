import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import { createDisplayRecord, type ImageDisplayRecord } from '../../extension/src/core/display-records.js';
import type { BookmarkStore, PanelState } from '../../extension/src/core/types.js';
import type { RecentHistoryStore } from '../../extension/src/content/recent-history-store.js';
import { PanelDataLoadController, type PanelDataLoadControllerDeps } from '../../extension/src/ui/panel/panel-data-load-controller.js';

// Runs under happy-dom: the bookmark/recent loaders pass window.location.href as the current page URL.
window.location.href = 'https://images.example.test/gallery';

interface Harness {
  readonly controller: PanelDataLoadController;
  readonly log: string[];
  readonly loadPageInputs: { offset: number; currentPageUrl?: string | undefined }[];
  readonly recentLoadInputs: unknown[];
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
}

interface HarnessOptions {
  readonly bookmarkLoad?: BookmarkStore['loadPage'];
  readonly recentLoad?: RecentHistoryStore['load'];
}

function createHarness(options: HarnessOptions = {}): Harness {
  let state = createInitialPanelState(0);
  const log: string[] = [];
  const loadPageInputs: { offset: number; currentPageUrl?: string | undefined }[] = [];
  const recentLoadInputs: unknown[] = [];
  const bookmarkStore: BookmarkStore = {
    loadPage:
      options.bookmarkLoad ??
      (async (input: { offset: number; limit: number; scope?: 'global' | 'site'; currentPageUrl?: string }) => {
        loadPageInputs.push({ offset: input.offset, currentPageUrl: input.currentPageUrl });
        return {
          items: [createDisplayRecord({ url: 'https://images.example.test/a/1.jpg' })],
          offset: input.offset,
          limit: input.limit,
          total: 1,
          hasOlder: false,
          hasNewer: false,
        };
      }),
  } as unknown as BookmarkStore;
  const recentHistoryStore: RecentHistoryStore = {
    load:
      options.recentLoad ??
      (async (_pageUrl: string, loadOptions: { readonly scope?: 'page' | 'site' | 'all' }) => {
        recentLoadInputs.push(loadOptions);
        return [createDisplayRecord({ url: 'https://images.example.test/a/2.jpg' })];
      }),
  } as unknown as RecentHistoryStore;
  const deps: PanelDataLoadControllerDeps = {
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => log.push('render'),
    bookmarkStore: () => bookmarkStore,
    recentHistoryStore: () => recentHistoryStore,
    captureStore: () => null,
    urlTemplateStore: () => null,
    loadLocalSettings: async () => void log.push('loadLocalSettings'),
    currentUrlTemplateHostname: () => 'images.example.test',
    activeTemplateIdForCurrentUrl: () => null,
    syncGrabSettings: () => {},
    primeBufferedNav: () => {},
  };
  return {
    controller: new PanelDataLoadController(deps),
    log,
    loadPageInputs,
    recentLoadInputs,
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
  };
}

function deferred<T>(): { readonly promise: Promise<T>; resolve(value: T): void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

test('loadBookmarkPage loads a page scoped to the current page url and folds it into state', async () => {
  const harness = createHarness();
  await harness.controller.loadBookmarkPage(0);
  assert.equal(harness.loadPageInputs[0]!.currentPageUrl, 'https://images.example.test/gallery');
  assert.equal(harness.getState().bookmarks.length, 1);
  assert.equal(harness.getState().bookmarkTotal, 1);
  assert.ok(harness.log.includes('render'));
});

test('loadBookmarkPage honors render:false', async () => {
  const harness = createHarness();
  await harness.controller.loadBookmarkPage(0, { render: false });
  assert.ok(!harness.log.includes('render'));
  assert.equal(harness.getState().bookmarks.length, 1);
});

test('loadBookmarkPage ignores an older response after a newer offset wins', async () => {
  const older = deferred<Awaited<ReturnType<BookmarkStore['loadPage']>>>();
  const newer = deferred<Awaited<ReturnType<BookmarkStore['loadPage']>>>();
  const olderRecord = createDisplayRecord({ id: 'older-page', url: 'https://images.example.test/a/10.jpg' });
  const newerRecord = createDisplayRecord({ id: 'newer-page', url: 'https://images.example.test/a/1.jpg' });
  const harness = createHarness({
    bookmarkLoad: async (input) => (input.offset === 10 ? older.promise : newer.promise),
  });

  const first = harness.controller.loadBookmarkPage(10);
  const second = harness.controller.loadBookmarkPage(0);
  newer.resolve({
    items: [newerRecord],
    offset: 0,
    limit: 10,
    total: 20,
    hasOlder: true,
    hasNewer: false,
  });
  await second;
  older.resolve({
    items: [olderRecord],
    offset: 10,
    limit: 10,
    total: 20,
    hasOlder: false,
    hasNewer: true,
  });
  await first;

  assert.deepEqual(harness.getState().bookmarks, [newerRecord]);
  assert.equal(harness.getState().bookmarkOffset, 0);
  assert.equal(harness.log.filter((entry) => entry === 'render').length, 1);
});

test('loadBookmarkPage ignores a response after queue scope or display order changes', async () => {
  for (const patch of [{ bookmarkVisibilityScope: 'site' as const }, { queueDisplayOrder: 'back-first' as const }]) {
    const pending = deferred<Awaited<ReturnType<BookmarkStore['loadPage']>>>();
    const harness = createHarness({ bookmarkLoad: async () => pending.promise });
    const load = harness.controller.loadBookmarkPage(0);
    harness.patchState(patch);
    pending.resolve({
      items: [createDisplayRecord({ url: 'https://images.example.test/stale.jpg' })],
      offset: 0,
      limit: 10,
      total: 1,
      hasOlder: false,
      hasNewer: false,
    });
    await load;

    assert.deepEqual(harness.getState().bookmarks, []);
    assert.equal(harness.log.filter((entry) => entry === 'render').length, 0);
  }
});

test('loadBookmarkPage accepts a global response after the host page URL changes', async (t) => {
  const pending = deferred<Awaited<ReturnType<BookmarkStore['loadPage']>>>();
  const globalRecord = createDisplayRecord({ id: 'global-page', url: 'https://other.test/global.jpg' });
  const harness = createHarness({ bookmarkLoad: async () => pending.promise });
  t.after(() => {
    window.location.href = 'https://images.example.test/gallery';
  });

  const load = harness.controller.loadBookmarkPage(0);
  window.location.href = 'https://images.example.test/next#selected';
  pending.resolve({
    items: [globalRecord],
    offset: 0,
    limit: 10,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });
  await load;

  assert.deepEqual(harness.getState().bookmarks, [globalRecord]);
  assert.equal(harness.log.filter((entry) => entry === 'render').length, 1);
});

test('loadBookmarkPage accepts a site response after a same-host path or hash change', async (t) => {
  const pending = deferred<Awaited<ReturnType<BookmarkStore['loadPage']>>>();
  const siteRecord = createDisplayRecord({ id: 'site-page', url: 'https://images.example.test/site.jpg' });
  const harness = createHarness({ bookmarkLoad: async () => pending.promise });
  harness.patchState({ bookmarkVisibilityScope: 'site' });
  t.after(() => {
    window.location.href = 'https://images.example.test/gallery';
  });

  const load = harness.controller.loadBookmarkPage(0);
  window.location.href = 'https://images.example.test/next#selected';
  pending.resolve({
    items: [siteRecord],
    offset: 0,
    limit: 10,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });
  await load;

  assert.deepEqual(harness.getState().bookmarks, [siteRecord]);
  assert.equal(harness.log.filter((entry) => entry === 'render').length, 1);
});

test('loadBookmarkPage rejects a site response after a cross-host change', async (t) => {
  const pending = deferred<Awaited<ReturnType<BookmarkStore['loadPage']>>>();
  const harness = createHarness({ bookmarkLoad: async () => pending.promise });
  harness.patchState({ bookmarkVisibilityScope: 'site' });
  t.after(() => {
    window.location.href = 'https://images.example.test/gallery';
  });

  const load = harness.controller.loadBookmarkPage(0);
  window.location.href = 'https://other.test/next';
  pending.resolve({
    items: [createDisplayRecord({ url: 'https://images.example.test/stale.jpg' })],
    offset: 0,
    limit: 10,
    total: 1,
    hasOlder: false,
    hasNewer: false,
  });
  await load;

  assert.deepEqual(harness.getState().bookmarks, []);
  assert.equal(harness.log.filter((entry) => entry === 'render').length, 0);
});

test('loadRecentHistory loads the recents for the current page and stamps lastUpdatedAt', async () => {
  const harness = createHarness();
  const before = harness.getState().lastUpdatedAt;
  await harness.controller.loadRecentHistory();
  assert.equal(harness.getState().history.length, 1);
  assert.deepEqual(harness.recentLoadInputs, [{ scope: 'site' }]);
  assert.notEqual(harness.getState().lastUpdatedAt, before);
  assert.ok(harness.log.includes('render'));
});

test('loadRecentHistory ignores a stale response after the scope changes', async () => {
  const siteLoad = deferred<readonly ImageDisplayRecord[]>();
  const allLoad = deferred<readonly ImageDisplayRecord[]>();
  const siteRecord = createDisplayRecord({ id: 'site-row', url: 'https://images.example.test/site.jpg' });
  const allRecord = createDisplayRecord({ id: 'all-row', url: 'https://other.test/all.jpg' });
  const harness = createHarness({
    recentLoad: async (_pageUrl, options) => (options?.scope === 'all' ? allLoad.promise : siteLoad.promise),
  });

  const first = harness.controller.loadRecentHistory();
  harness.patchState({ recentHistoryScope: 'all' });
  const second = harness.controller.loadRecentHistory();
  allLoad.resolve([allRecord]);
  await second;
  siteLoad.resolve([siteRecord]);
  await first;

  assert.deepEqual(harness.getState().history, [allRecord]);
  assert.equal(harness.log.filter((entry) => entry === 'render').length, 1);
});

test('loadSettingsBookmarksAndRecents loads settings, bookmarks and recents then renders once', async () => {
  const harness = createHarness();
  await harness.controller.loadSettingsBookmarksAndRecents();
  assert.ok(harness.log.includes('loadLocalSettings'));
  assert.equal(harness.getState().bookmarks.length, 1);
  assert.equal(harness.getState().history.length, 1);
  // The nested loaders run with render:false; only the final explicit render should be logged.
  assert.equal(harness.log.filter((entry) => entry === 'render').length, 1);
});
