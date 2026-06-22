import type { PanelAction, PinSaveStoragePreference } from '../../core/types.js';
import type { UrlTemplateMatchMode, UrlTemplateRecord } from '../../core/url/templates.js';
import type { UrlField } from '../../core/url/types.js';
import { VISIBLE_BOOKMARK_SOFT_MAX_LIMITS } from '../../core/settings.js';

const MATCH_MODES: readonly { readonly value: UrlTemplateMatchMode; readonly label: string }[] = [
  { value: 'exact-page-shape', label: 'Exact page shape' },
  { value: 'same-path-query-shape', label: 'Same path/query shape' },
  { value: 'broad-site', label: 'Broad site match' },
];

export function createSettingsView(
  visibleBookmarkSoftMax: number,
  privacyModeEnabled: boolean,
  templates: readonly UrlTemplateRecord[],
  activeTemplateId: string | null,
  currentFields: readonly UrlField[],
  privatePinState: {
    readonly pinSaveStoragePreference: PinSaveStoragePreference;
    readonly blobKeyUnlocked: boolean;
    readonly blobKeyAvailable: boolean;
  },
  destructiveState: {
    readonly visibleQueueCount: number;
    readonly recallCount: number;
    readonly busy: boolean;
  },
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
  section.append(
    heading,
    form,
    createPrivatePinSettingsView(privatePinState, dispatch),
    createPrivacySettingsView(privacyModeEnabled, dispatch),
    createDestructiveSettingsView(destructiveState, dispatch),
    createTemplateSettingsView(templates, activeTemplateId, currentFields, dispatch),
  );
  return section;
}

function createPrivatePinSettingsView(
  state: {
    readonly pinSaveStoragePreference: PinSaveStoragePreference;
    readonly blobKeyUnlocked: boolean;
    readonly blobKeyAvailable: boolean;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Private pins';

  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state.pinSaveStoragePreference === 'encrypted';
  input.addEventListener('change', () => {
    dispatch({ name: 'settings/update-pin-save-storage-preference', value: input.checked ? 'encrypted' : 'plaintext' });
  });
  const text = document.createElement('span');
  text.textContent = 'Prefer encrypted pin saves';
  label.append(input, text);

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = privatePinSettingsMessage(state);

  wrapper.append(heading, label, meta);
  return wrapper;
}

function createPrivacySettingsView(privacyModeEnabled: boolean, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Privacy';

  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-checkbox';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = privacyModeEnabled;
  input.addEventListener('change', () => dispatch({ name: 'settings/update-privacy-mode', enabled: input.checked }));

  const text = document.createElement('span');
  text.textContent = 'Privacy mode';

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = 'Masks panel rows and visible URLs for screen sharing without changing saved records or actions.';

  label.append(input, text);
  wrapper.append(heading, label, meta);
  return wrapper;
}

function privatePinSettingsMessage(state: {
  readonly pinSaveStoragePreference: PinSaveStoragePreference;
  readonly blobKeyUnlocked: boolean;
  readonly blobKeyAvailable: boolean;
}): string {
  if (state.pinSaveStoragePreference === 'plaintext') return 'New pins save plaintext by current storage setting.';
  if (state.blobKeyUnlocked) return 'New pins save encrypted while encrypted storage is unlocked.';
  if (state.blobKeyAvailable) return 'New pins save plaintext until encrypted storage is unlocked.';
  return 'New pins save plaintext until encrypted storage is set up.';
}

function createDestructiveSettingsView(
  state: {
    readonly visibleQueueCount: number;
    readonly recallCount: number;
    readonly busy: boolean;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Delete pins';

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Deletion removes durable pin records and linked originals. Clear actions outside Settings only hide rows temporarily.';

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__settings-template-controls';

  actions.append(
    createDangerButton(`Delete current queue (${state.visibleQueueCount})`, state.busy || state.visibleQueueCount === 0, () =>
      dispatch({ name: 'bookmarks/delete-visible' }),
    ),
    createDangerButton(`Delete Recall items (${state.recallCount})`, state.busy || state.recallCount === 0, () =>
      dispatch({ name: 'recall/delete-all' }),
    ),
  );

  wrapper.append(heading, meta, actions);
  return wrapper;
}

function createDangerButton(label: string, disabled: boolean, onConfirm: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.className = 'is-danger';
  button.addEventListener('click', () => {
    if (button.dataset.confirm === 'true') {
      onConfirm();
      button.dataset.confirm = 'false';
      button.textContent = label;
      return;
    }
    button.dataset.confirm = 'true';
    button.textContent = `Confirm ${label}`;
  });
  button.addEventListener('blur', () => {
    button.dataset.confirm = 'false';
    button.textContent = label;
  });
  return button;
}

function createTemplateSettingsView(
  templates: readonly UrlTemplateRecord[],
  activeTemplateId: string | null,
  currentFields: readonly UrlField[],
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
    list.append(createTemplateItem(template, template.id === activeTemplateId, currentFields, dispatch));
  }
  wrapper.append(list);
  return wrapper;
}

function createTemplateItem(
  template: UrlTemplateRecord,
  active: boolean,
  currentFields: readonly UrlField[],
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const item = document.createElement('li');
  item.className = active ? 'is-active' : '';

  const url = document.createElement('code');
  url.className = 'image-trail-panel__settings-template-url';
  url.textContent = template.templateUrl;
  url.title = template.templateUrl;

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-template-meta';
  const includedLabels = template.fields.map((field) => field.label).join(', ');
  meta.textContent = `${template.fields.length} included field${template.fields.length === 1 ? '' : 's'}${includedLabels ? `: ${includedLabels}` : ''} · used ${template.useCount} time${template.useCount === 1 ? '' : 's'}${active ? ' · active' : ''}`;

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
  if (active && currentFields.length > 0) {
    item.append(createTemplateFieldControls(template, currentFields, dispatch));
  }
  return item;
}

function createTemplateFieldControls(
  template: UrlTemplateRecord,
  currentFields: readonly UrlField[],
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-template-fields';

  const title = document.createElement('span');
  title.className = 'image-trail-panel__settings-template-meta';
  title.textContent = 'Included fields';
  wrapper.append(title);

  const included = new Set(template.fields.map((field) => field.id));
  for (const field of currentFields.filter((candidate) => candidate.tokenKind === 'int' || candidate.tokenKind === 'hex')) {
    const label = document.createElement('label');
    label.className = 'image-trail-panel__settings-checkbox';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = included.has(field.id);
    input.dataset.templateFieldId = field.id;
    input.addEventListener('change', () => {
      const next = Array.from(wrapper.querySelectorAll<HTMLInputElement>('input[data-template-field-id]'))
        .filter((candidate) => candidate.checked)
        .map((candidate) => candidate.dataset.templateFieldId)
        .filter((fieldId): fieldId is string => fieldId !== undefined);
      dispatch({ name: 'url-template/update-fields', id: template.id, includedFieldIds: next });
    });

    const text = document.createElement('span');
    text.textContent = field.label;
    label.append(input, text);
    wrapper.append(label);
  }

  return wrapper;
}
