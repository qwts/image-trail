import { encryptedBlobIdForRecord, imageExtensionFromUrl, type ImageDisplayRecord } from '../../core/display-records.js';
import type { PanelAction, RecallState } from '../../core/types.js';
import { isCapturedOriginalRecord } from './bookmarks-view.js';
import { recordDisplayName, recordExtensionLabel, recordMetadataText, recordTitle } from './record-metadata.js';
import { registerPreviewRowClick } from './record-row-preview-click.js';
import { createRecordRow } from './record-row.js';
import { selectedRangeIds } from './selection-ranges.js';

interface RecallViewOptions {
  readonly privacyMode?: boolean;
}

export function createRecallDestinationBody(
  state: RecallState,
  dispatch: (action: PanelAction) => void,
  options: RecallViewOptions = {},
): HTMLElement {
  const body = document.createElement('div');
  body.className = 'image-trail-panel__recall-destination';
  body.append(createRecallToolbar(state, dispatch), createRecallMessage(state));
  const records = createRecallRecords(state, dispatch, options);
  if (records) body.append(records);
  body.append(createRecallActions(state, dispatch));
  return body;
}

function createRecallToolbar(state: RecallState, dispatch: (action: PanelAction) => void): HTMLElement {
  const toolbar = document.createElement('div');
  toolbar.className = 'image-trail-panel__recall-destination-toolbar';
  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = recallMetaText(state);
  const reload = document.createElement('button');
  reload.type = 'button';
  reload.textContent = state.busy ? 'Loading…' : 'Reload';
  reload.disabled = state.busy;
  reload.addEventListener('click', () => dispatch({ name: 'recall/reload' }));
  toolbar.append(meta, reload);
  return toolbar;
}

function createRecallMessage(state: RecallState): HTMLElement {
  const message = document.createElement('p');
  message.className = state.messageIsError ? 'image-trail-panel__meta image-trail-panel__error' : 'image-trail-panel__meta';
  message.textContent =
    state.message ?? (state.busy ? 'Loading recall records...' : 'Select records to bring back into the visible queue.');
  return message;
}

function createRecallRecords(state: RecallState, dispatch: (action: PanelAction) => void, options: RecallViewOptions): HTMLElement | null {
  if (state.candidates.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'image-trail-panel__recall-empty';
    empty.textContent = state.busy ? 'Loading...' : 'No durable queue records are currently offscreen.';
    return empty;
  }
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
  return list;
}

function actionButton(label: string, disabled: boolean, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', onClick);
  return button;
}

function createRecallActions(state: RecallState, dispatch: (action: PanelAction) => void): HTMLElement {
  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__actions image-trail-panel__recall-actions';
  const selected = state.selectedIds.length;
  const pins = state.candidates.filter((candidate) => !isCapturedOriginalRecord(candidate));
  const bookmarks = state.candidates.filter(isCapturedOriginalRecord);
  actions.append(
    actionButton('Select all Recall', state.busy || state.candidates.length === 0, () =>
      dispatch({ name: 'recall-selection/select', ids: state.candidates.map((candidate) => candidate.id) }),
    ),
    actionButton('Select Recall pins', state.busy || pins.length === 0, () =>
      dispatch({ name: 'recall-selection/select', ids: pins.map((candidate) => candidate.id) }),
    ),
    actionButton('Select Recall captured bookmarks', state.busy || bookmarks.length === 0, () =>
      dispatch({ name: 'recall-selection/select', ids: bookmarks.map((candidate) => candidate.id) }),
    ),
    actionButton('Clear results', state.busy || state.candidates.length === 0, () => dispatch({ name: 'recall/clear-results' })),
  );
  if (state.hasMore) {
    actions.append(actionButton(state.busy ? 'Loading...' : 'Load more', state.busy, () => dispatch({ name: 'recall/load-more' })));
  }
  actions.append(
    actionButton(selected > 0 ? `Recall selected (${selected})` : 'Recall selected', state.busy || selected === 0, () =>
      dispatch({ name: 'recall/selected' }),
    ),
    actionButton('Clear selection', state.busy || selected === 0, () => dispatch({ name: 'recall-selection/clear' })),
  );
  return actions;
}

