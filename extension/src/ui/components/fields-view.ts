import type { UrlField } from '../../core/url/types.js';

export function createFieldsView(fields: UrlField[], activeFieldId: string | null): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__fields';
  const heading = document.createElement('h3');
  heading.textContent = 'Editable fields';
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__field-list';
  for (const field of fields) {
    const item = document.createElement('li');
    item.textContent = field.id === activeFieldId ? `${field.label} (active)` : field.label;
    list.append(item);
  }
  if (fields.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No numeric or hex fields found.';
    list.append(item);
  }
  wrapper.append(heading, list);
  return wrapper;
}
