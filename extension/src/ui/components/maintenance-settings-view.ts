import { buildIdentityRows, type BuildIdentity } from '../../core/build-info.js';
import type { StorageUsageSummary } from '../../core/image/capture-result.js';
import type { PanelAction } from '../../core/types.js';

export interface BuildIdentitySettingsState {
  readonly identity: BuildIdentity | null;
  readonly overlayVisible: boolean;
}

export interface DestructiveSettingsState {
  readonly visibleQueueCount: number;
  readonly recallCount: number;
  readonly busy: boolean;
}

export function createBuildIdentitySettingsView(state: BuildIdentitySettingsState, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';
  const heading = document.createElement('h4');
  heading.textContent = 'Build identity';
  const label = document.createElement('label');
  label.className = 'image-trail-panel__settings-checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = state.overlayVisible;
  input.addEventListener('change', () => dispatch({ name: 'settings/update-build-info-overlay-visibility', visible: input.checked }));
  const text = document.createElement('span');
  text.textContent = 'Show build info overlay';
  label.append(input, text);

  if (!state.identity) {
    const empty = document.createElement('p');
    empty.className = 'image-trail-panel__settings-empty';
    empty.textContent = 'Build identity has not loaded yet.';
    wrapper.append(heading, label, empty);
    return wrapper;
  }
  const list = document.createElement('dl');
  list.className = 'image-trail-panel__build-identity';
  for (const row of buildIdentityRows(state.identity)) appendKeyValueRow(list, row.label, row.value);
  wrapper.append(heading, label, list);
  return wrapper;
}

export function createStorageHealthSettingsView(storageUsage: StorageUsageSummary | null): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';
  const heading = document.createElement('h4');
  heading.textContent = 'Storage health';
  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent = 'Approximate IndexedDB usage; inline thumbnail bytes are estimated and browser storage overhead is not included.';
  if (!storageUsage) {
    const empty = document.createElement('p');
    empty.className = 'image-trail-panel__settings-empty';
    empty.textContent = 'Storage usage has not loaded yet.';
    wrapper.append(heading, empty);
    return wrapper;
  }
  const list = document.createElement('dl');
  list.className = 'image-trail-panel__storage-health';
  for (const row of storageHealthRows(storageUsage)) appendStorageHealthRow(list, row.label, row.count, row.bytes);
  wrapper.append(heading, meta, list);
  return wrapper;
}

export function createDestructiveSettingsView(state: DestructiveSettingsState, dispatch: (action: PanelAction) => void): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates image-trail-ds__settings-danger';
  const heading = document.createElement('h4');
  heading.textContent = 'Delete pins';
  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__settings-empty';
  meta.textContent =
    'Deletion removes durable pin records and linked originals. Clear actions outside Settings only hide rows temporarily.';
  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__settings-template-controls';
  actions.append(
    createDangerButton(`Delete current queue (${state.visibleQueueCount})`, state.busy || state.visibleQueueCount === 0, () =>
      dispatch({ name: 'bookmarks/delete-visible' }),
    ),
    createDangerButton(`Delete Recall items (${state.recallCount})`, state.busy || state.recallCount === 0, () =>
      dispatch({ name: 'recall/delete-all' }),
    ),
  );
  wrapper.append(heading, meta, actions);
  return wrapper;
}

export function formatStorageHealthBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function storageHealthRows(
  storageUsage: StorageUsageSummary,
): readonly { readonly label: string; readonly count: number; readonly bytes: number | null }[] {
  const queueRecords = storageUsage.queueRecords ?? { count: 0, totalBytes: 0 };
  const thumbnails = storageUsage.thumbnails ?? { count: 0, totalBytes: 0 };
  const originals = storageUsage.originals ?? { count: storageUsage.blobCount, totalBytes: storageUsage.totalBytes };
  const totalCount =
    storageUsage.queueRecords || storageUsage.thumbnails || storageUsage.originals
      ? queueRecords.count + thumbnails.count + originals.count
      : storageUsage.blobCount;
  const rows: { readonly label: string; readonly count: number; readonly bytes: number | null }[] = [
    { label: 'Queue metadata', count: queueRecords.count, bytes: queueRecords.totalBytes },
    { label: 'Thumbnails', count: thumbnails.count, bytes: thumbnails.totalBytes },
    { label: 'Encrypted originals', count: originals.count, bytes: originals.totalBytes },
    { label: 'Total tracked storage', count: totalCount, bytes: storageUsage.totalBytes },
  ];
  if ((storageUsage.orphanedBlobCount ?? 0) > 0) {
    rows.push({ label: 'Unlinked originals', count: storageUsage.orphanedBlobCount ?? 0, bytes: null });
  }
  return rows;
}

function appendKeyValueRow(list: HTMLDListElement, label: string, value: string): void {
  const term = document.createElement('dt');
  term.textContent = label;
  const description = document.createElement('dd');
  description.textContent = value;
  list.append(term, description);
}

function appendStorageHealthRow(list: HTMLDListElement, label: string, count: number, bytes: number | null): void {
  const countLabel = count === 1 ? '1 record' : `${count} records`;
  appendKeyValueRow(list, label, bytes === null ? countLabel : `${countLabel} · ${formatStorageHealthBytes(bytes)}`);
}

function createDangerButton(label: string, disabled: boolean, onConfirm: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.className = 'is-danger';
  button.addEventListener('click', () => {
    if (button.dataset['confirm'] === 'true') {
      onConfirm();
      button.dataset['confirm'] = 'false';
      button.textContent = label;
      return;
    }
    button.dataset['confirm'] = 'true';
    button.textContent = `Confirm ${label}`;
  });
  button.addEventListener('blur', () => {
    button.dataset['confirm'] = 'false';
    button.textContent = label;
  });
  return button;
}