function createRecallRow(
  record: ImageDisplayRecord,
  selected: boolean,
  selectedIds: readonly string[],
  orderedIds: readonly string[],
  dispatch: (action: PanelAction) => void,
  options: RecallViewOptions,
): HTMLElement {
  const privacyMasked = options.privacyMode === true && record.privacyStatus !== 'locked';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected;
  const row = createRecordRow({
    layout: 'recall',
    thumbnail: record.thumbnail,
    thumbnailFallback: privacyMasked ? 'PRIVATE' : (imageExtensionFromUrl(record.url) ?? 'IMG'),
    source: privacyMasked ? 'PRIVATE' : recordExtensionLabel(record),
    name: recordDisplayName(record, options),
    nameTitle: recordTitle(record, options),
    meta: recordMetadataText(record, options),
    storedOriginal: isCapturedOriginalRecord(record),
    state: record.privacyStatus === 'locked' ? 'locked-encrypted' : selected ? 'selected' : 'default',
    privacyMasked,
    bodyClassName: 'image-trail-panel__recall-label',
    nameClassName: 'image-trail-panel__recall-name',
    metaClassName: 'image-trail-panel__recall-row-meta image-trail-panel__record-row-meta',
    leading: checkbox,
  });
  const item = row.root;
  item.tabIndex = 0;
  item.setAttribute('role', 'button');
  item.setAttribute('aria-pressed', selected ? 'true' : 'false');
  item.dataset['imageTrailScrollAnchor'] = record.id;
  item.dataset['imageTrailRowId'] = record.id;
  item.title = 'Click to select. Double-click or press Enter to preview. Cmd/Ctrl-click toggles and Shift-click selects a range.';
  bindRecallRowSelection(item, checkbox, record, selected, selectedIds, orderedIds, dispatch);
  return item;
}

function bindRecallRowSelection(
  item: HTMLElement,
  checkbox: HTMLInputElement,
  record: ImageDisplayRecord,
  selected: boolean,
  selectedIds: readonly string[],
  orderedIds: readonly string[],
  dispatch: (action: PanelAction) => void,
): void {
  checkbox.addEventListener('click', (event) => {
    event.stopPropagation();
    const ids = event.shiftKey ? selectedRangeIds(orderedIds, selectedIds, record.id) : null;
    dispatch(ids ? { name: 'recall-selection/select', ids, mode: 'add' } : { name: 'recall-selection/toggle', id: record.id });
  });
  item.addEventListener('click', (event) => {
    if (event.metaKey || event.ctrlKey) return dispatch({ name: 'recall-selection/toggle', id: record.id });
    if (event.shiftKey) {
      return dispatch({ name: 'recall-selection/select', ids: selectedRangeIds(orderedIds, selectedIds, record.id), mode: 'add' });
    }
    if (registerPreviewRowClick(`recall:${record.id}`) && selected && selectedIds.length === 1) {
      return dispatch({ name: 'capture/preview', url: record.url, blobId: encryptedBlobIdForRecord(record), scrollAnchorId: record.id });
    }
    dispatch({ name: 'recall-selection/select', ids: [record.id] });
  });
  item.addEventListener('keydown', (event) => handleRecallRowKey(event, item, record, selected, selectedIds, orderedIds, dispatch));
}

function handleRecallRowKey(
  event: KeyboardEvent,
  item: HTMLElement,
  record: ImageDisplayRecord,
  selected: boolean,
  selectedIds: readonly string[],
  orderedIds: readonly string[],
  dispatch: (action: PanelAction) => void,
): void {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    selectAdjacentRecallRow(orderedIds, record.id, event.key === 'ArrowDown' ? 1 : -1, dispatch, queryableRootFor(item));
    return;
  }
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  if (selected && selectedIds.length === 1) {
    dispatch({ name: 'capture/preview', url: record.url, blobId: encryptedBlobIdForRecord(record), scrollAnchorId: record.id });
    return;
  }
  dispatch({ name: 'recall-selection/select', ids: [record.id] });
}

function selectAdjacentRecallRow(
  orderedIds: readonly string[],
  currentId: string,
  delta: -1 | 1,
  dispatch: (action: PanelAction) => void,
  root: ParentNode = document,
): void {
  const nextId = orderedIds[orderedIds.indexOf(currentId) + delta];
  if (!nextId) return;
  dispatch({ name: 'recall-selection/select', ids: [nextId] });
  queueMicrotask(() => findRecordRow(root, nextId)?.focus());
}

function queryableRootFor(element: HTMLElement): Document | ShadowRoot {
  const root = element.getRootNode();
  return root instanceof Document || root instanceof ShadowRoot ? root : document;
}

function findRecordRow(root: ParentNode, id: string): HTMLElement | null {
  const candidates = Array.from(root.querySelectorAll<HTMLElement>('[data-image-trail-row-id]'));
  for (const candidate of candidates) {
    if (candidate.dataset['imageTrailRowId'] === id) return candidate;
  }
  return null;
}

function recallMetaText(state: RecallState): string {
  if (state.busy) return 'Loading queue rows.';
  if (state.total === 0) return 'No offscreen queue rows found.';
  const unavailable = state.failedCount > 0 ? ` · ${state.failedCount} unavailable` : '';
  const more = state.hasMore ? ' · more available' : '';
  return `${state.candidates.length} shown of ${state.total}${more}${unavailable}`;
}
