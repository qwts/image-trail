import type { PanelAction, PinSaveStoragePreference, RecentHistoryOverflowBehavior } from '../../core/types.js';
import type { GrabSourcePattern, UrlTemplateMatchMode, UrlTemplateRecord } from '../../core/url/templates.js';
import {
  defaultGrabStrategy,
  grabStrategyLabel,
  parseExtractorLines,
  serializeExtractorLines,
  type GrabStrategyKind,
} from '../../core/url/grab-strategies.js';
import type { UrlField } from '../../core/url/types.js';
import {
  NEIGHBOR_PRELOAD_CACHE_LIMITS,
  NEIGHBOR_PRELOAD_RADIUS_LIMITS,
  RECENT_HISTORY_LIMITS,
  REQUEST_THROTTLE_MAX_REQUESTS_LIMITS,
  REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS,
  REQUEST_THROTTLE_WINDOW_LIMITS,
  URL_REVIEW_STATUS_LIMITS,
  VISIBLE_BOOKMARK_SOFT_MAX_LIMITS,
} from '../../core/settings.js';

const MATCH_MODES: readonly { readonly value: UrlTemplateMatchMode; readonly label: string }[] = [
  { value: 'exact-page-shape', label: 'Exact page shape' },
  { value: 'same-path-query-shape', label: 'Same path/query shape' },
  { value: 'broad-site', label: 'Broad site match' },
];

const settingsGroupsOpen = new Map<string, boolean>();

function matchModeLabel(mode: UrlTemplateMatchMode): string {
  return MATCH_MODES.find((option) => option.value === mode)?.label ?? mode;
}

export function createSettingsView(
  visibleBookmarkSoftMax: number,
  recentHistoryState: {
    readonly limit: number;
    readonly overflowBehavior: RecentHistoryOverflowBehavior;
  },
  privacyModeEnabled: boolean,
  templates: readonly UrlTemplateRecord[],
  grabSourcePatterns: readonly GrabSourcePattern[],
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
  urlReviewStatusState: {
    readonly limit: number;
    readonly clearAfterExport: boolean;
  },
  requestThrottleState: {
    readonly minimumIntervalMs: number;
    readonly maxRequests: number;
    readonly windowMs: number;
  },
  neighborPreloadState: {
    readonly enabled: boolean;
    readonly radius: number;
    readonly cacheLimit: number;
  },
  utilityChildren: readonly HTMLElement[],
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section';

  const heading = document.createElement('h3');
  heading.textContent = 'Settings';

  section.append(
    heading,
    createSettingsGroup('Display', 'display', [
      createVisiblePinsSettingsView(visibleBookmarkSoftMax, dispatch),
      createRecentsSettingsView(recentHistoryState, dispatch),
    ]),
    createSettingsGroup('Privacy', 'privacy', [
      createPrivatePinSettingsView(privatePinState, dispatch),
      createPrivacySettingsView(privacyModeEnabled, dispatch),
    ]),
    createSettingsGroup('Automation', 'automation', [
      createRequestThrottleSettingsView(requestThrottleState, dispatch),
      createNeighborPreloadSettingsView(neighborPreloadState, dispatch),
      createUrlReviewStatusSettingsView(urlReviewStatusState, dispatch),
    ]),
    createSettingsGroup('Maintenance', 'maintenance', [
      createPanelLayoutSettingsView(dispatch),
      createDestructiveSettingsView(destructiveState, dispatch),
    ]),
    createSettingsGroup('URL learning', 'url-learning', [
      createTemplateSettingsView(templates, activeTemplateId, currentFields, dispatch),
      createGrabSourcePatternSettingsView(grabSourcePatterns, dispatch),
    ]),
    ...utilityChildren,
  );
  return section;
}

function createSettingsGroup(title: string, id: string, children: readonly HTMLElement[]): HTMLElement {
  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section';
  group.open = settingsGroupsOpen.get(id) ?? false;
  group.addEventListener('toggle', () => {
    settingsGroupsOpen.set(id, group.open);
  });

  const heading = document.createElement('h4');
  heading.textContent = title;

  const header = document.createElement('div');
  header.className = 'image-trail-panel__settings-utility-header';
  header.append(heading);

  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.append(header);

  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body';
  body.append(...children);

  group.append(summary, body);
  return group;
}

