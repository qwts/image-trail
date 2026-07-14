import { displayTitleForRecord, encryptedBlobIdForRecord, type ImageDisplayRecord } from '../../core/display-records.js';
import { DEFAULT_RECENT_DISPLAY_ORDER, sortRecentRecords, type RecentDisplayOrder } from '../../core/display-order.js';
import type { RecentSparseRowDisplayMode } from '../../core/types.js';
import { PRIVACY_RECORD_META, PRIVACY_RECORD_NAME, recordExtensionLabel, recordTitle } from './record-metadata.js';
import { registerPreviewRowClick } from './record-row-preview-click.js';
import { createRecordRow, type RecordRowState } from './record-row.js';
import { selectedRangeIds } from './selection-ranges.js';

type HistoryAction =
  | { readonly name: 'history/pin'; readonly id: string }
  | { readonly name: 'history/remove'; readonly id: string }
  | { readonly name: 'history/delete-all' }
  | { readonly name: 'history-selection/toggle'; readonly id: string }
  | { readonly name: 'history-selection/select'; readonly ids: readonly string[]; readonly mode?: 'replace' | 'add' }
  | { readonly name: 'history-selection/clear' }
  | { readonly name: 'history/update-display-order'; readonly order: RecentDisplayOrder }
  | { readonly name: 'capture/request'; readonly url: string; readonly sourceType: 'history'; readonly sourceRecordId: string }
  | { readonly name: 'capture/preview'; readonly url: string; readonly blobId?: string | undefined }
  | { readonly name: 'panel/history-section-open'; readonly open: boolean }
  | { readonly name: 'capture/delete'; readonly id: string; readonly blobId: string };

interface HistoryViewOptions {
  readonly blobKeyAvailable: boolean;
  /** Attached-panel collapse state (#438); detached windows always render open. */
  readonly sectionOpen?: boolean;
  /** False in detached windows (#441): the header renders without the toggle affordance. */
  readonly collapsible?: boolean;
  readonly listBlockSize: number | null;
  readonly onListResize: (blockSize: number) => void;
  readonly sparseRowDisplayMode: RecentSparseRowDisplayMode;
  readonly displayOrder?: RecentDisplayOrder | undefined;
  readonly privacyMode?: boolean;
}

