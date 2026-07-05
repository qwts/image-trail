import test from 'node:test';
import assert from 'node:assert/strict';

import type { BuildIdentity } from '../../extension/src/core/build-info.js';
import type { PanelAction } from '../../extension/src/core/types.js';
import { createBuildIdentitySettingsView } from '../../extension/src/ui/components/settings-view.js';

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
