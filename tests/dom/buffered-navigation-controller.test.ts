import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BufferedNavigationController,
  type BufferedNavigationControllerDeps,
} from '../../extension/src/ui/panel/buffered-navigation-controller.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import { collectUrlFields } from '../../extension/src/core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from '../../extension/src/core/url/types.js';

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
}

function createHarness(overrides: Partial<BufferedNavigationControllerDeps> = {}): {
  readonly controller: BufferedNavigationController;
  readonly landed: LandedCall[];
} {
  const landed: LandedCall[] = [];
  let fetchCount = 0;
  // Track the URL the panel last landed on, the way ImageTrailPanel's applyLandedUrl updates the
  // selected URL, so sequential step() calls walk forward instead of re-anchoring on the base URL.
  let currentRawUrl = BASE_URL;

  const deps: BufferedNavigationControllerDeps = {
    getLocalSettings: () => ({ neighborPreloadEnabled: true, neighborPreloadRadius: 3, neighborPreloadProbeMethod: 'get' }),
    currentNavigationBaseRawUrl: () => currentRawUrl,
    currentNavigationBaseModel: () => baseModel(),
    includedNavigationFields: (fields) => fields,
    currentKnownImageFingerprint: () => null,
    hasSelectedTarget: () => true,
    currentPageHref: () => 'https://example.test/gallery',
    applyLandedUrl: async (nextUrl, displayUrl, sha256) => {
      landed.push({ nextUrl, displayUrl, sha256 });
      currentRawUrl = nextUrl;
      return true;
    },
    createPlaceholderImage: () => document.createElement('img'),
    scheduleRevoke: () => undefined,
    onToast: () => undefined,
    onSkipCapReached: () => undefined,
    onDebugChanged: () => undefined,
    checkRequestPolicy: async () => ({ status: 'unknown' }),
    probeImage: async (url) => ({ ok: true, status: 200, finalUrl: url }),
    fetchDecodedImage: async () => {
      fetchCount += 1;
      return {
        ok: true,
        blobUrl: `blob:fake-${fetchCount}`,
        imgElement: document.createElement('img'),
        sha256: `sha-${fetchCount}`,
      };
    },
    ...overrides,
  };

  return { controller: new BufferedNavigationController(deps), landed };
}

test('sequential steps land candidates in queue order and re-land a buffered neighbor from cache', async () => {
  const { controller, landed } = createHarness();
  const model = baseModel();
  const fields = navigableFields(model);

  assert.equal(await controller.step(model, fields, 1), 'loaded');
  assert.equal(await controller.step(model, fields, 1), 'loaded');
  assert.equal(await controller.step(model, fields, -1), 'loaded');

  assert.deepEqual(
    landed.map((call) => call.nextUrl),
    ['https://example.test/gallery?image=11', 'https://example.test/gallery?image=12', 'https://example.test/gallery?image=11'],
  );
  assert.equal(
    landed[2]!.displayUrl,
    landed[0]!.displayUrl,
    'stepping back must reuse the buffered decode instead of fetching the image again',
  );
});

test('the buffered state holds real image elements created through the DOM document', async () => {
  const { controller } = createHarness();
  const model = baseModel();
  const fields = navigableFields(model);

  await controller.step(model, fields, 1);
  controller.toggleDebugVisible();
  const snapshot = controller.getDebugSnapshot();

  assert.ok(snapshot, 'debug snapshot must be available once toggled on');
  assert.equal(snapshot.cursor, 1);
  const anchor = snapshot.indices.get(0);
  assert.ok(anchor?.imgElement instanceof HTMLImageElement, 'the anchor placeholder must be a real <img> element');
  const landedEntry = snapshot.indices.get(1);
  assert.ok(landedEntry?.imgElement instanceof HTMLImageElement, 'the decoded neighbor must hold a real <img> element');
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
  // A settings change between the two rapid steps alters the buffered-navigation cache key,
  // forcing a rebuild with a fresh run id instead of quietly reusing the first call's state.
  radius = 4;
  const secondStep = await controller.step(model, fields, 1);

  assert.equal(secondStep, 'loaded');
  assert.equal(landed.length, 1);

  firstPolicyCall.resolve({ status: 'unknown' });
  const firstResult = await firstStep;

  assert.equal(firstResult, 'blocked');
  assert.equal(landed.length, 1, 'the stale run must not apply a second, invalid load');
});

test('dispose() cancels an in-flight step() so it settles blocked without landing', async () => {
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
