import assert from 'node:assert/strict';
import test from 'node:test';

import { createInitialPanelState } from '../extension/src/core/state.js';
import type { PanelAction, PanelState } from '../extension/src/core/types.js';
import { handlePanelShortcutAction, type ShortcutActionDeps } from '../extension/src/ui/panel/shortcut-actions.js';

interface Harness {
  readonly deps: ShortcutActionDeps;
  readonly actions: PanelAction[];
  readonly feedback: Array<{ readonly message: string; readonly tone: string }>;
  readonly calls: { bookmark: number; capture: number; download: boolean[] };
  setState(state: PanelState): void;
}

function createHarness(overrides: Partial<PanelState> = {}): Harness {
  let state: PanelState = {
    ...createInitialPanelState(0),
    visible: true,
    target: { ...createInitialPanelState(0).target, selectedUrl: 'https://private.example.test/photo.jpg' },
    ...overrides,
  };
  const actions: PanelAction[] = [];
  const feedback: Array<{ readonly message: string; readonly tone: string }> = [];
  const calls = { bookmark: 0, capture: 0, download: [] as boolean[] };
  return {
    deps: {
      getState: () => state,
      dispatch: (action) => actions.push(action),
      slideshow: () => ({ currentPhase: 'idle' }),
      toggleBufferedNavDebug: () => undefined,
      bookmarkCurrentImage: async () => {
        calls.bookmark += 1;
        return true;
      },
      captureImage: async () => {
        calls.capture += 1;
        return { status: 'captured', blobId: 'blob-1', mimeType: 'image/jpeg', byteLength: 12 };
      },
      downloadCurrentImage: async (saveAs) => {
        calls.download.push(saveAs);
        return true;
      },
      showFeedback: (message, tone = 'success') => feedback.push({ message, tone }),
    },
    actions,
    feedback,
    calls,
    setState: (next) => {
      state = next;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

test('C falls back to a durable pin while encryption is locked', async () => {
  const harness = createHarness({ blobKeyUnlocked: false });
  assert.equal(handlePanelShortcutAction('capture-current', harness.deps), true);
  await flush();
  assert.equal(harness.calls.bookmark, 1);
  assert.equal(harness.calls.capture, 0);
  assert.deepEqual(harness.feedback, [{ message: 'Pinned — unlock encryption to store the original', tone: 'success' }]);
});

test('C and B capture the original when encryption is unlocked', async () => {
  const harness = createHarness({ blobKeyUnlocked: true });
  assert.equal(handlePanelShortcutAction('capture-current', harness.deps), true);
  assert.equal(handlePanelShortcutAction('capture-and-bookmark', harness.deps), true);
  await flush();
  assert.equal(harness.calls.capture, 2);
  assert.deepEqual(
    harness.feedback,
    Array.from({ length: 2 }, () => ({ message: 'Captured original ✓', tone: 'success' })),
  );
});

test('Down follows the extension-owned assignment and stays native when unassigned', async () => {
  const harness = createHarness({ downArrowAction: 'off' });
  assert.equal(handlePanelShortcutAction('down-arrow', harness.deps), false);
  harness.setState({ ...createInitialPanelState(0), visible: true, downArrowAction: 'download', target: harness.deps.getState().target });
  assert.equal(handlePanelShortcutAction('down-arrow', harness.deps), true);
  await flush();
  assert.deepEqual(harness.calls.download, [false]);
  assert.deepEqual(harness.feedback, [{ message: 'Downloading current image…', tone: 'success' }]);
  assert.doesNotMatch(harness.feedback[0]?.message ?? '', /private\.example|photo\.jpg/u);
});

test('P pins without capturing and Escape leaves the active surface before closing the panel', async () => {
  const harness = createHarness();
  assert.equal(handlePanelShortcutAction('pin-current', harness.deps), true);
  await flush();
  assert.equal(harness.calls.bookmark, 1);
  assert.equal(harness.calls.capture, 0);

  harness.setState({ ...harness.deps.getState(), helpOpen: true });
  handlePanelShortcutAction('close-surface', harness.deps);
  harness.setState({ ...harness.deps.getState(), helpOpen: false, activeDestination: 'settings' });
  handlePanelShortcutAction('close-surface', harness.deps);
  harness.setState({ ...harness.deps.getState(), activeDestination: null });
  handlePanelShortcutAction('close-surface', harness.deps);
  assert.deepEqual(harness.actions, [{ name: 'help/toggle' }, { name: 'destination/close' }, { name: 'close-panel' }]);
});

test('unknown shortcut ids are not handled', () => {
  const harness = createHarness();
  assert.equal(handlePanelShortcutAction('not-a-shortcut', harness.deps), false);
  assert.deepEqual(harness.actions, []);
});
