import type { ImageProbeMethod } from '../../core/image/request-policy.js';
import { isLoadFailureFeedback, type LoadFailureFeedback } from '../../core/settings.js';
import {
  NEIGHBOR_PRELOAD_CACHE_LIMITS,
  NEIGHBOR_PRELOAD_RADIUS_LIMITS,
  REQUEST_THROTTLE_MAX_REQUESTS_LIMITS,
  REQUEST_THROTTLE_MINIMUM_INTERVAL_LIMITS,
  REQUEST_THROTTLE_WINDOW_LIMITS,
  URL_REVIEW_STATUS_LIMITS,
} from '../../core/settings.js';
import type { PanelAction } from '../../core/types.js';

export interface RequestThrottleSettingsState {
  readonly minimumIntervalMs: number;
  readonly maxRequests: number;
  readonly windowMs: number;
}

export interface NeighborPreloadSettingsState {
  readonly enabled: boolean;
  readonly radius: number;
  readonly cacheLimit: number;
  readonly probeMethod: ImageProbeMethod;
  readonly feedback: LoadFailureFeedback;
}

export interface UrlReviewStatusSettingsState {
  readonly limit: number;
  readonly clearAfterExport: boolean;
}

export function createRequestThrottleSettingsView(
  state: RequestThrottleSettingsState,
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

export function createNeighborPreloadSettingsView(
  state: NeighborPreloadSettingsState,
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

  const radius = createNumberSettingField(
    'Ahead/behind',
    state.radius,
    NEIGHBOR_PRELOAD_RADIUS_LIMITS.min,
    NEIGHBOR_PRELOAD_RADIUS_LIMITS.max,
  );
  const cacheLimit = createNumberSettingField(
    'Cache',
    state.cacheLimit,
    NEIGHBOR_PRELOAD_CACHE_LIMITS.min,
    NEIGHBOR_PRELOAD_CACHE_LIMITS.max,
  );
  const probeMethodSelect = createSelect(
    [
      { value: 'get', label: 'GET' },
      { value: 'head', label: 'HEAD' },
    ],
    state.probeMethod,
  );
  const feedbackSelect = createSelect(
    [
      { value: 'alert', label: 'Alert' },
      { value: 'display', label: 'Display' },
      { value: 'mute', label: 'Mute' },
    ],
    state.feedback,
  );
  const parsedFeedback = (): LoadFailureFeedback => (isLoadFailureFeedback(feedbackSelect.value) ? feedbackSelect.value : state.feedback);
  const parsedRadius = (): number | null =>
    parseBoundedInteger(radius.input.value, NEIGHBOR_PRELOAD_RADIUS_LIMITS.min, NEIGHBOR_PRELOAD_RADIUS_LIMITS.max);
  const parsedCacheLimit = (): number | null =>
    parseBoundedInteger(cacheLimit.input.value, NEIGHBOR_PRELOAD_CACHE_LIMITS.min, NEIGHBOR_PRELOAD_CACHE_LIMITS.max);
  const currentAction = (fallbackInvalid: boolean): PanelAction | null => {
    const parsedRadiusValue = parsedRadius();
    const parsedCacheLimitValue = parsedCacheLimit();
    if (!fallbackInvalid && (parsedRadiusValue === null || parsedCacheLimitValue === null)) return null;
    return {
      name: 'settings/update-neighbor-preload',
      enabled: enabledInput.checked,
      radius: parsedRadiusValue ?? state.radius,
      cacheLimit: parsedCacheLimitValue ?? state.cacheLimit,
      probeMethod: probeMethodSelect.value === 'head' ? 'head' : 'get',
      loadFailureFeedback: parsedFeedback(),
    };
  };
  const dispatchCurrent = (): void => {
    const action = currentAction(false);
    if (action) dispatch(action);
  };

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';
  const manual = document.createElement('button');
  manual.type = 'button';
  manual.textContent = 'Preload more';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dispatchCurrent();
  });
  enabledInput.addEventListener('change', () => {
    const action = currentAction(true);
    if (action) dispatch(action);
  });
  probeMethodSelect.addEventListener('change', dispatchCurrent);
  feedbackSelect.addEventListener('change', dispatchCurrent);
  manual.addEventListener('click', () => {
    const parsedRadiusValue = parsedRadius();
    const parsedCacheLimitValue = parsedCacheLimit();
    if (parsedRadiusValue === null || parsedCacheLimitValue === null) return;
    enabledInput.checked = true;
    dispatch({
      name: 'settings/update-neighbor-preload',
      enabled: true,
      radius: parsedRadiusValue,
      cacheLimit: parsedCacheLimitValue,
      probeMethod: probeMethodSelect.value === 'head' ? 'head' : 'get',
      loadFailureFeedback: parsedFeedback(),
    });
    dispatch({ name: 'neighbor-preload/manual', radius: parsedRadiusValue, cacheLimit: parsedCacheLimitValue });
  });

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Warms this many parsed-field URLs ahead and behind. Speculative loads stay in this page session only and never add Recents, URL review records, panel messages, pins, or Recall entries. Cache 0 keeps all entries without eviction.';
  form.append(
    enabledLabel,
    radius.label,
    cacheLimit.label,
    createSettingField('Probe', probeMethodSelect),
    createSettingField('Failure feedback', feedbackSelect),
    apply,
    manual,
  );
  wrapper.append(heading, form, meta);
  return wrapper;
}

export function createUrlReviewStatusSettingsView(
  state: UrlReviewStatusSettingsState,
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';
  const heading = document.createElement('h4');
  heading.textContent = 'URL review status';
  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';
  const limit = createNumberSettingField('Max records per site', state.limit, URL_REVIEW_STATUS_LIMITS.min, URL_REVIEW_STATUS_LIMITS.max);
  const clearLabel = document.createElement('label');
  clearLabel.className = 'image-trail-panel__settings-checkbox';
  const clearInput = document.createElement('input');
  clearInput.type = 'checkbox';
  clearInput.checked = state.clearAfterExport;
  const clearText = document.createElement('span');
  clearText.textContent = 'Clear current-site review status after export';
  clearLabel.append(clearInput, clearText);
  const dispatchCurrent = (): void => {
    const parsedLimit = Number(limit.input.value);
    if (!Number.isInteger(parsedLimit)) return;
    dispatch({ name: 'settings/update-url-review-status-retention', limit: parsedLimit, clearAfterExport: clearInput.checked });
  };
  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    dispatchCurrent();
  });
  clearInput.addEventListener('change', dispatchCurrent);
  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Oldest URL review records fall off per site when the cap is exceeded. This never clears recents, pins, Recall, downloads, thumbnails, or originals.';
  form.append(limit.label, clearLabel, apply);
  wrapper.append(heading, form, meta);
  return wrapper;
}

function createNumberSettingField(
  labelText: string,
  value: number,
  min: number,
  max: number,
): { readonly label: HTMLLabelElement; readonly input: HTMLInputElement } {
  const input = document.createElement('input');
  input.className = 'image-trail-panel__settings-number-input';
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.step = '1';
  input.value = String(value);
  input.inputMode = 'numeric';
  return { label: createSettingField(labelText, input), input };
}

function createSettingField(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(text, control);
  return label;
}

function createSelect(options: readonly { readonly value: string; readonly label: string }[], selected: string): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'image-trail-panel__settings-select';
  for (const option of options) {
    const element = document.createElement('option');
    element.value = option.value;
    element.textContent = option.label;
    element.selected = option.value === selected;
    select.append(element);
  }
  select.value = selected;
  return select;
}

function parseBoundedInteger(value: string, min: number, max: number): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : null;
}
