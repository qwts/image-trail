import type { PanelAction } from '../../core/types.js';
import type { UrlTemplateMatchMode, UrlTemplateRecord } from '../../core/url/templates.js';
import { VISIBLE_BOOKMARK_SOFT_MAX_LIMITS } from '../../core/settings.js';

const MATCH_MODES: readonly { readonly value: UrlTemplateMatchMode; readonly label: string }[] = [
  { value: 'exact-page-shape', label: 'Exact page shape' },
  { value: 'same-path-query-shape', label: 'Same path/query shape' },
  { value: 'broad-site', label: 'Broad site match' },
];

export function createSettingsView(
  visibleBookmarkSoftMax: number,
  templates: readonly UrlTemplateRecord[],
  activeTemplateId: string | null,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Settings';

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
  section.append(heading, form, createTemplateSettingsView(templates, activeTemplateId, dispatch));
  return section;
}

function createTemplateSettingsView(
  templates: readonly UrlTemplateRecord[],
  activeTemplateId: string | null,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'URL templates';
  wrapper.append(heading);

  if (templates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'image-trail-panel__settings-empty';
    empty.textContent = 'No learned templates for this site yet.';
    wrapper.append(empty);
    return wrapper;
  }

  const list = document.createElement('ul');
  list.className = 'image-trail-panel__settings-template-list';
  for (const template of templates) {
    list.append(createTemplateItem(template, template.id === activeTemplateId, dispatch));
  }
  wrapper.append(list);
  return wrapper;
}

function createTemplateItem(template: UrlTemplateRecord, active: boolean, dispatch: (action: PanelAction) => void): HTMLElement {
  const item = document.createElement('li');
  item.className = active ? 'is-active' : '';

  const url = document.createElement('code');
  url.className = 'image-trail-panel__settings-template-url';
  url.textContent = template.templateUrl;
  url.title = template.templateUrl;

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-template-meta';
  meta.textContent = `${template.fields.length} included field${template.fields.length === 1 ? '' : 's'} · used ${template.useCount} time${template.useCount === 1 ? '' : 's'}${active ? ' · active' : ''}`;

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__settings-template-controls';

  const modeLabel = document.createElement('label');
  modeLabel.className = 'image-trail-panel__settings-field';
  const modeText = document.createElement('span');
  modeText.textContent = 'Match';
  const mode = document.createElement('select');
  mode.className = 'image-trail-panel__settings-select';
  for (const option of MATCH_MODES) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = template.matchRules.mode === option.value;
    mode.append(element);
  }
  mode.addEventListener('change', () => {
    dispatch({ name: 'url-template/update-settings', id: template.id, matchMode: mode.value as UrlTemplateMatchMode });
  });
  modeLabel.append(modeText, mode);

  const hiddenLabel = document.createElement('label');
  hiddenLabel.className = 'image-trail-panel__settings-checkbox';
  const hidden = document.createElement('input');
  hidden.type = 'checkbox';
  hidden.checked = template.hideExcludedFields;
  hidden.addEventListener('change', () => {
    dispatch({ name: 'url-template/update-settings', id: template.id, hideExcludedFields: hidden.checked });
  });
  const hiddenText = document.createElement('span');
  hiddenText.textContent = 'Hide excluded fields';
  hiddenLabel.append(hidden, hiddenText);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => dispatch({ name: 'url-template/remove', id: template.id }));

  controls.append(modeLabel, hiddenLabel, clear);
  item.append(url, meta, controls);
  return item;
}
