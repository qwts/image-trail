import type { UrlField } from '../../core/url/types.js';

export interface EditableField {
  readonly field: UrlField;
  readonly value: string;
}

export interface FieldsViewCallbacks {
  readonly onValueChange: (fieldId: string, value: string) => void;
  readonly onStep: (fieldId: string, delta: 1 | -1) => void;
  readonly onActivate: (fieldId: string) => void;
  readonly onToggleUnlock: (fieldId: string) => void;
}

export function fieldDisplayValue(field: EditableField): string {
  if (field.field.tokenKind !== 'hex') return field.field.value || '(empty)';
  const raw = field.value;
  try {
    const digits = raw.replace(/^0[xX]/u, '');
    return `${raw} (${BigInt(`0x${digits}`).toString(10)})`;
  } catch {
    return raw || '(empty)';
  }
}

export function createFieldsView(
  fields: EditableField[],
  activeFieldId: string | null,
  failedFieldId: string | null,
  successfulFieldIds: readonly string[],
  unchangedFieldIds: readonly string[],
  unlockedFieldIds: readonly string[],
  callbacks: FieldsViewCallbacks,
): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__fields';
  const heading = document.createElement('h3');
  heading.textContent = 'Parsed fields';
  const intro = document.createElement('p');
  intro.className = 'image-trail-panel__meta';
  intro.textContent = fields.length
    ? `${fields.length} token${fields.length === 1 ? '' : 's'} parsed from the selected image URL.`
    : 'Select a target image to inspect its parsed URL tokens.';
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__field-list';
  for (const field of fields) {
    const item = document.createElement('li');
    item.className = 'image-trail-panel__field-item';
    const container = document.createElement('div');
    const isFailed = field.field.id === failedFieldId;
    const isSuccessful = successfulFieldIds.includes(field.field.id);
    const isUnchanged = unchangedFieldIds.includes(field.field.id);
    const isUnlocked = unlockedFieldIds.includes(field.field.id);
    const canUnlock =
      isSuccessful && field.field.location === 'query' && (field.field.tokenKind === 'int' || field.field.tokenKind === 'hex');
    container.className = `image-trail-panel__field-row${field.field.id === activeFieldId ? ' is-active' : ''}${isSuccessful ? ' is-success' : ''}${isUnchanged ? ' is-unchanged' : ''}${isFailed ? ' is-error' : ''}`;

    const value = document.createElement('input');
    value.type = 'text';
    value.value = field.value;
    value.placeholder = field.field.label;
    value.className = 'image-trail-panel__field-input';
    value.setAttribute('aria-label', `Edit ${field.field.label}`);
    value.dataset.fieldId = field.field.id;
    value.addEventListener('focus', () => {
      if (field.field.id !== activeFieldId) callbacks.onActivate(field.field.id);
    });

    const label = document.createElement('span');
    label.className = 'image-trail-panel__field-label';
    label.textContent = field.field.label;

    const meta = document.createElement('span');
    meta.className = 'image-trail-panel__field-meta';
    const statuses = [
      field.field.id === activeFieldId ? 'active' : '',
      isSuccessful ? 'loads' : '',
      isUnlocked ? 'unlocked' : '',
      isUnchanged ? 'unchanged' : '',
      isFailed ? 'failed load' : '',
    ].filter(Boolean);
    meta.textContent = `${field.field.location} · ${field.field.tokenKind} · ${fieldDisplayValue(field)}${statuses.length ? ` · ${statuses.join(' · ')}` : ''}`;

    const hasStepControls = field.field.tokenKind === 'int' || field.field.tokenKind === 'hex';
    const controls = document.createElement('span');
    controls.className = `image-trail-panel__field-control${hasStepControls ? ' has-step-controls' : ''}${canUnlock ? ' has-unlock-control' : ''}`;
    controls.append(value);

    if (hasStepControls) {
      const decrement = document.createElement('button');
      decrement.type = 'button';
      decrement.className = 'image-trail-panel__field-step-button';
      decrement.textContent = '-';
      decrement.title = `Decrement ${field.field.label}`;
      decrement.setAttribute('aria-label', `Decrement ${field.field.label}`);
      decrement.addEventListener('click', () => callbacks.onStep(field.field.id, -1));

      const increment = document.createElement('button');
      increment.type = 'button';
      increment.className = 'image-trail-panel__field-step-button';
      increment.textContent = '+';
      increment.title = `Increment ${field.field.label}`;
      increment.setAttribute('aria-label', `Increment ${field.field.label}`);
      increment.addEventListener('click', () => callbacks.onStep(field.field.id, 1));

      controls.append(decrement, increment);
    }

    if (canUnlock) {
      const unlock = document.createElement('button');
      unlock.type = 'button';
      unlock.className = `image-trail-panel__field-lock-button${isUnlocked ? ' is-unlocked' : ''}`;
      unlock.textContent = isUnlocked ? 'Lock' : 'Unlock';
      unlock.title = isUnlocked ? `Remove ${field.field.label} from Previous/Next` : `Include ${field.field.label} in Previous/Next`;
      unlock.setAttribute('aria-label', unlock.title);
      unlock.addEventListener('click', () => callbacks.onToggleUnlock(field.field.id));
      controls.append(unlock);
    }

    value.addEventListener('change', () => {
      callbacks.onValueChange(field.field.id, value.value);
    });
    value.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        callbacks.onValueChange(field.field.id, value.value);
      }
    });

    container.append(label, meta, controls);
    item.append(container);
    list.append(item);
  }
  if (fields.length === 0) {
    const item = document.createElement('li');
    item.className = 'image-trail-panel__field-empty';
    item.textContent = 'No parsed fields available yet.';
    list.append(item);
  }
  wrapper.append(heading, intro, list);
  return wrapper;
}
