import type { BufferedNavigationDebugSnapshot } from './buffered-navigation-status.js';

export function syncBufferedDebugOverlay(root: HTMLElement, snapshot: BufferedNavigationDebugSnapshot | null): void {
  const existing = root.querySelector('.image-trail-panel__buffer-debug');
  if (!snapshot) {
    existing?.remove();
    return;
  }
  const overlay = existing instanceof HTMLElement ? existing : document.createElement('div');
  overlay.className = 'image-trail-panel__buffer-debug';
  const { cursor, bufferN, indices } = snapshot;
  const cells: HTMLElement[] = [];
  for (let index = cursor - bufferN; index <= cursor + bufferN; index += 1) {
    const entry = indices.get(index);
    const cell = document.createElement('span');
    cell.className = 'image-trail-panel__buffer-debug-cell';
    cell.dataset['status'] = entry ? `${entry.manifest}:${entry.image}` : 'UNKNOWN';
    if (index === cursor) cell.classList.add('is-current');
    cell.title = `${index}: ${entry?.manifest ?? 'UNKNOWN'} / ${entry?.image ?? 'UNKNOWN'}`;
    cell.textContent = String(index);
    cells.push(cell);
  }
  overlay.replaceChildren(...cells);
  if (!existing) root.append(overlay);
}
