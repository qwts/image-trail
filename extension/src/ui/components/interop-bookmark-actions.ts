import type { ImageDisplayRecord } from '../../core/display-records.js';
import { openInteropWorkflow } from './interop-workflow-view.js';

function hasStoredOriginal(record: ImageDisplayRecord): boolean {
  return record.captureStatus === 'captured' || !!record.storedOriginal || record.protectedPin?.hasStoredOriginal === true;
}

export function createInteropQueueButton(
  items: readonly ImageDisplayRecord[],
  selectedIds: readonly string[],
  locked: boolean,
): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = 'Transfer & Sync';
  control.disabled = items.length === 0;
  control.title = 'Review a Move to Overlook or Sync with Overlook without changing queue order.';
  control.addEventListener('click', () => {
    const records = selectedIds.length > 0 ? items.filter((item) => selectedIds.includes(item.id)) : items;
    const first = records[0];
    const entry =
      selectedIds.length > 0 ? 'selection' : records.length === 1 && first && hasStoredOriginal(first) ? 'captured-original' : 'album';
    openInteropWorkflow(entry, records.length, locked);
  });
  return control;
}

export function createInteropRecordButton(item: ImageDisplayRecord, locked: boolean): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = 'Move / Sync';
  control.title = 'Review this record for Move to Overlook or Sync with Overlook.';
  control.addEventListener('click', () => {
    openInteropWorkflow(hasStoredOriginal(item) ? 'captured-original' : 'bookmark', 1, locked);
  });
  return control;
}

export function addInteropBookmarkActions(
  section: HTMLElement,
  items: readonly ImageDisplayRecord[],
  selectedIds: readonly string[],
  locked: boolean,
): HTMLElement {
  section.querySelector('.image-trail-panel__bookmark-actions')?.append(createInteropQueueButton(items, selectedIds, locked));
  for (const row of section.querySelectorAll<HTMLElement>('[data-image-trail-row-id]')) {
    const item = items.find((candidate) => candidate.id === row.dataset['imageTrailRowId']);
    const actions = row.querySelector('.image-trail-panel__item-actions');
    if (item && actions) actions.prepend(createInteropRecordButton(item, locked));
  }
  return section;
}
