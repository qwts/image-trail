import type { PanelAction } from '../../core/types.js';

/**
 * The Maintenance → "Panel layout" settings group, extracted from `settings-view.ts`: reset the
 * per-site panel position, and the per-site detached-workspace layout opt-in + reset (issue #398).
 */
export function createPanelLayoutSettingsView(
  restoreWorkspaceLayoutEnabled: boolean,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Panel layout';

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.textContent = 'Reset panel position';
  reset.addEventListener('click', () => dispatch({ name: 'settings/reset-panel-position' }));

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = 'Clears the saved position for this site and returns the panel to its default placement.';

  const restoreLabel = document.createElement('label');
  restoreLabel.className = 'image-trail-panel__settings-checkbox';
  const restoreInput = document.createElement('input');
  restoreInput.type = 'checkbox';
  restoreInput.checked = restoreWorkspaceLayoutEnabled;
  restoreInput.addEventListener('change', () =>
    dispatch({ name: 'settings/update-workspace-layout-restore', enabled: restoreInput.checked }),
  );
  const restoreText = document.createElement('span');
  restoreText.textContent = 'Restore workspace layout per site';
  restoreLabel.append(restoreInput, restoreText);

  const restoreMeta = document.createElement('p');
  restoreMeta.className = 'image-trail-panel__settings-empty';
  restoreMeta.textContent =
    'Saves which sections are detached, their window positions, and minimized state for each site, and restores that arrangement when the panel opens there again. Stores section names and geometry only.';

  const resetWorkspace = document.createElement('button');
  resetWorkspace.type = 'button';
  resetWorkspace.textContent = 'Reset workspace layout';
  resetWorkspace.addEventListener('click', () => dispatch({ name: 'settings/reset-workspace-layout' }));

  const resetWorkspaceMeta = document.createElement('p');
  resetWorkspaceMeta.className = 'image-trail-panel__settings-empty';
  resetWorkspaceMeta.textContent = 'Clears the saved workspace layout for this site and reattaches every detached section.';

  wrapper.append(heading, reset, meta, restoreLabel, restoreMeta, resetWorkspace, resetWorkspaceMeta);
  return wrapper;
}
