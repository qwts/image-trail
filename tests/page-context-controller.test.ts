import test from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_LOCAL_SETTINGS, type PlaintextLocalSettings } from '../extension/src/content/panel-services.js';
import type { PageContextDetection } from '../extension/src/core/page-context.js';
import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelState } from '../extension/src/core/types.js';
import { PageContextController, type PageContextControllerEnvironment } from '../extension/src/ui/panel/page-context-controller.js';

function createHarness(input: { detection: PageContextDetection; hostname?: string; settings?: PlaintextLocalSettings }) {
  let state: PanelState = { ...createInitialPanelState(0), visible: true };
  let settings = input.settings ?? DEFAULT_LOCAL_SETTINGS;
  let detection = input.detection;
  let hostname = input.hostname ?? 'Example.TEST';
  let refresh: (() => void) | null = null;
  const observerCalls: string[] = [];
  const saved: PlaintextLocalSettings[] = [];
  let renders = 0;
  const environment: PageContextControllerEnvironment = {
    detect: () => detection,
    hostname: () => hostname,
    createObserver: (onRefresh) => {
      refresh = onRefresh;
      return {
        start: () => observerCalls.push('start'),
        stop: () => observerCalls.push('stop'),
      };
    },
  };
  const controller = new PageContextController(
    {
      getState: () => state,
      setState: (next) => {
        state = next;
      },
      getLocalSettings: () => settings,
      saveLocalSettings: (next) => {
        settings = next;
        saved.push(next);
      },
      render: () => {
        renders += 1;
      },
    },
    environment,
  );
  return {
    controller,
    getState: () => state,
    getSettings: () => settings,
    saved,
    observerCalls,
    getRenders: () => renders,
    setDetection: (next: PageContextDetection) => {
      detection = next;
    },
    setHostname: (next: string) => {
      hostname = next;
    },
    refresh: () => refresh?.(),
  };
}

test('detects on start, persists a per-host override, and clears it explicitly', () => {
  const harness = createHarness({ detection: { detected: 'feed', available: ['single', 'gallery', 'feed'], imageCount: 6 } });
  harness.controller.start();
  assert.equal(harness.getState().pageContext.effective, 'feed');
  assert.deepEqual(harness.observerCalls, ['start']);

  harness.controller.setOverride('gallery');
  assert.equal(harness.getState().pageContext.effective, 'gallery');
  assert.equal(harness.getSettings().pageContextOverrides['example.test']?.context, 'gallery');
  assert.equal(harness.saved.length, 1);

  harness.controller.setOverride(null);
  assert.equal(harness.getState().pageContext.effective, 'feed');
  assert.equal(harness.getSettings().pageContextOverrides['example.test'], undefined);
  harness.controller.stop();
  assert.deepEqual(harness.observerCalls, ['start', 'stop']);
});

test('keeps unsupported saved overrides inactive and reloads overrides after a hostname change', () => {
  const harness = createHarness({
    detection: { detected: 'single', available: ['single'], imageCount: 1 },
    settings: {
      ...DEFAULT_LOCAL_SETTINGS,
      pageContextOverrides: {
        'example.test': { context: 'feed', updatedAt: 1 },
        'gallery.test': { context: 'gallery', updatedAt: 2 },
      },
    },
  });
  harness.controller.start();
  assert.equal(harness.getState().pageContext.effective, 'single');
  assert.equal(harness.getState().pageContext.override, 'feed');

  harness.setHostname('gallery.test');
  harness.setDetection({ detected: 'feed', available: ['single', 'gallery', 'feed'], imageCount: 4 });
  harness.refresh();
  assert.equal(harness.getState().pageContext.effective, 'gallery');
  assert.equal(harness.getState().pageContext.override, 'gallery');
  assert.ok(harness.getRenders() >= 2);
});
