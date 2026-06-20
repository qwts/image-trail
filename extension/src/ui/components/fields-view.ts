import type { UrlField } from '../../core/url/types.js';

export interface EditableField {
  readonly field: UrlField;
  readonly value: string;
}

export interface FieldsViewCallbacks {
  readonly onValueChange: (fieldId: string, value: string) => void;
  readonly onStep: (fieldId: string, delta: 1 | -1) => void;
  readonly onActivate: (fieldId: string) => void;
}

export function createFieldsView(fields: EditableField[], activeFieldId: string | null, callbacks: FieldsViewCallbacks): HTMLElement {
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
    container.className = `image-trail-panel__field-row${field.field.id === activeFieldId ? ' is-active' : ''}`;

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
    meta.textContent = `${field.field.location} · ${field.field.tokenKind} · ${field.field.value || '(empty)'}${field.field.id === activeFieldId ? ' · active' : ''}`;

    const controls = document.createElement('span');
    const hasStepControls = field.field.tokenKind === 'int' || field.field.tokenKind === 'hex';
    controls.className = `image-trail-panel__field-control${hasStepControls ? ' has-step-controls' : ''}`;
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