function createVisiblePinsSettingsView(visibleBookmarkSoftMax: number, dispatch: (action: PanelAction) => void): HTMLElement {
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

function createRequestThrottleSettingsView(
  state: {
    readonly minimumIntervalMs: number;
    readonly maxRequests: number;
    readonly windowMs: number;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Request throttle';

  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';

  const minimumInterval = createNumberSettingField(
    'Min interval',
    state.minimumIntervalMs,
    REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.min,
    REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.max,
  );
  const maxRequests = createNumberSettingField(
    'Max requests',
    state.maxRequests,
    REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.min,
    REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.max,
  );
  const windowMs = createNumberSettingField(
    'Window ms',
    state.windowMs,
    REQUEST_THROTTLE_WINDOW_LIMITS.min,
    REQUEST_THROTTLE_WINDOW_LIMITS.max,
  );

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const minimumIntervalMs = parseBoundedInteger(
      minimumInterval.input.value,
      REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.min,
      REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS.max,
    );
    const parsedMaxRequests = parseBoundedInteger(
      maxRequests.input.value,
      REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.min,
      REQUEST_THROTTLE_MAX_REQUESTS_LIMITS.max,
    );
    const parsedWindowMs = parseBoundedInteger(
      windowMs.input.value,
      REQUEST_THROTTLE_WINDOW_LIMITS.min,
      REQUEST_THROTTLE_WINDOW_LIMITS.max,
    );
    if (minimumIntervalMs === null || parsedMaxRequests === null || parsedWindowMs === null) return;
    dispatch({
      name: 'settings/update-request-throttle',
      minimumIntervalMs,
      maxRequests: parsedMaxRequests,
      windowMs: parsedWindowMs,
    });
  });

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = 'Active image loads are gated by both the minimum interval and the total request count in the configured window.';

  form.append(minimumInterval.label, maxRequests.label, windowMs.label, apply);
  wrapper.append(heading, form, meta);
  return wrapper;
}

function createNumberSettingField(
  labelText: string,
  value: number,
  min: number,
  max: number,
): { readonly label: HTMLLabelElement; readonly input: HTMLInputElement } {
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  const input = document.createElement('input');
  input.className = 'image-trail-panel__settings-number-input';
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.inputMode = 'numeric';
  label.append(text, input);
  return { label, input };
}

function parseBoundedInteger(value: string, min: number, max: number): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function createNeighborPreloadSettingsView(
  state: {
    readonly enabled: boolean;
    readonly radius: number;
    readonly cacheLimit: number;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Preload';

  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';

  const enabledLabel = document.createElement('label');
  enabledLabel.className = 'image-trail-panel__settings-checkbox';
  const enabledInput = document.createElement('input');
  enabledInput.type = 'checkbox';
  enabledInput.checked = state.enabled;
  const enabledText = document.createElement('span');
  enabledText.textContent = 'Warm adjacent parsed-field images';
  enabledLabel.append(enabledInput, enabledText);

  const radiusLabel = document.createElement('label');
  radiusLabel.className = 'image-trail-panel__settings-field';
  const radiusText = document.createElement('span');
  radiusText.textContent = 'Ahead/behind';
  const radiusInput = document.createElement('input');
  radiusInput.className = 'image-trail-panel__settings-number-input';
  radiusInput.type = 'number';
  radiusInput.min = String(NEIGHBOR_PRELOAD_RADIUS_LIMITS.min);
  radiusInput.max = String(NEIGHBOR_PRELOAD_RADIUS_LIMITS.max);
  radiusInput.step = '1';
  radiusInput.value = String(state.radius);
  radiusInput.inputMode = 'numeric';
  radiusLabel.append(radiusText, radiusInput);

  const cacheLimitLabel = document.createElement('label');
  cacheLimitLabel.className = 'image-trail-panel__settings-field';
  const cacheLimitText = document.createElement('span');
  cacheLimitText.textContent = 'Cache';
  const cacheLimitInput = document.createElement('input');
  cacheLimitInput.className = 'image-trail-panel__settings-number-input';
  cacheLimitInput.type = 'number';
  cacheLimitInput.min = String(NEIGHBOR_PRELOAD_CACHE_LIMITS.min);
  cacheLimitInput.max = String(NEIGHBOR_PRELOAD_CACHE_LIMITS.max);
  cacheLimitInput.step = '1';
  cacheLimitInput.value = String(state.cacheLimit);
  cacheLimitInput.inputMode = 'numeric';
  cacheLimitLabel.append(cacheLimitText, cacheLimitInput);

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';

  const manual = document.createElement('button');
  manual.type = 'button';
  manual.textContent = 'Preload more';

  const parsedRadius = (): number | null => {
    const radius = Number(radiusInput.value);
    if (!Number.isInteger(radius) || radius < NEIGHBOR_PRELOAD_RADIUS_LIMITS.min || radius > NEIGHBOR_PRELOAD_RADIUS_LIMITS.max) {
      return null;
    }
    return radius;
  };

  const parsedCacheLimit = (): number | null => {
    const cacheLimit = Number(cacheLimitInput.value);
    if (!Number.isInteger(cacheLimit) || cacheLimit < NEIGHBOR_PRELOAD_CACHE_LIMITS.min || cacheLimit > NEIGHBOR_PRELOAD_CACHE_LIMITS.max) {
      return null;
    }
    return cacheLimit;
  };

  const dispatchCurrent = (): void => {
    const radius = parsedRadius();
    const cacheLimit = parsedCacheLimit();
    if (radius === null || cacheLimit === null) return;
    dispatch({ name: 'settings/update-neighbor-preload', enabled: enabledInput.checked, radius, cacheLimit });
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dispatchCurrent();
  });
  enabledInput.addEventListener('change', () => {
    dispatch({
      name: 'settings/update-neighbor-preload',
      enabled: enabledInput.checked,
      radius: parsedRadius() ?? state.radius,
      cacheLimit: parsedCacheLimit() ?? state.cacheLimit,
    });
  });
  manual.addEventListener('click', () => {
    const radius = parsedRadius();
    const cacheLimit = parsedCacheLimit();
    if (radius === null || cacheLimit === null) return;
    enabledInput.checked = true;
    dispatch({ name: 'settings/update-neighbor-preload', enabled: true, radius, cacheLimit });
    dispatch({ name: 'neighbor-preload/manual', radius, cacheLimit });
  });

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Warms this many parsed-field URLs ahead and behind. Speculative loads stay in this page session only and never add Recents, URL review records, panel messages, pins, or Recall entries. Cache 0 keeps all entries without eviction.';

  form.append(enabledLabel, radiusLabel, cacheLimitLabel, apply, manual);
  wrapper.append(heading, form, meta);
  return wrapper;
}

