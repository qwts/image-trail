import {
  isSiteCaptureBehavior,
  normalizeSiteCaptureHostname,
  type SiteCaptureBehavior,
  type SiteCaptureRules,
} from '../../core/site-capture-rules.js';
import type { PanelAction } from '../../core/types.js';

export interface SiteCaptureRulesSettingsState {
  readonly rules: SiteCaptureRules;
  readonly currentHostname: string | null;
  readonly privacyModeEnabled: boolean;
}

export function createSiteCaptureRulesSettingsView(
  state: SiteCaptureRulesSettingsState,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';
  const heading = document.createElement('h4');
  heading.textContent = 'Per-site Grab behavior';
  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Default: Pin metadata only. Capture rules apply only after an explicit Grab click and keep encrypted original bytes separate.';
  wrapper.append(heading, meta);

  const currentHostname = normalizeSiteCaptureHostname(state.currentHostname);
  if (currentHostname) {
    wrapper.append(
      createRuleField(
        state.privacyModeEnabled ? 'Current site' : currentHostname,
        currentHostname,
        state.rules[currentHostname] ?? null,
        dispatch,
        true,
      ),
    );
  }
  Object.entries(state.rules)
    .sort(([left], [right]) => left.localeCompare(right))
    .filter(([hostname]) => hostname !== currentHostname)
    .forEach(([hostname, behavior], index) => {
      wrapper.append(createRuleField(state.privacyModeEnabled ? `Saved site ${index + 1}` : hostname, hostname, behavior, dispatch, false));
    });
  return wrapper;
}

function createRuleField(
  labelText: string,
  hostname: string,
  behavior: SiteCaptureBehavior | null,
  dispatch: (action: PanelAction) => void,
  includeDefault: boolean,
): HTMLElement {
  const field = document.createElement('label');
  field.className = 'image-trail-panel__settings-field';
  const label = document.createElement('span');
  label.textContent = labelText;
  const select = document.createElement('select');
  select.className = 'image-trail-panel__settings-select';
  if (includeDefault) select.append(option('', 'Use conservative default', behavior === null));
  select.append(
    option('pin-only', 'Pin metadata only', behavior === 'pin-only'),
    option('capture-original', 'Pin + capture original', behavior === 'capture-original'),
  );
  select.addEventListener('change', () => {
    const next = select.value === '' ? null : isSiteCaptureBehavior(select.value) ? select.value : undefined;
    if (next === undefined) return;
    dispatch({ name: 'settings/update-site-capture-rule', hostname, behavior: next });
  });
  field.append(label, select);
  if (!includeDefault) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => dispatch({ name: 'settings/update-site-capture-rule', hostname, behavior: null }));
    field.append(remove);
  }
  return field;
}

function option(value: string, label: string, selected: boolean): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  element.selected = selected;
  return element;
}
