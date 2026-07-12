import test from 'node:test';
import assert from 'node:assert/strict';

import type { BuildIdentity } from '../../extension/src/core/build-info.js';
import type { PanelAction } from '../../extension/src/core/types.js';
import {
  createBuildIdentitySettingsView,
  createDestructiveSettingsView,
  createStorageHealthSettingsView,
} from '../../extension/src/ui/components/maintenance-settings-view.js';

const buildIdentity: BuildIdentity = {
  schemaVersion: 1,
  version: '0.0.0-test',
  builtAt: '2026-07-04T12:00:00.000Z',
  commit: 'abc123',
  branch: 'codex/test',
  worktree: 'image-trail',
  timezone: 'America/Chicago',
  mode: 'local',
};

test('build identity renders loaded and loading states and dispatches overlay visibility once', () => {
  assert.match(createBuildIdentitySettingsView({ identity: null, overlayVisible: false }, () => {}).textContent ?? '', /not loaded yet/);
  const actions: PanelAction[] = [];
  const view = createBuildIdentitySettingsView({ identity: buildIdentity, overlayVisible: true }, (action) => actions.push(action));
  const input = view.querySelector('input');
  assert.ok(input);
  assert.equal(input.checked, true);
  assert.match(view.textContent ?? '', /abc123/);
  input.checked = false;
  input.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'settings/update-build-info-overlay-visibility', visible: false }]);
});

test('storage health renders loading and detailed usage without changing labels', () => {
  assert.match(createStorageHealthSettingsView(null).textContent ?? '', /not loaded yet/);
  const view = createStorageHealthSettingsView({
    blobCount: 2,
    totalBytes: 37_888,
    orphanedBlobCount: 1,
    queueRecords: { count: 3, totalBytes: 6_144 },
    thumbnails: { count: 1, totalBytes: 1_024 },
    originals: { count: 2, totalBytes: 30_720 },
  });
  const text = view.textContent ?? '';
  assert.match(text, /Queue metadata/);
  assert.match(text, /6\.0 KB/);
  assert.match(text, /Unlinked originals/);
});

test('destructive controls require confirmation, reset on blur, and dispatch once', () => {
  const actions: PanelAction[] = [];
  const view = createDestructiveSettingsView({ visibleQueueCount: 2, recallCount: 3, busy: false }, (action) => actions.push(action));
  const [queue, recall] = Array.from(view.querySelectorAll<HTMLButtonElement>('button'));
  assert.ok(queue);
  assert.ok(recall);
  assert.equal(queue.textContent, 'Delete current queue (2)');
  assert.equal(recall.textContent, 'Delete Recall items (3)');

  queue.click();
  assert.equal(actions.length, 0);
  assert.equal(queue.textContent, 'Confirm Delete current queue (2)');
  queue.dispatchEvent(new Event('blur'));
  assert.equal(queue.textContent, 'Delete current queue (2)');
  queue.click();
  queue.click();
  assert.deepEqual(actions, [{ name: 'bookmarks/delete-visible' }]);
  recall.click();
  recall.click();
  assert.deepEqual(actions, [{ name: 'bookmarks/delete-visible' }, { name: 'recall/delete-all' }]);
});

test('destructive controls disable empty and busy scopes', () => {
  const empty = createDestructiveSettingsView({ visibleQueueCount: 0, recallCount: 2, busy: false }, () => {});
  const emptyButtons = empty.querySelectorAll<HTMLButtonElement>('button');
  assert.equal(emptyButtons[0]?.disabled, true);
  assert.equal(emptyButtons[1]?.disabled, false);
  const busy = createDestructiveSettingsView({ visibleQueueCount: 2, recallCount: 2, busy: true }, () => {});
  assert.ok(Array.from(busy.querySelectorAll<HTMLButtonElement>('button')).every((button) => button.disabled));
});