function createUrlReviewStatusSettingsView(
  state: {
    readonly limit: number;
    readonly clearAfterExport: boolean;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'URL review status';

  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';

  const limitLabel = document.createElement('label');
  limitLabel.className = 'image-trail-panel__settings-field';
  const limitText = document.createElement('span');
  limitText.textContent = 'Max records per site';
  const limitInput = document.createElement('input');
  limitInput.className = 'image-trail-panel__settings-number-input';
  limitInput.type = 'number';
  limitInput.min = String(URL_REVIEW_STATUS_LIMITS.min);
  limitInput.max = String(URL_REVIEW_STATUS_LIMITS.max);
  limitInput.step = '1';
  limitInput.value = String(state.limit);
  limitInput.inputMode = 'numeric';
  limitLabel.append(limitText, limitInput);

  const clearLabel = document.createElement('label');
  clearLabel.className = 'image-trail-panel__settings-checkbox';
  const clearInput = document.createElement('input');
  clearInput.type = 'checkbox';
  clearInput.checked = state.clearAfterExport;
  const clearText = document.createElement('span');
  clearText.textContent = 'Clear current-site review status after export';
  clearLabel.append(clearInput, clearText);

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const limit = Number(limitInput.value);
    if (!Number.isInteger(limit)) return;
    dispatch({ name: 'settings/update-url-review-status-retention', limit, clearAfterExport: clearInput.checked });
  });

  clearInput.addEventListener('change', () => {
    const limit = Number(limitInput.value);
    if (!Number.isInteger(limit)) return;
    dispatch({ name: 'settings/update-url-review-status-retention', limit, clearAfterExport: clearInput.checked });
  });

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Oldest URL review records fall off per site when the cap is exceeded. This never clears recents, pins, Recall, downloads, thumbnails, or originals.';

  form.append(limitLabel, clearLabel, apply);
  wrapper.append(heading, form, meta);
  return wrapper;
}