export function createHistoryView(
  items: readonly ImageDisplayRecord[],
  selectedIds: readonly string[],
  captureInProgress: boolean,
  blobKeyUnlocked: boolean,
  dispatch: (action: HistoryAction) => void,
  options?: HistoryViewOptions,
): HTMLElement {
  const displayItems = sortRecentRecords(items, options?.displayOrder ?? DEFAULT_RECENT_DISPLAY_ORDER);
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__history-section';

  const sectionOpen = options?.sectionOpen !== false;
  const collapsible = options?.collapsible !== false;
  const heading = document.createElement('h3');
  heading.textContent = 'Recent history';
  const header = document.createElement('div');
  header.className = 'image-trail-panel__section-header image-trail-panel__section-header--with-actions';
  header.dataset['open'] = String(sectionOpen);
  // Summary ergonomics (#441): the WHOLE header row is the toggle — hint area included — while
  // clicks on its interactive children (toolbar buttons, queue menu, detach) pass through, and
  // dragging the row still pops the section out (an engaged drag suppresses the click). A detached
  // window renders the header non-interactive: it is always open there, and a live toggle would
  // silently flip the ATTACHED collapse state behind the user's back.
  if (collapsible) {
    header.classList.add('image-trail-panel__section-header--collapsible');
    header.setAttribute('role', 'button');
    header.tabIndex = 0;
    header.setAttribute('aria-expanded', String(sectionOpen));
    header.setAttribute('aria-label', sectionOpen ? 'Hide the Recent history list' : 'Show the Recent history list');
    header.title = sectionOpen ? 'Hide the Recent history list' : 'Show the Recent history list';
    const toggleSection = (): void => dispatch({ name: 'panel/history-section-open', open: !sectionOpen });
    header.addEventListener('click', (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button, summary, details, input, select, a')) return;
      event.preventDefault();
      toggleSection();
    });
    header.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target !== header) return;
      event.preventDefault();
      toggleSection();
    });
  }
  header.append(heading);

  const toolbar = document.createElement('div');
  toolbar.className = 'image-trail-panel__history-toolbar';
  toolbar.append(createRecentSortControl(options?.displayOrder ?? DEFAULT_RECENT_DISPLAY_ORDER, dispatch));
  const sectionActions = document.createElement('div');
  sectionActions.className = 'image-trail-panel__section-actions image-trail-panel__history-actions';
  if (displayItems.length > 0) {
    const selectAll = document.createElement('button');
    selectAll.type = 'button';
    selectAll.textContent = `Select all recents`;
    selectAll.disabled = selectedIds.length === displayItems.length;
    selectAll.addEventListener('click', () => dispatch({ name: 'history-selection/select', ids: displayItems.map((item) => item.id) }));

    const deleteAll = document.createElement('button');
    deleteAll.type = 'button';
    deleteAll.textContent = `Delete recents (${displayItems.length})`;
    deleteAll.addEventListener('click', () => dispatch({ name: 'history/delete-all' }));
    sectionActions.append(selectAll, deleteAll);
  }
  const list = document.createElement('ol');
  const sparseRowDisplayMode = options?.sparseRowDisplayMode ?? 'adaptive';
  const topLeftMetadata = sparseRowDisplayMode !== 'compact' && (sparseRowDisplayMode !== 'adaptive' || displayItems.length <= 2);
  list.className = `image-trail-panel__record-list is-sparse-${sparseRowDisplayMode} ${sparseCountClass(displayItems.length)}${topLeftMetadata ? ' has-top-left-metadata' : ''}`;
  list.dataset['sparseRowMode'] = sparseRowDisplayMode;
  if (options?.listBlockSize !== null && options?.listBlockSize !== undefined) {
    list.classList.add('is-user-resized');
    list.style.setProperty('--image-trail-history-size', `${options.listBlockSize}px`);
  }
  list.addEventListener('pointerdown', (event) => {
    const rect = list.getBoundingClientRect();
    if (rect.bottom - event.clientY > 18) return;
    const blockSize = Math.round(rect.height);
    list.classList.add('is-user-resized');
    list.style.setProperty('--image-trail-history-size', `${blockSize}px`);
  });
  list.addEventListener('mouseup', () => {
    if (!list.classList.contains('is-user-resized')) return;
    options?.onListResize(Math.round(list.getBoundingClientRect().height));
  });
  for (const item of displayItems) {
    const capturedBlobId = encryptedBlobIdForRecord(item);
    const encryptedRecord = isEncryptedRecord(item);
    const keyUnavailable = encryptedRecord && !blobKeyUnlocked;
    const keyMissing = options?.blobKeyAvailable === false;
    const lockedEncrypted = isLockedEncryptedRecord(item, blobKeyUnlocked);
    const previewableEncrypted = isPreviewableEncryptedRecord(item, blobKeyUnlocked);
    const pinned = isPinnedRecord(item);
    const statusText = recentStatusText(item);
    const selected = selectedIds.includes(item.id);
    const privacyMasked = options?.privacyMode === true && item.privacyStatus !== 'locked';
    const actions = document.createElement('span');
    actions.className = 'image-trail-panel__item-actions';
    actions.addEventListener('keydown', (event) => event.stopPropagation());
    const row = createRecordRow({
      className: 'image-trail-panel__history-item',
      thumbnail: item.thumbnail,
      thumbnailFallback: privacyMasked ? 'PRIVATE' : recordExtensionLabel(item).slice(0, 4),
      source: privacyMasked ? 'PRIVATE' : recordExtensionLabel(item),
      name: privacyMasked ? PRIVACY_RECORD_NAME : (item.label ?? item.url),
      nameTitle: privacyMasked ? recordTitle(item, options) : displayTitleForRecord(item),
      meta: privacyMasked ? (statusText ? `${PRIVACY_RECORD_META} / ${statusText}` : PRIVACY_RECORD_META) : (statusText ?? undefined),
      storedOriginal: !!item.storedOriginal || item.captureStatus === 'captured',
      state: historyRecordRowState({ selected, keyUnavailable, lockedEncrypted }),
      privacyMasked,
      bodyClassName: 'image-trail-panel__history-label',
      nameClassName: 'image-trail-panel__bookmark-name',
      metaClassName: 'image-trail-panel__record-row-meta',
      actions,
    });
    const entry = row.root;
    entry.dataset['imageTrailRowId'] = item.id;
    if (previewableEncrypted) entry.classList.add('is-captured');
    entry.setAttribute('aria-selected', String(selected));
    entry.addEventListener('click', (event) => {
      if (!isSelectionClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (event.shiftKey) {
        dispatch({
          name: 'history-selection/select',
          ids: selectedRangeIds(
            displayItems.map((record) => record.id),
            selectedIds,
            item.id,
          ),
          mode: 'add',
        });
        return;
      }
      dispatch({ name: 'history-selection/toggle', id: item.id });
    });
    if (keyUnavailable) {
      entry.classList.add('is-locked-encrypted');
      entry.classList.add('is-key-unavailable');
      entry.setAttribute('aria-disabled', 'true');
      entry.title = keyMissing
        ? 'Import the encrypted originals key backup before using this row.'
        : 'Unlock encrypted originals before using this row.';
    } else if (lockedEncrypted) {
      entry.classList.add('is-locked-encrypted');
      entry.setAttribute('aria-disabled', 'true');
      entry.title = 'Unlock encrypted originals before previewing this row.';
    } else {
      entry.tabIndex = 0;
      entry.setAttribute('role', 'button');
      entry.title =
        'Click to select this row. Double-click or press Enter to preview it. Cmd/Ctrl-click selects for export. Shift-click selects a range.';
      entry.addEventListener('click', (event) => {
        if (isSelectionClick(event)) return;
        event.preventDefault();
        if (registerPreviewRowClick(`history:${item.id}`) && selected && selectedIds.length === 1) {
          dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId });
          return;
        }
        const root = queryableRootFor(entry);
        dispatch({ name: 'history-selection/select', ids: [item.id] });
        focusRecordRow(root, item.id);
      });
      entry.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault();
          selectAdjacentHistoryRow(displayItems, item.id, event.key === 'ArrowDown' ? 1 : -1, dispatch, queryableRootFor(entry));
          return;
        }
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId });
          return;
        }
        if (event.key === 'Backspace' && selected) {
          event.preventDefault();
          dispatch({ name: 'history/remove', id: item.id });
          return;
        }
        if (event.key !== ' ') return;
        event.preventDefault();
        if (selected && selectedIds.length === 1) {
          dispatch({ name: 'capture/preview', url: item.url, blobId: capturedBlobId });
          return;
        }
        const root = queryableRootFor(entry);
        dispatch({ name: 'history-selection/select', ids: [item.id] });
        focusRecordRow(root, item.id);
      });
    }
    if (!keyUnavailable && !lockedEncrypted && !pinned) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.textContent = 'Pin';
      pin.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'history/pin', id: item.id });
      });
      actions.append(pin);
    }

    if (item.captureStatus === 'captured' && item.blobId && !keyMissing) {
      const deleteCapture = document.createElement('button');
      deleteCapture.type = 'button';
      deleteCapture.className = 'image-trail-panel__delete-original';
      deleteCapture.textContent = 'Delete original';
      deleteCapture.title = 'Delete original from encrypted storage.';
      deleteCapture.addEventListener('click', (event) => {
        event.stopPropagation();
        if (deleteCapture.dataset['confirming'] !== 'true') {
          deleteCapture.dataset['confirming'] = 'true';
          deleteCapture.textContent = 'Confirm delete original';
          deleteCapture.title = 'Click again to delete original from encrypted storage.';
          return;
        }
        dispatch({ name: 'capture/delete', id: item.id, blobId: item.blobId! });
      });
      actions.append(deleteCapture);
    } else if (blobKeyUnlocked) {
      const capture = document.createElement('button');
      capture.type = 'button';
      capture.textContent = captureInProgress ? 'Capturing...' : 'Capture';
      capture.disabled = captureInProgress;
      capture.classList.toggle('is-waiting', captureInProgress);
      capture.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'capture/request', url: item.url, sourceType: 'history', sourceRecordId: item.id });
      });
      actions.append(capture);
    }

    if (!keyMissing || item.captureStatus === 'captured') {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        dispatch({ name: 'history/remove', id: item.id });
      });
      actions.append(remove);
    }
    list.append(entry);
  }

  const empty = document.createElement('p');
  empty.className = 'image-trail-panel__meta';
  empty.textContent = 'Loaded images will appear here newest-first.';
  const selectionMeta = document.createElement('p');
  selectionMeta.className = 'image-trail-panel__meta';
  selectionMeta.textContent =
    selectedIds.length > 0
      ? `${selectedIds.length} recent item(s) selected for export.`
      : 'Cmd/Ctrl-click rows to select recent items for export. Shift-click selects a range.';
  // Keep the sort control in the one-line heading. Bulk actions stay visible while collapsed, but
  // render in their own row so they cannot wrap the collapse toggle header (#438/#448).
  header.append(toolbar);
  section.append(header);
  if (displayItems.length) section.append(sectionActions);
  // Collapsed (#438): the heading and bulk-action rows stay; the list content hides.
  if (sectionOpen) {
    section.append(displayItems.length ? selectionMeta : empty);
    if (displayItems.length) section.append(list);
  }
  return section;
}

