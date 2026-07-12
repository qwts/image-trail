import { VISIBLE_BOOKMARK_SOFT_MAX_LIMITS } from '../../core/settings.js';
import type { PanelAction } from '../../core/types.js';

export function createVisiblePinsSettingsView(visibleBookmarkSoftMax: number, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Pins';
  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-field';
  const labelText = document.createElement('span');
  labelText.textContent = 'Visible pins';
  const input = document.createElement('input');
  input.className = 'image-trail-panel__settings-number-input';
  input.type = 'number';
  input.min = String(VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.min);
  input.max = String(VISIBLE_BOOKMARK_SOFT_MAX_LIMITS.max);
  input.step = '1';
  input.value = String(visibleBookmarkSoftMax);
  input.inputMode = 'numeric';
  label.append(labelText, input);

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number(input.value);
    if (!Number.isInteger(value)) return;
    dispatch({ name: 'settings/update-visible-bookmark-soft-max', value });
  });

  form.append(label, apply);
  wrapper.append(heading, form);
  return wrapper;
}
