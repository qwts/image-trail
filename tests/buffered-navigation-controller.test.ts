import test from 'node:test';
import assert from 'node:assert/strict';
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
} {
  const landed: LandedCall[] = [];
  const toasts: string[] = [];
  let fetchCount = 0;

  const deps: BufferedNavigationControllerDeps = {
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 3, neighborPreloadProbeMethod: 'get' }),
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
    scheduleRevoke: () => undefined,
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

  return { controller: new BufferedNavigationController(deps), landed, toasts };
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
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: radius, neighborPreloadProbeMethod: 'get' }),
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
  assert.equal(controller.getDebugSnapshot(), null);

  const result = await stepPromise;

  assert.equal(result, 'blocked');
  assert.equal(landed.length, 0);

  assert.doesNotThrow(() => controller.dispose());
});