function createRecentSortControl(order: RecentDisplayOrder, dispatch: (action: HistoryAction) => void): HTMLSelectElement {
  const select = document.createElement('select');
  select.className = 'image-trail-panel__record-sort-select';
  select.setAttribute('aria-label', 'Sort Recents');
  select.append(createSortOption('newest-first', 'Newest first'), createSortOption('oldest-first', 'Oldest first'));
  select.value = order;
  select.addEventListener('change', () => {
    if (select.value === 'newest-first' || select.value === 'oldest-first') {
      dispatch({ name: 'history/update-display-order', order: select.value });
    }
  });
  return select;
}

function createSortOption(value: string, label: string): HTMLOptionElement {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = label;
  return option;
}

function sparseCountClass(count: number): string {
  if (count <= 1) return 'has-sparse-count-1';
  if (count === 2) return 'has-sparse-count-2';
  if (count === 3) return 'has-sparse-count-3';
  return 'has-sparse-count-many';
}

function isLockedEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && !blobKeyUnlocked;
}

function isEncryptedRecord(item: ImageDisplayRecord): boolean {
  return !!encryptedBlobIdForRecord(item);
}

function isPreviewableEncryptedRecord(item: ImageDisplayRecord, blobKeyUnlocked: boolean): boolean {
  return !!encryptedBlobIdForRecord(item) && blobKeyUnlocked;
}

