import { imageExtensionFromUrl, type ImageDisplayRecord } from '../../core/display-records.js';
import type { PanelAction, RecallDrawerSide, RecallState } from '../../core/types.js';
import { createExtensionIndicator, isCapturedOriginalRecord } from './bookmarks-view.js';
import { createPrivacyThumbnail, recordDisplayName, recordMetadataText, recordTitle } from './record-metadata.js';
import { selectedRangeIds } from './selection-ranges.js';

export interface RecallDrawerGeometry {
  readonly side: RecallDrawerSide;
  readonly inlineStart: number;
  readonly inlineSize: number;
  readonly blockStart: number;
  readonly blockSize: number;
}

export function createRecallDrawerView(
  state: RecallState,
  geometry: RecallDrawerGeometry,
  dispatch: (action: PanelAction) => void,
  options: { readonly animate?: boolean; readonly privacyMode?: boolean } = {},
): HTMLElement {
  const drawer = document.createElement('aside');
  drawer.className = `image-trail-panel-root image-trail-panel__recall-drawer is-${geometry.side}`;
  if (options.animate) drawer.classList.add('is-opening');
  drawer.setAttribute('role', 'dialog');
  drawer.setAttribute('aria-label', 'Recall');
  drawer.style.left = `${geometry.inlineStart}px`;
  drawer.style.top = `${geometry.blockStart}px`;
  drawer.style.width = `${geometry.inlineSize}px`;
  drawer.style.height = `${geometry.blockSize}px`;
  drawer.style.maxHeight = `${geometry.blockSize}px`;

  const header = document.createElement('div');
  header.className = 'image-trail-panel__recall-header';

  const titleGroup = document.createElement('div');
  titleGroup.className = 'image-trail-panel__recall-title';

  const title = document.createElement('h3');
  title.textContent = 'Recall';

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = recallMetaText(state);

  titleGroup.append(title, meta);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Close';
  close.addEventListener('click', () => dispatch({ name: 'recall/close' }));

  header.append(titleGroup, close);

  const message = document.createElement('p');
  message.className = state.messageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
  message.textContent =
    state.message ?? (state.busy ? 'Loading recall records...' : 'Select records to bring back into the visible queue.');

  const content = document.createDocumentFragment();
  if (state.candidates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'image-trail-panel__recall-empty';
    empty.textContent = state.busy ? 'Loading...' : 'No bookmark records available for Recall.';
    content.append(empty);
  } else {
    const list = document.createElement('ol');
    list.className = 'image-trail-panel__recall-list';
    list.addEventListener('scroll', () => {
      if (state.busy || !state.hasMore) return;
      const remaining = list.scrollHeight - list.scrollTop - list.clientHeight;
      if (remaining < 96) dispatch({ name: 'recall/load-more' });
    });

    const selected = new Set(state.selectedIds);
    const orderedIds = state.candidates.map((candidate) => candidate.id);
    for (const candidate of state.candidates) {
      list.append(createRecallRow(candidate, selected.has(candidate.id), state.selectedIds, orderedIds, dispatch, options));
    }
    content.append(list);
  }

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions image-trail-panel__recall-actions';

  const recall = document.createElement('button');
  recall.type = 'button';
  recall.textContent = state.selectedIds.length > 0 ? `Recall selected (${state.selectedIds.length})` : 'Recall selected';
  recall.disabled = state.busy || state.selectedIds.length === 0;
  recall.addEventListener('click', () => dispatch({ name: 'recall/selected' }));

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear selection';
  clear.disabled = state.busy || state.selectedIds.length === 0;
  clear.addEventListener('click', () => dispatch({ name: 'recall-selection/clear' }));

  const selectAll = document.createElement('button');
  selectAll.type = 'button';
  selectAll.textContent = 'Select all Recall';
  selectAll.disabled = state.busy || state.candidates.length === 0;
  selectAll.addEventListener('click', () =>
    dispatch({ name: 'recall-selection/select', ids: state.candidates.map((candidate) => candidate.id) }),
  );

  const recallPins = state.candidates.filter((candidate) => !isCapturedOriginalRecord(candidate));
  const selectPins = document.createElement('button');
  selectPins.type = 'button';
  selectPins.textContent = 'Select Recall pins';
  selectPins.disabled = state.busy || recallPins.length === 0;
  selectPins.addEventListener('click', () =>
    dispatch({ name: 'recall-selection/select', ids: recallPins.map((candidate) => candidate.id) }),
  );

  const recallBookmarks = state.candidates.filter(isCapturedOriginalRecord);
  const selectBookmarks = document.createElement('button');
  selectBookmarks.type = 'button';
  selectBookmarks.textContent = 'Select Recall captured bookmarks';
  selectBookmarks.disabled = state.busy || recallBookmarks.length === 0;
  selectBookmarks.addEventListener('click', () =>
    dispatch({ name: 'recall-selection/select', ids: recallBookmarks.map((candidate) => candidate.id) }),
  );

  const clearResults = document.createElement('button');
  clearResults.type = 'button';
  clearResults.textContent = 'Clear results';
  clearResults.disabled = state.busy || state.candidates.length === 0;
  clearResults.title = 'Hide loaded Recall results until Recall is reopened or reloaded.';
  clearResults.addEventListener('click', () => dispatch({ name: 'recall/clear-results' }));

  actions.append(selectAll, selectPins, selectBookmarks, clearResults);
  if (state.hasMore) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'image-trail-panel__recall-load-more';
    more.textContent = state.busy ? 'Loading...' : 'Load more';
    more.disabled = state.busy;
    more.addEventListener('click', () => dispatch({ name: 'recall/load-more' }));
    actions.append(more);
  }
  actions.append(recall, clear);
  drawer.append(header, message, content, actions);
  return drawer;
}

