import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialPanelState } from '../../extension/src/core/state.js';
import type { PanelState, UrlTemplateStore } from '../../extension/src/core/types.js';
import { parseUrl } from '../../extension/src/core/url/parse-url.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../../extension/src/core/url/templates.js';
import type { ParsedUrlModel } from '../../extension/src/core/url/types.js';
import {
  UrlTemplateSettingsController,
  type UrlTemplateSettingsControllerDeps,
} from '../../extension/src/ui/panel/url-template-settings-controller.js';

// This suite runs under happy-dom (tests/dom/register.ts preload) specifically to exercise the
// window.location-dependent branches: currentUrlTemplateHostname()'s fallback to hostnameFromLocation()
// when there is no parseable current URL model, and activeTemplateIdForCurrentUrl()'s catch path.

interface Harness {
  readonly controller: UrlTemplateSettingsController;
  getState(): PanelState;
  patchState(patch: Partial<PanelState>): void;
  readonly savePatternLog: GrabSourcePattern[];
  readonly pagePatterns: (readonly GrabSourcePattern[])[];
}

const NO_MODEL = Symbol('no-model');

// `currentUrlModel` throws when seeded with NO_MODEL, matching the panel behaviour when the current
// URL cannot be parsed. An in-memory Map-backed UrlTemplateStore records writes for assertions.
function createHarness(model: ParsedUrlModel | typeof NO_MODEL): Harness {
  let state = createInitialPanelState(0);
  const savePatternLog: GrabSourcePattern[] = [];
  const pagePatterns: (readonly GrabSourcePattern[])[] = [];
  const patternsByHost = new Map<string, GrabSourcePattern[]>();

  const store: UrlTemplateStore = {
    load: async () => [],
    loadGrabSourcePatterns: async (hostname) => patternsByHost.get(hostname) ?? [],
    save: async () => {},
    saveGrabSourcePattern: async (pattern) => {
      const list = patternsByHost.get(pattern.hostname) ?? [];
      patternsByHost.set(pattern.hostname, [...list.filter((candidate) => candidate.id !== pattern.id), pattern]);
      savePatternLog.push(pattern);
    },
    remove: async () => {},
    removeGrabSourcePattern: async () => {},
  };

  const deps: UrlTemplateSettingsControllerDeps = {
    store: () => store,
    getState: () => state,
    setState: (next) => {
      state = next;
    },
    render: () => {},
    currentUrlModel: () => {
      if (model === NO_MODEL) throw new Error('no current url model');
      return model;
    },
    setUrlTemplates: () => {},
    setGrabSourcePatterns: (patterns) => {
      pagePatterns.push(patterns);
    },
    loadGrabSettings: async () => {},
  };

  return {
    controller: new UrlTemplateSettingsController(deps),
    getState: () => state,
    patchState: (patch) => {
      state = { ...state, ...patch };
    },
    savePatternLog,
    pagePatterns,
  };
}

test('currentUrlTemplateHostname falls back to window.location when there is no url model', () => {
  window.location.href = 'https://fallback.example.test/gallery';
  const harness = createHarness(NO_MODEL);

  assert.equal(harness.controller.currentUrlTemplateHostname(), 'fallback.example.test');
});

test('currentUrlTemplateHostname derives the hostname from a parseable url model', () => {
  const harness = createHarness(parseUrl('https://images.example.test/albums/photo_0001.jpg'));

  assert.equal(harness.controller.currentUrlTemplateHostname(), 'images.example.test');
});

test('activeTemplateIdForCurrentUrl returns null when the current url model throws', () => {
  const harness = createHarness(NO_MODEL);
  const templates: readonly UrlTemplateRecord[] = [];

  assert.equal(harness.controller.activeTemplateIdForCurrentUrl(templates), null);
});

test('learnGrabSourcePattern persists a valid pattern and pushes it to the page', async () => {
  const harness = createHarness(parseUrl('https://cdn.example.test/image-0001.jpg'));

  await harness.controller.learnGrabSourcePattern('https://cdn.example.test/image-0002.jpg');

  assert.equal(harness.savePatternLog.length, 1);
  assert.equal(harness.getState().status, 'ready');
  assert.deepEqual(
    harness.pagePatterns.at(-1)!.map((pattern) => pattern.hostname),
    ['cdn.example.test'],
  );
});