function isPinnedRecord(item: ImageDisplayRecord): boolean {
  return !!item.pinnedAt || !!item.pinnedRecordId;
}

function recentStatusText(item: ImageDisplayRecord): string | null {
  const status = [];
  if (isPinnedRecord(item)) status.push('Pinned to queue');
  if (item.captureStatus === 'captured') status.push('Captured original');
  return status.length > 0 ? status.join(' / ') : null;
}

function historyRecordRowState(input: {
  readonly selected: boolean;
  readonly keyUnavailable: boolean;
  readonly lockedEncrypted: boolean;
}): RecordRowState {
  if (input.keyUnavailable) return 'key-unavailable';
  if (input.lockedEncrypted) return 'locked-encrypted';
  return input.selected ? 'selected' : 'default';
}

function isSelectionClick(event: MouseEvent): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey;
}

function selectAdjacentHistoryRow(
  items: readonly ImageDisplayRecord[],
  currentId: string,
  delta: -1 | 1,
  dispatch: (action: HistoryAction) => void,
  root: ParentNode = document,
): void {
  const currentIndex = items.findIndex((item) => item.id === currentId);
  const next = items[currentIndex + delta];
  if (!next) return;
  dispatch({ name: 'history-selection/select', ids: [next.id] });
  focusRecordRow(root, next.id);
}

/* c8 ignore start */
function queryableRootFor(element: HTMLElement): ParentNode {
  const root = element.getRootNode();
  return typeof (root as ParentNode).querySelectorAll === 'function' ? (root as ParentNode) : document;
}

function focusRecordRow(root: ParentNode, id: string): void {
  queueMicrotask(() => {
    const row = findRecordRow(root, id);
    if (row) row.focus();
  });
}

function findRecordRow(root: ParentNode, id: string): HTMLElement | null {
  for (const candidate of root.querySelectorAll('[data-image-trail-row-id]')) {
    if (!(candidate instanceof HTMLElement)) continue;
    if (candidate.dataset['imageTrailRowId'] === id) {
      return candidate;
    }
  }
  return null;
}
/* c8 ignore stop */