function createRecentsSettingsView(
  state: {
    readonly limit: number;
    readonly overflowBehavior: RecentHistoryOverflowBehavior;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Recents';

  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';

  const limitLabel = document.createElement('label');
  limitLabel.className = 'image-trail-panel__settings-field';
  const limitText = document.createElement('span');
  limitText.textContent = 'Visible recents';
  const limitInput = document.createElement('input');
  limitInput.className = 'image-trail-panel__settings-number-input';
  limitInput.type = 'number';
  limitInput.min = String(RECENT_HISTORY_LIMITS.min);
  limitInput.max = String(RECENT_HISTORY_LIMITS.max);
  limitInput.step = '1';
  limitInput.value = String(state.limit);
  limitInput.inputMode = 'numeric';
  limitLabel.append(limitText, limitInput);

  const overflowLabel = document.createElement('label');
  overflowLabel.className = 'image-trail-panel__settings-field';
  const overflowText = document.createElement('span');
  overflowText.textContent = 'Overflow';
  const overflowSelect = document.createElement('select');
  overflowSelect.className = 'image-trail-panel__settings-select';
  overflowSelect.append(
    createOption('drop-oldest', 'Drop oldest', state.overflowBehavior),
    createOption('keep-session', 'Keep hidden this session', state.overflowBehavior),
  );
  overflowLabel.append(overflowText, overflowSelect);

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';

  const showHidden = document.createElement('button');
  showHidden.type = 'button';
  showHidden.textContent = 'Show hidden recents';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const limit = Number(limitInput.value);
    const overflowBehavior = recentHistoryOverflowBehaviorFrom(overflowSelect.value);
    if (!Number.isInteger(limit) || !overflowBehavior) return;
    dispatch({ name: 'settings/update-recent-history-retention', limit, overflowBehavior });
  });
  showHidden.addEventListener('click', () => {
    limitInput.value = String(RECENT_HISTORY_LIMITS.max);
    overflowSelect.value = 'keep-session';
    dispatch({
      name: 'settings/update-recent-history-retention',
      limit: RECENT_HISTORY_LIMITS.max,
      overflowBehavior: 'keep-session',
    });
  });

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = 'Recents stay transient. Overflow can be dropped or hidden only for the current extension session.';

  form.append(limitLabel, overflowLabel, apply, showHidden);
  wrapper.append(heading, form, meta);
  return wrapper;
}

function createOption(
  value: RecentHistoryOverflowBehavior,
  label: string,
  selectedValue: RecentHistoryOverflowBehavior,
): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  option.selected = value === selectedValue;
  return option;
}

function recentHistoryOverflowBehaviorFrom(value: string): RecentHistoryOverflowBehavior | null {
  return value === 'drop-oldest' || value === 'keep-session' ? value : null;
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

function createPanelLayoutSettingsView(dispatch: (action: PanelAction) => void): HTMLElement {
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

  wrapper.append(heading, reset, meta);
  return wrapper;
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
  meta.textContent = `${template.fields.length} included field${template.fields.length === 1 ? '' : 's'} · ${matchModeLabel(template.matchRules.mode)} · ${grabStrategyLabel(template.grabStrategy)} grab · used ${template.useCount} time${template.useCount === 1 ? '' : 's'}${template.autoApplyEnabled === false ? ' · auto-apply off' : ''}${active ? ' · active' : ''}`;

  const controls = document.createElement('div');
  controls.className = 'image-trail-panel__settings-template-controls';

  const modeLabel = document.createElement('label');
  modeLabel.className = 'image-trail-panel__settings-field';
  modeLabel.classList.add('image-trail-panel__settings-template-match');
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

  const autoApplyLabel = document.createElement('label');
  autoApplyLabel.className = 'image-trail-panel__settings-checkbox';
  const autoApply = document.createElement('input');
  autoApply.type = 'checkbox';
  autoApply.checked = template.autoApplyEnabled !== false;
  autoApply.addEventListener('change', () => {
    dispatch({ name: 'url-template/update-settings', id: template.id, autoApplyEnabled: autoApply.checked });
  });
  const autoApplyText = document.createElement('span');
  autoApplyText.textContent = 'Auto-apply';
  autoApplyLabel.append(autoApply, autoApplyText);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'image-trail-panel__settings-template-clear';
  clear.textContent = 'Clear';
  clear.addEventListener('click', () => dispatch({ name: 'url-template/remove', id: template.id }));

  controls.append(modeLabel, autoApplyLabel, hiddenLabel, clear);
  item.append(url, meta, controls);
  item.append(createTemplateGrabStrategyControls(template, dispatch));
  if (active && currentFields.length > 0) {
    item.append(createTemplateFieldControls(template, currentFields, dispatch));
  }
  return item;
}

function createTemplateGrabStrategyControls(template: UrlTemplateRecord, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-template-fields';

  const strategyLabel = document.createElement('label');
  strategyLabel.className = 'image-trail-panel__settings-field';
  const strategyText = document.createElement('span');
  strategyText.textContent = 'Grab strategy';
  const strategy = document.createElement('select');
  strategy.className = 'image-trail-panel__settings-select';
  const currentKind = template.grabStrategy?.kind ?? 'clicked-image';
  for (const option of [
    { value: 'clicked-image', label: 'Clicked image' },
    { value: 'linked-page-image', label: 'Linked page image' },
  ] satisfies readonly { readonly value: GrabStrategyKind; readonly label: string }[]) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = currentKind === option.value;
    strategy.append(element);
  }
  strategy.addEventListener('change', () => {
    dispatch({
      name: 'url-template/update-settings',
      id: template.id,
      grabStrategy: defaultGrabStrategy(strategy.value as GrabStrategyKind),
    });
  });
  strategyLabel.append(strategyText, strategy);
  wrapper.append(strategyLabel);

  const linkedStrategy = template.grabStrategy?.kind === 'linked-page-image' ? template.grabStrategy : null;
  if (linkedStrategy) {
    const extractorsLabel = document.createElement('label');
    extractorsLabel.className = 'image-trail-panel__settings-field';
    const extractorsText = document.createElement('span');
    extractorsText.textContent = 'Image extractors';
    const extractors = document.createElement('textarea');
    extractors.className = 'image-trail-panel__settings-template-extractors';
    extractors.rows = 4;
    extractors.value = serializeExtractorLines(linkedStrategy.extractors);
    extractors.addEventListener('change', () => {
      dispatch({
        name: 'url-template/update-settings',
        id: template.id,
        grabStrategy: { ...linkedStrategy, extractors: parseExtractorLines(extractors.value) },
      });
    });
    extractorsLabel.append(extractorsText, extractors);
    wrapper.append(extractorsLabel);
  }
  return wrapper;
}

