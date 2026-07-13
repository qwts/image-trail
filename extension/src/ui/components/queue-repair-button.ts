export interface QueueRepairButtonOptions {
  readonly selectedIds: readonly string[];
  readonly captureInProgress: boolean;
  readonly blobKeyUnlocked: boolean;
  readonly onRepair: (ids: readonly string[]) => void;
}

export function createQueueRepairButton(options: QueueRepairButtonOptions): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Repair selected originals';
  button.title = options.blobKeyUnlocked
    ? 'Verify selected durable queue rows and re-capture only missing originals.'
    : 'Unlock encrypted originals before repairing selected queue rows.';
  button.disabled = options.selectedIds.length === 0 || options.captureInProgress || !options.blobKeyUnlocked;
  button.addEventListener('click', () => options.onRepair(options.selectedIds));
  return button;
}

export function createQueueSelectionButton(
  label: string,
  ids: readonly string[],
  onSelect: (ids: readonly string[]) => void,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = ids.length === 0;
  button.addEventListener('click', () => onSelect(ids));
  return button;
}
