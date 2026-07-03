import test from 'node:test';
import assert from 'node:assert/strict';

import { NeighborPreloadController, type NeighborPreloadControllerDeps } from '../../extension/src/ui/panel/neighbor-preload-controller.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../../extension/src/core/url/types.js';

// image=0 clamps at zero when bumped downward, so with radius 1 exactly one preload
// candidate (image=1) exists - which makes in-flight dedupe assertions deterministic.
const BASE_URL = 'https://example.test/gallery?image=0';
const NEIGHBOR_URL = 'https://example.test/gallery?image=1';
const NEXT_NEIGHBOR_URL = 'https://example.test/gallery?image=2';

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

async function waitFor(condition: () => boolean, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function createHarness(overrides: Partial<NeighborPreloadControllerDeps> = {}): {
  readonly controller: NeighborPreloadController;
  readonly fetchCalls: string[];
} {
  const fetchCalls: string[] = [];
  let fetchCount = 0;

  const deps: NeighborPreloadControllerDeps = {
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 1, neighborPreloadCacheLimit: 24 }),
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

test('an overlapping preloadMore() dedupes against the in-flight request instead of re-fetching it', async () => {
  const pending = createDeferred<{ ok: true; dataUrl: string; mimeType: string; byteLength: number; sha256?: string }>();
  let deferredIssued = false;
  const { controller, fetchCalls } = createHarness({
    // Only the first fetch (the in-flight one being deduped against) hangs; the
    // overlapping batch's own fetch of the next neighbor resolves immediately.
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      if (!deferredIssued) {
        deferredIssued = true;
        return pending.promise;
      }
      return { ok: true, dataUrl: 'data:fake-next', mimeType: 'image/png', byteLength: 1, sha256: 'sha-next' };
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const first = controller.preloadMore(model, fields);
  assert.equal(first?.candidateCount, 1);
  assert.deepEqual(fetchCalls, [NEIGHBOR_URL], 'the single candidate fetch must be in flight');

  // The overlapping call must skip the in-flight image=1 and extend the buffer to the
  // next uncovered neighbor instead of issuing a second request for the same URL.
  const overlapping = controller.preloadMore(model, fields);
  assert.equal(overlapping?.candidateCount, 1);
  assert.deepEqual(fetchCalls, [NEIGHBOR_URL], 'no synchronous duplicate request for the in-flight URL');

  pending.resolve({ ok: true, dataUrl: 'data:fake', mimeType: 'image/png', byteLength: 1, sha256: 'sha-1' });
  // The overlapping batch's fetch is rate-limited by the request governor; wait for it
  // to go out rather than assuming its exact schedule.
  await waitFor(() => fetchCalls.length >= 2);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(fetchCalls, [NEIGHBOR_URL, NEXT_NEIGHBOR_URL], 'exactly one fetch per URL, never a duplicate');
  assert.equal(controller.getCachedFingerprint(NEIGHBOR_URL), 'sha-1');
});

test('the cache evicts its oldest entry once the configured limit is exceeded', async () => {
  const { controller, fetchCalls } = createHarness({
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 1, neighborPreloadCacheLimit: 1 }),
  });

  await controller.preload('https://example.test/a.jpg');
  await controller.preload('https://example.test/b.jpg');

  assert.equal(controller.getCachedFingerprint('https://example.test/a.jpg'), null, 'the oldest entry must be evicted');
  assert.notEqual(controller.getCachedFingerprint('https://example.test/b.jpg'), null, 'the newest entry must survive');

  await controller.preload('https://example.test/a.jpg');

  assert.equal(fetchCalls.length, 3, 'the evicted entry must be re-fetched on the next preload');
});

test('invalidate() drops a stale in-flight preload instead of caching its result', async () => {
  const pending = createDeferred<{ ok: true; dataUrl: string; mimeType: string; byteLength: number; sha256?: string }>();
  const { controller, fetchCalls } = createHarness({
    fetchThumbnail: async (url) => {
      fetchCalls.push(url);
      return pending.promise;
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const result = controller.preloadMore(model, fields);
  assert.ok(result);
  assert.deepEqual(fetchCalls, [NEIGHBOR_URL]);

  // The candidate fetch is in flight at this point; invalidating now must stop
  // its eventual resolution from ever being remembered.
  controller.invalidate();

  pending.resolve({ ok: true, dataUrl: 'data:fake', mimeType: 'image/png', byteLength: 1, sha256: 'sha-stale' });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(controller.getCachedFingerprint(NEIGHBOR_URL), null, 'the stale result must not be cached');
});
