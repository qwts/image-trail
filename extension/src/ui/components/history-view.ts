import type { ImageDisplayRecord } from '../../core/display-records.js';

export function createHistoryView(
  items: readonly ImageDisplayRecord[],
  dispatch: (action: { readonly name: 'history/remove'; readonly id: string }) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section';

  const heading = document.createElement('h3');
  heading.textContent = 'Recent history';

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  for (const item of items) {
    const entry = document.createElement('li');
    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.label ?? item.url;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => dispatch({ name: 'history/remove', id: item.id }));
    entry.append(link, remove);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent = 'Loaded images will appear here newest-first.';
  section.append(heading, items.length ? list : empty);
  return section;
}
