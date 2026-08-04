import type { ImageDisplayRecord } from '../../core/display-records.js';
import { requestLocalTransfer } from '../../content/local-transfer-client.js';
import { openInteropWorkflow } from './interop-workflow-view.js';

function hasStoredOriginal(record: ImageDisplayRecord): boolean {
  return record.captureStatus === 'captured' || !!record.storedOriginal || record.protectedPin?.hasStoredOriginal === true;
}

/**
 * One-click same-machine transfer to Overlook. First use asks for the sync
 * code Overlook shows when Transfer & Sync is enabled; afterwards it just
 * ships. The button itself reports the outcome — no workflow dialog.
 */
export function createLocalTransferButton(item: ImageDisplayRecord): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = 'Transfer';
  control.title = 'Send this pin to Overlook on this Mac.';
  const report = (label: string, detail: string): void => {
    control.textContent = label;
    control.title = detail;
    setTimeout(() => {
      control.textContent = 'Transfer';
      control.disabled = false;
    }, 4000);
  };
  control.addEventListener('click', () => {
    control.disabled = true;
    control.textContent = 'Transferring…';
    void requestLocalTransfer(item.id)
      .then(async (outcome) => {
        if (outcome.needsSyncString) {
          const syncString = window.prompt('Paste the sync code shown in Overlook Settings → Transfer & Sync:');
          if (syncString === null || syncString.trim() === '') return { ok: false, message: 'Transfer cancelled.', needsSyncString: false };
          return requestLocalTransfer(item.id, syncString.trim());
        }
        return outcome;
      })
      .then((outcome) => report(outcome.ok ? 'Sent ✓' : 'Failed', outcome.message))
      .catch((error: unknown) => report('Failed', error instanceof Error ? error.message : 'Transfer failed.'));
  });
  return control;
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
    openInteropWorkflow(
      entry,
      records.map((record) => record.id),
      locked,
      control,
    );
  });
  return control;
}

export function createInteropRecordButton(item: ImageDisplayRecord, locked: boolean): HTMLButtonElement {
  const control = document.createElement('button');
  control.type = 'button';
  control.textContent = 'Move / Sync';
  control.title = 'Review this record for Move to Overlook or Sync with Overlook.';
  control.addEventListener('click', () => {
    openInteropWorkflow(hasStoredOriginal(item) ? 'captured-original' : 'bookmark', [item.id], locked, control);
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
    if (item && actions) {
      actions.prepend(createInteropRecordButton(item, locked));
      if (hasStoredOriginal(item) && !locked) actions.prepend(createLocalTransferButton(item));
    }
  }
  return section;
}
