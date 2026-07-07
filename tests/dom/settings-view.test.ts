import test from 'node:test';
import assert from 'node:assert/strict';

import type { BuildIdentity } from '../../extension/src/core/build-info.js';
import type { PanelAction } from '../../extension/src/core/types.js';
import { createBuildIdentitySettingsView, createSettingsView } from '../../extension/src/ui/components/settings-view.js';

const buildIdentity: BuildIdentity = {
  schemaVersion: 1,
  version: '0.0.0-test',
  builtAt: '2026-07-04T12:00:00.000Z',
  commit: 'abc123',
  branch: 'codex/356-build-info-command',
  worktree: 'image-trail',
  timezone: 'America/Chicago',
  mode: 'local',
};

test('build identity settings exposes the overlay visibility toggle', () => {
  const actions: PanelAction[] = [];
  const view = createBuildIdentitySettingsView(
    {
      identity: buildIdentity,
      overlayVisible: true,
    },
    (action) => actions.push(action),
  );

  const input = view.querySelector<HTMLInputElement>('input[type="checkbox"]');
  assert.ok(input);
  assert.equal(input.checked, true);
  assert.match(view.textContent ?? '', /Show build info overlay/);

  input.checked = false;
  input.dispatchEvent(new Event('change'));

  assert.deepEqual(actions, [{ name: 'settings/update-build-info-overlay-visibility', visible: false }]);
});

