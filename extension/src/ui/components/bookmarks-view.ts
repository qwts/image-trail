import type { ImageDisplayRecord } from '../../core/display-records.js';

type BookmarkAction =
  | { readonly name: 'bookmark/current' }
  | { readonly name: 'bookmark/load'; readonly id: string }
  | { readonly name: 'bookmark/remove'; readonly id: string };

export function createBookmarksView(
  currentUrl: string | null,
  items: readonly ImageDisplayRecord[],
  dispatch: (action: BookmarkAction) => void,
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section';

  const heading = document.createElement('h3');
  heading.textContent = 'Bookmarks';

  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = 'Bookmark current image';
  add.disabled = currentUrl === null;
  add.addEventListener('click', () => dispatch({ name: 'bookmark/current' }));

  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  for (const item of items) {
    const entry = document.createElement('li');
    const load = document.createElement('button');
    load.type = 'button';
    load.textContent = item.label ?? item.url;
    load.addEventListener('click', () => dispatch({ name: 'bookmark/load', id: item.id }));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => dispatch({ name: 'bookmark/remove', id: item.id }));
    entry.append(load, remove);
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent = 'Saved image URLs persist through the encrypted bookmarks repository.';
  section.append(heading, add, items.length ? list : empty);
  return section;
}