function createGrabSourcePatternSettingsView(patterns: readonly GrabSourcePattern[], dispatch: (action: PanelAction) => void): HTMLElement {
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
  for (const pattern of patterns) {
    list.append(createGrabSourcePatternItem(pattern, dispatch));
  }
  wrapper.append(list);

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

  const modeLabel = document.createElement('label');
  modeLabel.className = 'image-trail-panel__settings-field';
  modeLabel.classList.add('image-trail-panel__settings-template-match');
  const modeText = document.createElement('span');
  modeText.textContent = 'Match';
  const mode = document.createElement('select');
  mode.className = 'image-trail-panel__settings-select';
  for (const option of MATCH_MODES) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = pattern.matchRules.mode === option.value;
    mode.append(element);
  }
  mode.addEventListener('change', () => {
    dispatch({ name: 'grab-source-pattern/update-settings', id: pattern.id, matchMode: mode.value as UrlTemplateMatchMode });
  });
  modeLabel.append(modeText, mode);

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'image-trail-panel__settings-template-clear';
  remove.textContent = 'Clear';
  remove.addEventListener('click', () => dispatch({ name: 'grab-source-pattern/remove', id: pattern.id }));

  controls.append(modeLabel, remove);
  item.append(url, meta, controls, createGrabSourcePatternStrategyControls(pattern, dispatch));
  return item;
}

function createGrabSourcePatternStrategyControls(pattern: GrabSourcePattern, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-template-fields';

  const strategyLabel = document.createElement('label');
  strategyLabel.className = 'image-trail-panel__settings-field';
  const strategyText = document.createElement('span');
  strategyText.textContent = 'Grab strategy';
  const strategy = document.createElement('select');
  strategy.className = 'image-trail-panel__settings-select';
  const currentKind = pattern.grabStrategy?.kind ?? 'clicked-image';
  for (const option of [
    { value: 'clicked-image', label: 'Clicked image' },
    { value: 'linked-page-image', label: 'Linked page image' },
  ] satisfies readonly { readonly value: GrabStrategyKind; readonly label: string }[]) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = currentKind === option.value;
    strategy.append(element);
  }
  strategy.addEventListener('change', () => {
    dispatch({
      name: 'grab-source-pattern/update-settings',
      id: pattern.id,
      grabStrategy: defaultGrabStrategy(strategy.value as GrabStrategyKind),
    });
  });
  strategyLabel.append(strategyText, strategy);
  wrapper.append(strategyLabel);

  const linkedStrategy = pattern.grabStrategy?.kind === 'linked-page-image' ? pattern.grabStrategy : null;
  if (linkedStrategy) {
    const extractorsLabel = document.createElement('label');
    extractorsLabel.className = 'image-trail-panel__settings-field';
    const extractorsText = document.createElement('span');
    extractorsText.textContent = 'Image extractors';
    const extractors = document.createElement('textarea');
    extractors.className = 'image-trail-panel__settings-template-extractors';
    extractors.rows = 4;
    extractors.value = serializeExtractorLines(linkedStrategy.extractors);
    extractors.addEventListener('change', () => {
      dispatch({
        name: 'grab-source-pattern/update-settings',
        id: pattern.id,
        grabStrategy: { ...linkedStrategy, extractors: parseExtractorLines(extractors.value) },
      });
    });
    extractorsLabel.append(extractorsText, extractors);
    wrapper.append(extractorsLabel);
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