test('recents settings dispatches visible and max kept limits', () => {
  const actions: PanelAction[] = [];
  const view = createSettingsView(
    30,
    { limit: 2, retainedLimit: 3, overflowBehavior: 'keep-session', sparseRowDisplayMode: 'adaptive' },
    false,
    { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' },
    [],
    [],
    null,
    [],
    { pinSaveStoragePreference: 'encrypted', blobKeyUnlocked: false, blobKeyAvailable: false },
    { visibleQueueCount: 0, recallCount: 0, busy: false },
    null,
    { identity: null, overlayVisible: true },
    { limit: 5_000, clearAfterExport: false },
    { minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 },
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' },
    false,
    [],
    (action) => actions.push(action),
  );
  const recents = recentsSettings(view);
  const inputs = recents.querySelectorAll<HTMLInputElement>('input[type="number"]');
  assert.equal(inputs.length, 2);
  inputs[0]!.value = '4';
  inputs[1]!.value = '7';
  recents.querySelector<HTMLSelectElement>('select')!.value = 'drop-oldest';

  recents.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

  assert.deepEqual(actions.at(-1), {
    name: 'settings/update-recent-history-retention',
    limit: 4,
    retainedLimit: 7,
    overflowBehavior: 'drop-oldest',
  });

  recents.querySelector<HTMLButtonElement>('button[type="button"]')!.click();

  assert.deepEqual(actions.at(-1), {
    name: 'settings/update-recent-history-retention',
    limit: 3,
    retainedLimit: 3,
    overflowBehavior: 'keep-session',
  });

  const sparseMode = Array.from(recents.querySelectorAll<HTMLSelectElement>('select')).find((select) => select.value === 'adaptive');
  assert.ok(sparseMode);
  sparseMode.value = 'compact';
  sparseMode.dispatchEvent(new Event('change'));

  assert.deepEqual(actions.at(-1), {
    name: 'settings/update-recent-sparse-row-display-mode',
    mode: 'compact',
  });
});

test('the Failure feedback control dispatches the selected mode (#450)', () => {
  const actions: PanelAction[] = [];
  const view = createSettingsView(
    30,
    { limit: 2, retainedLimit: 3, overflowBehavior: 'keep-session', sparseRowDisplayMode: 'adaptive' },
    false,
    { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' },
    [],
    [],
    null,
    [],
    { pinSaveStoragePreference: 'encrypted', blobKeyUnlocked: false, blobKeyAvailable: false },
    { visibleQueueCount: 0, recallCount: 0, busy: false },
    null,
    { identity: null, overlayVisible: true },
    { limit: 5_000, clearAfterExport: false },
    { minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 },
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' },
    false,
    [],
    (action) => actions.push(action),
  );

  const feedbackLabel = Array.from(view.querySelectorAll('label')).find((label) => label.textContent?.includes('Failure feedback'));
  assert.ok(feedbackLabel, 'expected a Failure feedback control');
  const select = feedbackLabel.querySelector('select');
  assert.ok(select instanceof HTMLSelectElement, 'expected the feedback select');
  select.value = 'alert';
  select.dispatchEvent(new Event('change', { bubbles: true }));

  const last = actions.at(-1);
  assert.equal(last?.name, 'settings/update-neighbor-preload');
  assert.equal((last as { readonly loadFailureFeedback?: string }).loadFailureFeedback, 'alert');
});

test('the Searchable metadata control dispatches the updated policy (#451)', () => {
  const actions: PanelAction[] = [];
  const view = createSettingsView(
    30,
    { limit: 2, retainedLimit: 3, overflowBehavior: 'keep-session' },
    false,
    { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' },
    [],
    [],
    null,
    [],
    { pinSaveStoragePreference: 'encrypted', blobKeyUnlocked: false, blobKeyAvailable: false },
    { visibleQueueCount: 0, recallCount: 0, busy: false },
    null,
    { identity: null, overlayVisible: true },
    { limit: 5_000, clearAfterExport: false },
    { minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 },
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' },
    false,
    [],
    (action) => actions.push(action),
  );

  const urlLabel = Array.from(view.querySelectorAll('label')).find((label) => label.textContent?.includes('Image URLs'));
  assert.ok(urlLabel, 'expected an Image URLs control');
  const select = urlLabel.querySelector('select');
  assert.ok(select instanceof HTMLSelectElement, 'expected the URL policy select');
  select.value = 'plaintext';
  select.dispatchEvent(new Event('change', { bubbles: true }));

  assert.deepEqual(actions.at(-1), {
    name: 'settings/update-metadata-policy',
    policy: { urlDerived: 'plaintext', albumName: 'encrypted', thumbnail: 'encrypted' },
  });
});

test('settings exposes browser, panel, and legacy shortcut decisions', () => {
  const view = createSettingsView(
    30,
    { limit: 2, retainedLimit: 3, overflowBehavior: 'keep-session', sparseRowDisplayMode: 'adaptive' },
    false,
    { urlDerived: 'encrypted', albumName: 'encrypted', thumbnail: 'encrypted' },
    [],
    [],
    null,
    [],
    { pinSaveStoragePreference: 'encrypted', blobKeyUnlocked: false, blobKeyAvailable: false },
    { visibleQueueCount: 0, recallCount: 0, busy: false },
    null,
    { identity: null, overlayVisible: true },
    { limit: 5_000, clearAfterExport: false },
    { minimumIntervalMs: 0, maxRequests: 3, windowMs: 10_000 },
    { enabled: false, radius: 3, cacheLimit: 24, probeMethod: 'get', feedback: 'mute' },
    false,
    [],
    () => {},
  );

  const text = view.textContent ?? '';
  assert.match(text, /Shortcuts/);
  assert.doesNotMatch(text, /Keyboard shortcuts/);
  assert.match(text, /Open or hide panel/);
  assert.match(text, /P/);
  assert.match(text, /Hide panel/);
  assert.match(text, /Legacy field jumps not assigned/);
  assert.match(text, /Legacy grayscale hide not assigned/);

  const shortcuts = Array.from(view.querySelectorAll<HTMLElement>('.image-trail-panel__shortcut-row'));
  assert.ok(shortcuts.length >= 20, 'shortcut reference should render shortcut rows');
  assert.ok(view.querySelector('.image-trail-panel__shortcut-keys kbd'), 'shortcut keys should render as stable key chips');

  const subheadings = Array.from(view.querySelectorAll('h5')).map((heading) => heading.textContent);
  assert.ok(subheadings.includes('Browser shortcuts'));
  assert.ok(subheadings.includes('Panel shortcuts'));
  assert.ok(subheadings.includes('Legacy keys'));
});

function recentsSettings(view: HTMLElement): HTMLElement {
  for (const heading of view.querySelectorAll('h4')) {
    if (heading.textContent === 'Recents') {
      const wrapper = heading.closest<HTMLElement>('.image-trail-panel__settings-templates');
      if (wrapper) return wrapper;
    }
  }
  throw new Error('Recents settings view not found.');
}
