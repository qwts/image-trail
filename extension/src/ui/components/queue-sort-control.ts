import type { QueueDisplayOrder } from '../../core/display-order.js';

export function createQueueSortControl(
  order: QueueDisplayOrder,
  dispatch: (action: { readonly name: 'bookmarks/update-display-order'; readonly order: QueueDisplayOrder }) => void,
): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'image-trail-panel__record-sort-select';
  select.setAttribute('aria-label', 'Queue order');
  select.append(createOption('front-first', 'Front first'), createOption('back-first', 'Back first'));
  select.value = order;
  select.addEventListener('change', () => {
    if (select.value === 'front-first' || select.value === 'back-first') {
      dispatch({ name: 'bookmarks/update-display-order', order: select.value });
    }
  });
  return select;
}

function createOption(value: QueueDisplayOrder, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}
