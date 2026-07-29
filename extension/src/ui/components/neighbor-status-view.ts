import type { BufferedNavigationStatusSnapshot } from '../panel/buffered-navigation-status.js';
import { createStatusPill, type StatusTone } from './primitives.js';

function visibleOutcomeLabels(snapshot: BufferedNavigationStatusSnapshot): string[] {
  const labels = [
    snapshot.warmed > 0 ? `${snapshot.warmed} warmed` : null,
    snapshot.warming > 0 ? `${snapshot.warming} warming` : null,
    snapshot.failuresVisible && snapshot.failed > 0 ? `${snapshot.failed} failed` : null,
    snapshot.failuresVisible && snapshot.skipped > 0 ? `${snapshot.skipped} skipped` : null,
    snapshot.unknown > 0 ? `${snapshot.unknown} unknown` : null,
  ].filter((label): label is string => label !== null);
  return labels.length > 0 ? labels : ['0 warmed'];
}

export function neighborStatusLabel(snapshot: BufferedNavigationStatusSnapshot): string {
  return `Neighbors: ${visibleOutcomeLabels(snapshot).join(' · ')}`;
}

function neighborStatusTone(snapshot: BufferedNavigationStatusSnapshot): StatusTone {
  if (snapshot.failuresVisible && snapshot.failed + snapshot.skipped > 0) return 'error';
  if (snapshot.warming > 0) return 'busy';
  return 'ready';
}

/**
 * Renders URL-free counts only. Reusing the section keeps targeted preload updates from rebuilding
 * the panel, its fields, or any focused control.
 */
export function createNeighborStatusView(snapshot: BufferedNavigationStatusSnapshot, existing?: HTMLElement | null): HTMLElement {
  const wrapper = existing ?? document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__status-section image-trail-panel__neighbor-status';
  wrapper.setAttribute('aria-label', 'Parsed-field neighbor status');
  const label = neighborStatusLabel(snapshot);
  const waiting = snapshot.warming > 0;
  const pill = createStatusPill({
    label,
    title: label,
    tone: neighborStatusTone(snapshot),
    waiting,
    className: 'image-trail-panel__neighbor-status-pill',
  });
  wrapper.replaceChildren(pill);
  return wrapper;
}

export function syncNeighborStatusView(root: HTMLElement, snapshot: BufferedNavigationStatusSnapshot | null, visible: boolean): void {
  const existing = root.querySelector<HTMLElement>('.image-trail-panel__neighbor-status');
  const anchor = root.querySelector<HTMLElement>('.image-trail-panel__header');
  if (!visible || !anchor || !snapshot) {
    existing?.remove();
    return;
  }
  const view = createNeighborStatusView(snapshot, existing);
  if (!existing) anchor.insertAdjacentElement('afterend', view);
}
