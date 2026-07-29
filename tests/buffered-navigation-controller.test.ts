import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProbeBufferedImageResult } from '../extension/src/content/buffered-image-source.js';
import {
  BufferedNavigationController,
  type BufferedNavigationControllerDeps,
} from '../extension/src/ui/panel/buffered-navigation-controller.js';
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

interface LandedCall {
  readonly nextUrl: string;
  readonly displayUrl: string;
  readonly sha256: string | null;
  readonly attemptedFieldIds: readonly string[];
}

function createHarness(overrides: Partial<BufferedNavigationControllerDeps> = {}): {
  readonly controller: BufferedNavigationController;
  readonly landed: LandedCall[];
  readonly toasts: string[];
  readonly revoked: string[];
} {
  const landed: LandedCall[] = [];
  const toasts: string[] = [];
  const revoked: string[] = [];
  let fetchCount = 0;

  const deps: BufferedNavigationControllerDeps = {
    getLocalSettings: () => ({
      neighborPreloadEnabled: true,
      neighborPreloadRadius: 3,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'alert',
    }),
    currentNavigationBaseRawUrl: () => BASE_URL,
    currentNavigationBaseModel: () => baseModel(),
    includedNavigationFields: (fields) => fields,
    currentKnownImageFingerprint: () => null,
    hasSelectedTarget: () => true,
    currentPageHref: () => 'https://example.test/gallery',
    applyLandedUrl: async (nextUrl, displayUrl, sha256, attemptedFieldIds) => {
      landed.push({ nextUrl, displayUrl, sha256, attemptedFieldIds });
      return true;
    },
    createPlaceholderImage: () => ({}) as unknown as HTMLImageElement,
    scheduleRevoke: (blobUrl) => revoked.push(blobUrl),
    onToast: (message) => toasts.push(message),
    onSkipCapReached: (message) => toasts.push(message),
    onDebugChanged: () => undefined,
    checkRequestPolicy: async () => ({ status: 'unknown' }),
    probeImage: async (url) => ({ ok: true, status: 200, finalUrl: url }),
    fetchDecodedImage: async () => {
      fetchCount += 1;
      return {
        ok: true,
        blobUrl: `blob:fake-${fetchCount}`,
        imgElement: {} as unknown as HTMLImageElement,
        sha256: `sha-${fetchCount}`,
      };
    },
    ...overrides,
  };

  return { controller: new BufferedNavigationController(deps), landed, toasts, revoked };
}

async function currentBufferedBlobUrls(controller: BufferedNavigationController): Promise<readonly string[]> {
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.toggleDebugVisible();
  const snapshot = controller.getSnapshots().debug;
  assert.ok(snapshot);
  return [
    ...new Set([...snapshot.indices.values()].map((entry) => entry.blobUrl).filter((url): url is string => !!url?.startsWith('blob:'))),
  ];
}

test('step() lands on the next candidate and reports it through applyLandedUrl', async () => {
  const { controller, landed } = createHarness();
  const model = baseModel();
  const fields = navigableFields(model);

  const result = await controller.step(model, fields, 1);

  assert.equal(result, 'loaded');
  assert.equal(landed.length, 1);
  assert.match(landed[0]!.nextUrl, /image=11$/);
  assert.deepEqual(
    landed[0]!.attemptedFieldIds,
    fields.map((field) => field.id),
  );
});

