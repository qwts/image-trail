import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NeighborPreloadController,
  type NeighborPreloadControllerDeps,
  type NeighborPreloadLocalSettings,
} from '../extension/src/ui/panel/neighbor-preload-controller.js';
import { parseUrl } from '../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../extension/src/core/url/types.js';

const BASE_URL = 'https://example.test/gallery?image=10';

function baseModel(): ParsedUrlModel {
  return parseUrl(BASE_URL);
}

function navigableFields(model: ParsedUrlModel): readonly UrlField[] {
  return collectUrlFields(model).filter((field) => field.location === 'query' && field.tokenKind === 'int');
}

function createDeferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function createHarness(overrides: Partial<NeighborPreloadControllerDeps> = {}): {
  readonly controller: NeighborPreloadController;
  readonly fetchCalls: string[];
} {
  const fetchCalls: string[] = [];
  let fetchCount = 0;
  const settings: NeighborPreloadLocalSettings = { neighborPreloadEnabled: true, neighborPreloadRadius: 3, neighborPreloadCacheLimit: 24 };

  const deps: NeighborPreloadControllerDeps = {
    getLocalSettings: () => settings,
    currentNavigationBaseRawUrl: () => BASE_URL,
    currentNavigationBaseModel: () => baseModel(),
    currentPageHref: () => 'https://example.test/gallery',
    isNavigableQueryField: () => true,
    currentFieldContextKeyParts: () => ({ fieldSplitSpecs: [], fieldDigitWidthSpecs: [], selectedHandleId: null }),
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      fetchCount += 1;
      return { ok: true, dataUrl: `data:fake-${fetchCount}`, mimeType: 'image/png', byteLength: 1, sha256: `sha-${fetchCount}` };
    },
    ...overrides,
  };

  return { controller: new NeighborPreloadController(deps), fetchCalls };
}

test('preload() caches a successful fetch and skips re-fetching on repeat calls', async () => {
  const { controller, fetchCalls } = createHarness();

  const first = await controller.preload('https://example.test/a.jpg');
  const second = await controller.preload('https://example.test/a.jpg');

  assert.deepEqual(first, second);
  assert.equal(fetchCalls.length, 1);
});

test('preload() uses the navigation byte profile only for field-active-navigation intent', async () => {
  const profiles: (string | undefined)[] = [];
  const { controller } = createHarness({
    fetchThumbnail: async (_url, options) => {
      profiles.push(options.sourceProfile);
      return { ok: true, dataUrl: 'data:x', mimeType: 'image/png', byteLength: 1, sha256: 's' };
    },
  });

  await controller.preload('https://example.test/nav.jpg', { intent: 'field-active-navigation' });
  await controller.preload('https://example.test/bookmark.jpg', { intent: 'bookmark-load' });
  await controller.preload('https://example.test/plain.jpg');

  assert.deepEqual(profiles, ['navigation', 'thumbnail', 'thumbnail']);
});

test('preload() with readCache:false bypasses the cache and re-fetches', async () => {
  const { controller, fetchCalls } = createHarness();

  await controller.preload('https://example.test/a.jpg');
  await controller.preload('https://example.test/a.jpg', { readCache: false });

  assert.equal(fetchCalls.length, 2);
});

test('preload() does not cache a failed fetch on its own -- repeat calls re-fetch', async () => {
  const { controller, fetchCalls } = createHarness({
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      return { ok: false, reason: 'unknown', message: 'boom' };
    },
  });

  const first = await controller.preload('https://example.test/broken.jpg');
  const second = await controller.preload('https://example.test/broken.jpg');

  assert.equal(first.ok, false);
  assert.equal(second.ok, false);
  assert.equal(fetchCalls.length, 2);
});

