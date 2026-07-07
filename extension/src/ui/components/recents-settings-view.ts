import { RECENT_HISTORY_LIMITS, RECENT_HISTORY_RETAINED_LIMITS } from '../../core/settings.js';
import type { PanelAction, RecentHistoryOverflowBehavior, RecentSparseRowDisplayMode } from '../../core/types.js';

const SPARSE_ROW_DISPLAY_MODES: readonly { readonly value: RecentSparseRowDisplayMode; readonly label: string }[] = [
  { value: 'adaptive', label: 'Adaptive' },
  { value: 'full', label: 'Full' },
  { value: 'half', label: 'Half' },
  { value: 'compact', label: 'Compact' },
];

export function createRecentsSettingsView(
  state: {
    readonly limit: number;
    readonly retainedLimit: number;
    readonly overflowBehavior: RecentHistoryOverflowBehavior;
    readonly sparseRowDisplayMode: RecentSparseRowDisplayMode;
  },
  dispatch: (action: PanelAction) => void,
): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Recents';

  const form = document.createElement('form');
  form.className = 'image-trail-panel__settings-form';

  const limitInput = createNumberInput(RECENT_HISTORY_LIMITS, state.limit);
  const retainedLimitInput = createNumberInput(RECENT_HISTORY_RETAINED_LIMITS, state.retainedLimit);
  const overflowSelect = document.createElement('select');
  overflowSelect.className = 'image-trail-panel__settings-select';
  overflowSelect.append(
    createOption('drop-oldest', 'Drop oldest', state.overflowBehavior),
    createOption('keep-session', 'Keep hidden this session', state.overflowBehavior),
  );
  const sparseModeSelect = document.createElement('select');
  sparseModeSelect.className = 'image-trail-panel__settings-select';
  sparseModeSelect.append(...SPARSE_ROW_DISPLAY_MODES.map((option) => createSparseModeOption(option, state.sparseRowDisplayMode)));

  const apply = document.createElement('button');
  apply.type = 'submit';
  apply.textContent = 'Apply';

  const showHidden = document.createElement('button');
  showHidden.type = 'button';
  showHidden.textContent = 'Show hidden recents';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const limit = Number(limitInput.value);
    const retainedLimit = Number(retainedLimitInput.value);
    const overflowBehavior = recentHistoryOverflowBehaviorFrom(overflowSelect.value);
    if (!Number.isInteger(limit) || !Number.isInteger(retainedLimit) || !overflowBehavior) return;
    dispatch({ name: 'settings/update-recent-history-retention', limit, retainedLimit, overflowBehavior });
  });
  showHidden.addEventListener('click', () => {
    limitInput.value = String(state.retainedLimit);
    overflowSelect.value = 'keep-session';
    dispatch({
      name: 'settings/update-recent-history-retention',
      limit: state.retainedLimit,
      retainedLimit: state.retainedLimit,
      overflowBehavior: 'keep-session',
    });
  });
  sparseModeSelect.addEventListener('change', () => {
    const mode = recentSparseRowDisplayModeFrom(sparseModeSelect.value);
    if (!mode) return;
    dispatch({ name: 'settings/update-recent-sparse-row-display-mode', mode });
  });

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = 'Recents stay transient. Hidden overflow is kept only for the current extension session up to the max kept count.';

  form.append(
    createField('Visible recents', limitInput),
    createField('Max kept recents', retainedLimitInput),
    createField('Overflow', overflowSelect),
    createField('Sparse rows', sparseModeSelect),
    apply,
    showHidden,
  );
  wrapper.append(heading, form, meta);
  return wrapper;
}

function createNumberInput(limits: { readonly min: number; readonly max: number }, value: number): HTMLInputElement {
  const input = document.createElement('input');
  input.className = 'image-trail-panel__settings-number-input';
  input.type = 'number';
  input.min = String(limits.min);
  input.max = String(limits.max);
  input.step = '1';
  input.value = String(value);
  input.inputMode = 'numeric';
  return input;
}

function createField(labelText: string, control: HTMLElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-field';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(text, control);
  return label;
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

function createSparseModeOption(
  option: { readonly value: RecentSparseRowDisplayMode; readonly label: string },
  selectedValue: RecentSparseRowDisplayMode,
): HTMLOptionElement {
  const element = document.createElement('option');
  element.value = option.value;
  element.textContent = option.label;
  element.selected = option.value === selectedValue;
  return element;
}

function recentSparseRowDisplayModeFrom(value: string): RecentSparseRowDisplayMode | null {
  return value === 'adaptive' || value === 'full' || value === 'half' || value === 'compact' ? value : null;
}
