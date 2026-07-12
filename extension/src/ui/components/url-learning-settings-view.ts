import {
  defaultGrabStrategy,
  grabStrategyLabel,
  parseExtractorLines,
  serializeExtractorLines,
  type GrabStrategyKind,
} from '../../core/url/grab-strategies.js';
import type { GrabSourcePattern, UrlTemplateMatchMode, UrlTemplateRecord } from '../../core/url/templates.js';
import type { UrlField } from '../../core/url/types.js';
import type { PanelAction } from '../../core/types.js';

const MATCH_MODES: readonly { readonly value: UrlTemplateMatchMode; readonly label: string }[] = [
  { value: 'exact-page-shape', label: 'Exact page shape' },
  { value: 'same-path-query-shape', label: 'Same path/query shape' },
  { value: 'broad-site', label: 'Broad site match' },
];

export function createTemplateSettingsView(
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

export function createGrabSourcePatternSettingsView(
  patterns: readonly GrabSourcePattern[],
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';
  const heading = document.createElement('h4');
  heading.textContent = 'Grab patterns';
  wrapper.append(heading);
  if (patterns.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'image-trail-panel__settings-empty';
    empty.textContent = 'Cmd-click an image or link to learn a grab pattern for this site.';
    wrapper.append(empty);
    return wrapper;
  }
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__settings-template-list';
  for (const pattern of patterns) list.append(createGrabSourcePatternItem(pattern, dispatch));
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
  meta.textContent = `${template.fields.length} included field${template.fields.length === 1 ? '' : 's'} · ${matchModeLabel(template.matchRules.mode)} · ${grabStrategyLabel(template.grabStrategy)} grab · used ${template.useCount} time${template.useCount === 1 ? '' : 's'}${template.autoApplyEnabled === false ? ' · auto-apply off' : ''}${active ? ' · active' : ''}`;
  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__settings-template-controls';
  const mode = createMatchModeField(template.matchRules.mode);
  mode.select.addEventListener('change', () => {
    dispatch({ name: 'url-template/update-settings', id: template.id, matchMode: mode.select.value as UrlTemplateMatchMode });
  });
  const autoApply = createCheckbox('Auto-apply', template.autoApplyEnabled !== false, (checked) => {
    dispatch({ name: 'url-template/update-settings', id: template.id, autoApplyEnabled: checked });
  });
  const hidden = createCheckbox('Hide excluded fields', template.hideExcludedFields, (checked) => {
    dispatch({ name: 'url-template/update-settings', id: template.id, hideExcludedFields: checked });
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'image-trail-panel__settings-template-clear';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => dispatch({ name: 'url-template/remove', id: template.id }));
  controls.append(mode.label, autoApply, hidden, clear);
  item.append(url, meta, controls, createTemplateGrabStrategyControls(template, dispatch));
  if (active && currentFields.length > 0) item.append(createTemplateFieldControls(template, currentFields, dispatch));
  return item;
}

function createTemplateGrabStrategyControls(template: UrlTemplateRecord, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-template-fields';
  const strategy = createGrabStrategyField(template.grabStrategy?.kind ?? 'clicked-image');
  strategy.select.addEventListener('change', () => {
    dispatch({
      name: 'url-template/update-settings',
      id: template.id,
      grabStrategy: defaultGrabStrategy(strategy.select.value as GrabStrategyKind),
    });
  });
  wrapper.append(strategy.label);
  const linkedStrategy = template.grabStrategy?.kind === 'linked-page-image' ? template.grabStrategy : null;
  if (linkedStrategy) {
    const extractors = createExtractorField(serializeExtractorLines(linkedStrategy.extractors));
    extractors.textarea.addEventListener('change', () => {
      dispatch({
        name: 'url-template/update-settings',
        id: template.id,
        grabStrategy: { ...linkedStrategy, extractors: parseExtractorLines(extractors.textarea.value) },
      });
    });
    wrapper.append(extractors.label);
  }
  return wrapper;
}

function createGrabSourcePatternItem(pattern: GrabSourcePattern, dispatch: (action: PanelAction) => void): HTMLElement {
  const item = document.createElement('li');
  const url = document.createElement('code');
  url.className = 'image-trail-panel__settings-template-url';
  url.textContent = pattern.patternUrl;
  url.title = pattern.patternUrl;
  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-template-meta';
  meta.textContent = `${matchModeLabel(pattern.matchRules.mode)} · ${grabStrategyLabel(pattern.grabStrategy)} grab · used ${pattern.useCount} time${pattern.useCount === 1 ? '' : 's'}`;
  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__settings-template-controls';
  const mode = createMatchModeField(pattern.matchRules.mode);
  mode.select.addEventListener('change', () => {
    dispatch({ name: 'grab-source-pattern/update-settings', id: pattern.id, matchMode: mode.select.value as UrlTemplateMatchMode });
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'image-trail-panel__settings-template-clear';
  remove.textContent = 'Clear';
  remove.addEventListener('click', () => dispatch({ name: 'grab-source-pattern/remove', id: pattern.id }));
  controls.append(mode.label, remove);
  item.append(url, meta, controls, createGrabSourcePatternStrategyControls(pattern, dispatch));
  return item;
}

function createGrabSourcePatternStrategyControls(pattern: GrabSourcePattern, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-template-fields';
  const strategy = createGrabStrategyField(pattern.grabStrategy?.kind ?? 'clicked-image');
  strategy.select.addEventListener('change', () => {
    dispatch({
      name: 'grab-source-pattern/update-settings',
      id: pattern.id,
      grabStrategy: defaultGrabStrategy(strategy.select.value as GrabStrategyKind),
    });
  });
  wrapper.append(strategy.label);
  const linkedStrategy = pattern.grabStrategy?.kind === 'linked-page-image' ? pattern.grabStrategy : null;
  if (linkedStrategy) {
    const extractors = createExtractorField(serializeExtractorLines(linkedStrategy.extractors));
    extractors.textarea.addEventListener('change', () => {
      dispatch({
        name: 'grab-source-pattern/update-settings',
        id: pattern.id,
        grabStrategy: { ...linkedStrategy, extractors: parseExtractorLines(extractors.textarea.value) },
      });
    });
    wrapper.append(extractors.label);
  }
  return wrapper;
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
    const label = createCheckbox(field.label, included.has(field.id), () => {
      const next = Array.from(wrapper.querySelectorAll<HTMLInputElement>('input[data-template-field-id]'))
        .filter((candidate) => candidate.checked)
        .map((candidate) => candidate.dataset['templateFieldId'])
        .filter((fieldId): fieldId is string => fieldId !== undefined);
      dispatch({ name: 'url-template/update-fields', id: template.id, includedFieldIds: next });
    });
    const input = label.querySelector('input');
    if (input) input.dataset['templateFieldId'] = field.id;
    wrapper.append(label);
  }
  return wrapper;
}

function createMatchModeField(mode: UrlTemplateMatchMode): { readonly label: HTMLLabelElement; readonly select: HTMLSelectElement } {
  const select = document.createElement('select');
  select.className = 'image-trail-panel__settings-select';
  for (const option of MATCH_MODES) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = mode === option.value;
    select.append(element);
  }
  const label = createField('Match', select);
  label.classList.add('image-trail-panel__settings-template-match');
  return { label, select };
}

function createGrabStrategyField(kind: GrabStrategyKind): { readonly label: HTMLLabelElement; readonly select: HTMLSelectElement } {
  const select = document.createElement('select');
  select.className = 'image-trail-panel__settings-select';
  for (const option of [
    { value: 'clicked-image' as const, label: 'Clicked image' },
    { value: 'linked-page-image' as const, label: 'Linked page image' },
  ]) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = kind === option.value;
    select.append(element);
  }
  return { label: createField('Grab strategy', select), select };
}

function createExtractorField(value: string): { readonly label: HTMLLabelElement; readonly textarea: HTMLTextAreaElement } {
  const textarea = document.createElement('textarea');
  textarea.className = 'image-trail-panel__settings-template-extractors';
  textarea.rows = 4;
  textarea.value = value;
  return { label: createField('Image extractors', textarea), textarea };
}

function createField(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function createCheckbox(labelText: string, checked: boolean, onChange: (checked: boolean) => void): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => onChange(input.checked));
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(input, text);
  return label;
}

function matchModeLabel(mode: UrlTemplateMatchMode): string {
  return MATCH_MODES.find((option) => option.value === mode)?.label ?? mode;
}
