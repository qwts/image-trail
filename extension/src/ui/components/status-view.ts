import type { PanelState } from '../../core/types.js';

export function createStatusView(state: PanelState): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section';

  const status = document.createElement('p');
  status.className = 'image-trail-panel__status';
  status.textContent = state.message;

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  const usage = state.storageUsage
    ? ` · Originals: ${state.storageUsage.originalCount} (${state.storageUsage.originalBytes} bytes) · Remote-only: ${state.storageUsage.remoteOnlyCount}`
    : '';
  meta.textContent = `Status: ${state.status} · Updated: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}${usage}`;

  wrapper.append(status, meta);
  return wrapper;
}