function createRecallRow(
  record: ImageDisplayRecord,
  selected: boolean,
  selectedIds: readonly string[],
  orderedIds: readonly string[],
  dispatch: (action: PanelAction) => void,
  options: { readonly privacyMode?: boolean } = {},
): HTMLElement {
  const item = document.createElement('li');
  item.className = selected ? 'is-selected' : '';
  if (options.privacyMode && record.privacyStatus !== 'locked') item.classList.add('is-privacy-masked');
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-pressed', selected ? 'true' : 'false');
  item.dataset.imageTrailScrollAnchor = record.id;

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected;
  checkbox.addEventListener('click', (event) => {
    event.stopPropagation();
    if (event.shiftKey) {
      dispatch({ name: 'recall-selection/select', ids: selectedRangeIds(orderedIds, selectedIds, record.id), mode: 'add' });
      return;
    }
    dispatch({ name: 'recall-selection/toggle', id: record.id });
  });

  item.append(checkbox, createRecallThumbnail(record, options), createRecallLabel(record, options));
  item.addEventListener('click', (event) => {
    if (event.shiftKey) {
      dispatch({ name: 'recall-selection/select', ids: selectedRangeIds(orderedIds, selectedIds, record.id), mode: 'add' });
      return;
    }
    dispatch({ name: 'recall-selection/toggle', id: record.id });
  });
  item.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dispatch({ name: 'recall-selection/toggle', id: record.id });
    }
  });
  return item;
}

function createRecallThumbnail(record: ImageDisplayRecord, options: { readonly privacyMode?: boolean } = {}): HTMLElement {
  if (options.privacyMode && record.privacyStatus !== 'locked') return createPrivacyThumbnail();
  if (record.thumbnail) {
    const image = document.createElement('img');
    image.className = 'image-trail-panel__record-thumbnail';
    image.src = record.thumbnail;
    image.alt = '';
    image.loading = 'lazy';
    return image;
  }

  const fallback = document.createElement('span');
  fallback.className = 'image-trail-panel__record-thumbnail image-trail-panel__record-thumbnail--empty';
  fallback.textContent = imageExtensionFromUrl(record.url) ?? 'IMG';
  return fallback;
}

function createRecallLabel(record: ImageDisplayRecord, options: { readonly privacyMode?: boolean } = {}): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__recall-label';

  const name = document.createElement('span');
  name.className = 'image-trail-panel__recall-name';
  name.textContent = recordDisplayName(record, options);
  name.title = recordTitle(record, options);

  const meta = document.createElement('span');
  meta.className = 'image-trail-panel__recall-row-meta';
  meta.textContent = recordMetadataText(record, options);
  meta.title = meta.textContent;

  wrapper.append(createExtensionIndicator(record), name, meta);
  return wrapper;
}

function recallMetaText(state: RecallState): string {
  if (state.busy) return 'Loading bookmark records.';
  if (state.total === 0) return 'No bookmark records found.';
  const visible = state.candidates.length;
  const unavailable = state.failedCount > 0 ? ` - ${state.failedCount} unavailable` : '';
  const more = state.hasMore ? ' - more available' : '';
  return `${visible} shown of ${state.total}${more}${unavailable}`;
}
