import test from 'node:test';
import assert from 'node:assert/strict';

import type { PanelAction } from '../../extension/src/core/types.js';
import { createPanelLayoutSettingsView } from '../../extension/src/ui/components/panel-layout-settings-view.js';

function build(restoreWorkspaceLayoutEnabled: boolean): { view: HTMLElement; actions: PanelAction[] } {
  const actions: PanelAction[] = [];
  const view = createPanelLayoutSettingsView(restoreWorkspaceLayoutEnabled, (action) => actions.push(action));
  return { view, actions };
}

test('the workspace-layout checkbox reflects the setting and dispatches the update action', () => {
  const { view, actions } = build(false);
  const checkbox = view.querySelector<HTMLInputElement>('.image-trail-panel__settings-checkbox input');
  assert.ok(checkbox);
  assert.equal(checkbox.checked, false);

  checkbox.checked = true;
  checkbox.dispatchEvent(new Event('change'));
  assert.deepEqual(actions, [{ name: 'settings/update-workspace-layout-restore', enabled: true }]);

  assert.equal(build(true).view.querySelector<HTMLInputElement>('.image-trail-panel__settings-checkbox input')?.checked, true);
});

test('the reset buttons dispatch their respective per-site reset actions', () => {
  const { view, actions } = build(true);
  const buttons = Array.from(view.querySelectorAll<HTMLButtonElement>('button'));
  const resetPosition = buttons.find((button) => button.textContent === 'Reset panel position');
  const resetWorkspace = buttons.find((button) => button.textContent === 'Reset workspace layout');
  assert.ok(resetPosition);
  assert.ok(resetWorkspace);

  resetPosition.click();
  resetWorkspace.click();
  assert.deepEqual(actions, [{ name: 'settings/reset-panel-position' }, { name: 'settings/reset-workspace-layout' }]);
});