test('a neighbor-preload batch caches a failure so a later preload() call short-circuits', async () => {
  const pending = createDeferred<{ ok: false; reason: string; message: string }>();
  const { controller, fetchCalls } = createHarness({
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      return pending.promise;
    },
  });
  const model = baseModel();

  const result = controller.preloadMore(model, navigableFields(model));
  assert.ok(result);
  assert.equal(fetchCalls.length, 1);
  const failedUrl = fetchCalls[0]!;

  pending.resolve({ ok: false, reason: 'unknown', message: 'boom' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const preloadResult = await controller.preload(failedUrl);

  assert.equal(preloadResult.ok, false);
  assert.equal(fetchCalls.length, 1, 'the cached failure must short-circuit before calling fetchThumbnail again');
});

test('preloadMore() returns null when neighbor preload is not active', () => {
  const { controller } = createHarness({
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 0, neighborPreloadCacheLimit: 24 }),
  });
  const model = baseModel();

  const result = controller.preloadMore(model, navigableFields(model));

  assert.equal(result, null);
});

test('preloadMore() reports candidates from both directions within the configured radius', () => {
  const { controller } = createHarness({
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 2, neighborPreloadCacheLimit: 24 }),
    fetchThumbnail: async () => new Promise(() => undefined), // never resolves; we only check the synchronous candidate count here
  });
  const model = baseModel();

  const result = controller.preloadMore(model, navigableFields(model));

  assert.equal(result?.candidateCount, 4);
});

test('invalidate() drops a stale in-flight preload instead of caching it', async () => {
  const pending = createDeferred<{ ok: true; dataUrl: string; mimeType: string; byteLength: number; sha256?: string }>();
  const { controller, fetchCalls } = createHarness({
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      return pending.promise;
    },
  });
  const model = baseModel();

  const result = controller.preloadMore(model, navigableFields(model));
  assert.ok(result);

  // The first candidate's fetch is in flight at this point (governor lets one request
  // through synchronously); invalidating now must stop it from ever being remembered.
  controller.invalidate();

  pending.resolve({ ok: true, dataUrl: 'data:fake', mimeType: 'image/png', byteLength: 1, sha256: 'sha-stale' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  const cachedUrl = fetchCalls[0]!;
  assert.equal(controller.getCachedFingerprint(cachedUrl), null);
});

test('dispose() drops a stale in-flight failure instead of triggering a top-up refetch', async () => {
  const pending = createDeferred<{ ok: false; reason: string; message: string }>();
  const { controller, fetchCalls } = createHarness({
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      return pending.promise;
    },
  });
  const model = baseModel();

  controller.preloadMore(model, navigableFields(model));
  const callsBeforeDispose = fetchCalls.length;
  assert.equal(callsBeforeDispose, 1);

  assert.doesNotThrow(() => controller.dispose());

  pending.resolve({ ok: false, reason: 'unknown', message: 'boom' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  // A top-up after a failure would issue another fetch; disposal must suppress it.
  assert.equal(fetchCalls.length, callsBeforeDispose);
  assert.equal(controller.getCachedFingerprint(fetchCalls[0]!), null);
});

test('the cache evicts its oldest entry once the configured limit is exceeded', async () => {
  const { controller } = createHarness({
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 3, neighborPreloadCacheLimit: 1 }),
  });

  await controller.preload('https://example.test/a.jpg');
  await controller.preload('https://example.test/b.jpg');

  assert.equal(controller.getCachedFingerprint('https://example.test/a.jpg'), null);
  assert.notEqual(controller.getCachedFingerprint('https://example.test/b.jpg'), null);
});

test('a cache limit of 0 means unlimited', async () => {
  const { controller } = createHarness({
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 3, neighborPreloadCacheLimit: 0 }),
  });

  await controller.preload('https://example.test/a.jpg');
  await controller.preload('https://example.test/b.jpg');

  assert.notEqual(controller.getCachedFingerprint('https://example.test/a.jpg'), null);
  assert.notEqual(controller.getCachedFingerprint('https://example.test/b.jpg'), null);
});