test('a later step() invalidates a still-pending earlier one so it resolves blocked without double-applying', async () => {
  const firstPolicyCall = createDeferred<{ status: 'unknown' }>();
  let deferredIssued = false;
  let radius = 3;
  const { controller, landed } = createHarness({
    getLocalSettings: () => ({
      neighborPreloadEnabled: true,
      neighborPreloadRadius: radius,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'alert',
    }),
    // Only the first probe of the landing candidate (image=11) hangs; every other probe -
    // including the second run's own probe of the same candidate - resolves immediately.
    checkRequestPolicy: async (url) => {
      if (url.endsWith('image=11') && !deferredIssued) {
        deferredIssued = true;
        return firstPolicyCall.promise;
      }
      return { status: 'unknown' };
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const firstStep = controller.step(model, fields, 1);
  // Simulate settings changing between the two rapid steps (e.g. the preload radius),
  // which changes the buffered-navigation cache key and forces a genuine rebuild + a
  // fresh run id, instead of the second call quietly reusing the first call's state.
  radius = 4;
  const secondStep = await controller.step(model, fields, 1);

  assert.equal(secondStep, 'loaded');
  assert.equal(landed.length, 1);

  firstPolicyCall.resolve({ status: 'unknown' });
  const firstResult = await firstStep;

  assert.equal(firstResult, 'blocked');
  assert.equal(landed.length, 1, 'the stale run must not apply a second, invalid load');
});

test('step() skips a failed neighbor (probe) and lands on the next good one', async () => {
  const { controller, landed } = createHarness({
    probeImage: async (url) => {
      if (url.endsWith('image=11')) return { ok: false, status: 404, message: 'not found' };
      return { ok: true, status: 200, finalUrl: url };
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const result = await controller.step(model, fields, 1);

  assert.equal(result, 'loaded');
  assert.equal(landed.length, 1);
  assert.match(landed[0]!.nextUrl, /image=12$/);
});

test('status snapshot counts a traversed failure as skipped without exposing candidate URLs', async () => {
  let statusChanges = 0;
  const { controller } = createHarness({
    onDebugChanged: () => {
      statusChanges += 1;
    },
    probeImage: async (url) => {
      if (url.endsWith('image=11')) return { ok: false, status: 404, message: 'not found' };
      return { ok: true, status: 200, finalUrl: url };
    },
  });

  assert.equal(await controller.step(baseModel(), navigableFields(baseModel()), 1), 'loaded');
  const snapshot = controller.getSnapshots().status;

  assert.ok(snapshot);
  assert.equal(snapshot.total, 6);
  assert.equal(snapshot.skipped, 1);
  assert.equal(snapshot.failuresVisible, true);
  assert.ok(statusChanges > 0, 'buffer transitions request targeted status refreshes');
  assert.doesNotMatch(JSON.stringify(snapshot), /example\.test|image=/u);
});

test('status snapshot tells the view when Failure feedback is muted', async () => {
  const { controller } = createHarness({
    getLocalSettings: () => ({
      neighborPreloadEnabled: true,
      neighborPreloadRadius: 1,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'mute',
    }),
  });

  await controller.step(baseModel(), navigableFields(baseModel()), 1);

  assert.equal(controller.getSnapshots().status?.failuresVisible, false);
});

test('step() skips a failed neighbor (decoded GET) and lands on the next good one', async () => {
  let fetchCount = 0;
  const { controller, landed } = createHarness({
    fetchDecodedImage: async (url) => {
      if (url.endsWith('image=11')) return { ok: false, message: 'http 404' };
      fetchCount += 1;
      return { ok: true, blobUrl: `blob:ok-${fetchCount}`, imgElement: {} as unknown as HTMLImageElement, sha256: `sha-${fetchCount}` };
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const result = await controller.step(model, fields, 1);

  assert.equal(result, 'loaded');
  assert.equal(landed.length, 1);
  assert.match(landed[0]!.nextUrl, /image=12$/);
});

test('a skipped candidate toasts in Alert mode but stays silent in Mute mode, still skipping to the next good one (#450)', async () => {
  const probeImage = async (url: string) =>
    url.endsWith('image=11')
      ? { ok: false as const, status: 404, message: 'not found' }
      : { ok: true as const, status: 200, finalUrl: url };

  const alert = createHarness({ probeImage });
  await alert.controller.step(baseModel(), navigableFields(baseModel()), 1);
  assert.ok(alert.toasts.includes('Skipped a failed image candidate.'), 'Alert mode surfaces the skip toast');

  const mute = createHarness({
    probeImage,
    getLocalSettings: () => ({
      neighborPreloadEnabled: true,
      neighborPreloadRadius: 3,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'mute',
    }),
  });
  const result = await mute.controller.step(baseModel(), navigableFields(baseModel()), 1);
  assert.equal(result, 'loaded', 'Mute still skips past the failed neighbor to the next good candidate');
  assert.equal(mute.landed.at(-1)?.nextUrl.endsWith('image=12'), true);
  assert.ok(!mute.toasts.includes('Skipped a failed image candidate.'), 'Mute does not surface the skip toast');
});

test('dispose() settles an in-flight step() instead of leaving it hanging forever', async () => {
  // This checkRequestPolicy never resolves on its own - the only way step() can
  // possibly settle is if dispose() actively cancels the in-flight probe.
  const pending = createDeferred<{ status: 'unknown' }>();
  const { controller, landed } = createHarness({
    checkRequestPolicy: async () => pending.promise,
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const stepPromise = controller.step(model, fields, 1);

  assert.doesNotThrow(() => controller.dispose());
  assert.equal(controller.getSnapshots().debug, null);

  const result = await stepPromise;

  assert.equal(result, 'blocked');
  assert.equal(landed.length, 0);

  assert.doesNotThrow(() => controller.dispose());
});

test('a navigation-window rebuild transfers the selected blob and revokes every offscreen blob', async () => {
  let radius = 2;
  let currentUrl = BASE_URL;
  let activeBlobUrl = '';
  const { controller, revoked } = createHarness({
    getLocalSettings: () => ({
      neighborPreloadEnabled: true,
      neighborPreloadRadius: radius,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'alert',
    }),
    currentNavigationBaseRawUrl: () => currentUrl,
    currentNavigationBaseModel: () => parseUrl(currentUrl),
    applyLandedUrl: async (nextUrl, displayUrl) => {
      currentUrl = nextUrl;
      activeBlobUrl = displayUrl;
      return true;
    },
  });
  const model = baseModel();
  await controller.step(model, navigableFields(model), 1);
  const oldBlobUrls = await currentBufferedBlobUrls(controller);
  assert.ok(oldBlobUrls.length > 0);
  const priorRevokeCount = revoked.length;

  radius = 3;
  controller.prime();

  const rebuiltWindowRevokes = revoked.slice(priorRevokeCount);
  assert.deepEqual(new Set(rebuiltWindowRevokes), new Set(oldBlobUrls.filter((blobUrl) => blobUrl !== activeBlobUrl)));
  assert.equal(rebuiltWindowRevokes.includes(activeBlobUrl), false);
  assert.equal(rebuiltWindowRevokes.includes(BASE_URL), false);
  assert.equal(controller.getSnapshots().debug?.indices.get(0)?.blobUrl, activeBlobUrl);
});

test('disabling buffered navigation retains the selected blob until final disposal', async () => {
  let enabled = true;
  let currentUrl = BASE_URL;
  let activeBlobUrl = '';
  const { controller, revoked } = createHarness({
    getLocalSettings: () => ({
      neighborPreloadEnabled: enabled,
      neighborPreloadRadius: 2,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'alert',
    }),
    currentNavigationBaseRawUrl: () => currentUrl,
    currentNavigationBaseModel: () => parseUrl(currentUrl),
    applyLandedUrl: async (nextUrl, displayUrl) => {
      currentUrl = nextUrl;
      activeBlobUrl = displayUrl;
      return true;
    },
  });
  const model = baseModel();
  await controller.step(model, navigableFields(model), 1);
  const oldBlobUrls = await currentBufferedBlobUrls(controller);
  const priorRevokeCount = revoked.length;

  enabled = false;
  controller.prime();

  assert.deepEqual(new Set(revoked.slice(priorRevokeCount)), new Set(oldBlobUrls.filter((blobUrl) => blobUrl !== activeBlobUrl)));
  assert.equal(revoked.includes(activeBlobUrl), false);
  assert.equal(controller.getSnapshots().debug, null);

  controller.dispose();
  assert.equal(revoked.filter((blobUrl) => blobUrl === activeBlobUrl).length, 1);
});

test('dispose revokes every decoded blob URL once and remains idempotent', async () => {
  const { controller, revoked } = createHarness();
  const model = baseModel();
  await controller.step(model, navigableFields(model), 1);
  const oldBlobUrls = await currentBufferedBlobUrls(controller);
  const priorRevokeCount = revoked.length;

  controller.dispose();
  controller.dispose();

  const disposalRevokes = revoked.slice(priorRevokeCount);
  assert.deepEqual(new Set(disposalRevokes), new Set(oldBlobUrls));
  assert.equal(disposalRevokes.length, oldBlobUrls.length);
});

test('decoded blobs that finish after disposal are still revoked', async () => {
  const pendingDecode = createDeferred<{
    ok: true;
    blobUrl: string;
    imgElement: HTMLImageElement;
    sha256: string;
  }>();
  let fetchStarted = false;
  const lateBlobUrls: string[] = [];
  const { controller, revoked } = createHarness({
    fetchDecodedImage: () => {
      fetchStarted = true;
      const blobUrl = `blob:late-after-disposal-${lateBlobUrls.length + 1}`;
      lateBlobUrls.push(blobUrl);
      return pendingDecode.promise.then((result) => ({ ...result, blobUrl }));
    },
  });
  const model = baseModel();
  const stepPromise = controller.step(model, navigableFields(model), 1);
  const deadline = Date.now() + 2000;
  while (!fetchStarted && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(fetchStarted, true);

  controller.dispose();
  assert.equal(await stepPromise, 'blocked');
  pendingDecode.resolve({
    ok: true,
    blobUrl: 'blob:late-after-disposal',
    imgElement: {} as unknown as HTMLImageElement,
    sha256: 'sha-late',
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(new Set(revoked), new Set(lateBlobUrls));
  assert.equal(revoked.length, lateBlobUrls.length);
});

test('a blocked seek probes the frontier concurrently and lands past a failed run in one step (#373)', async () => {
  // image=11..13 fail; image=14 (beyond the radius-3 window) is the next good image. The step must
  // warm the frontier probes together instead of awaiting one failed index per round-trip.
  const probeCalls: string[] = [];
  const probeGates = new Map<string, (result: ProbeBufferedImageResult) => void>();
  const { controller, landed } = createHarness({
    probeImage: (url) => {
      probeCalls.push(url);
      return new Promise<ProbeBufferedImageResult>((resolve) => {
        probeGates.set(url, resolve);
      });
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const stepPromise = controller.step(model, fields, 1);
  await new Promise((resolve) => setTimeout(resolve, 0));
  await new Promise((resolve) => setTimeout(resolve, 0));

  // The frontier probe for image=14 starts while image=11's probe is still unresolved.
  assert.ok(
    probeCalls.some((url) => url.endsWith('image=14')),
    `image=14 must be probed before the blocked image=11 probe resolves; probed: ${probeCalls.join(', ')}`,
  );

  const settle = (suffix: string, ok: boolean): void => {
    const url = probeCalls.find((candidate) => candidate.endsWith(suffix));
    assert.ok(url, `expected a probe for ${suffix}`);
    probeGates.get(url!)?.(ok ? { ok: true, status: 200, finalUrl: url! } : { ok: false, status: 404, message: 'not found' });
  };
  settle('image=11', false);
  settle('image=12', false);
  settle('image=13', false);
  settle('image=14', true);

  const result = await stepPromise;
  assert.equal(result, 'loaded');
  assert.equal(landed.length, 1);
  assert.match(landed[0]!.nextUrl, /image=14$/, 'the seek skips the failed run and lands on the first good frontier image');
});

test('the GET the user is blocked on bypasses the prefetch concurrency cap (#373)', async () => {
  // Radius 4: the backward window (image=9..6) saturates all 4 GET slots with never-resolving
  // prefetches; image=11..14 fail their probes, so the seek lands on image=15 — whose GET must
  // start immediately instead of queueing behind the speculative window refill.
  const fetchCalls: string[] = [];
  const fetchGates = new Map<string, (result: { ok: true; blobUrl: string; imgElement: HTMLImageElement; sha256: string }) => void>();
  const failedProbe = (url: string): boolean => /image=1[1-4]$/.test(url);
  const { controller, landed } = createHarness({
    getLocalSettings: () => ({
      neighborPreloadEnabled: true,
      neighborPreloadRadius: 4,
      neighborPreloadProbeMethod: 'get',
      loadFailureFeedback: 'alert',
    }),
    probeImage: async (url): Promise<ProbeBufferedImageResult> =>
      failedProbe(url) ? { ok: false, status: 404, message: 'not found' } : { ok: true, status: 200, finalUrl: url },
    fetchDecodedImage: (url) => {
      fetchCalls.push(url);
      return new Promise((resolve) => {
        fetchGates.set(url, resolve);
      });
    },
  });
  const model = baseModel();
  const fields = navigableFields(model);

  const stepPromise = controller.step(model, fields, 1);
  const deadline = Date.now() + 2000;
  while (!fetchCalls.some((url) => url.endsWith('image=15')) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }

  assert.ok(
    fetchCalls.some((url) => url.endsWith('image=15')),
    `the user-blocking GET must start despite ${fetchCalls.length} in-flight prefetch GETs: ${fetchCalls.join(', ')}`,
  );

  const url = fetchCalls.find((candidate) => candidate.endsWith('image=15'))!;
  fetchGates.get(url)?.({ ok: true, blobUrl: 'blob:landing', imgElement: {} as unknown as HTMLImageElement, sha256: 'sha-landing' });

  const result = await stepPromise;
  assert.equal(result, 'loaded');
  assert.equal(landed.length, 1);
  assert.match(landed[0]!.nextUrl, /image=15$/);
});
