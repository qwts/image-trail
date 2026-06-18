import { captureFailureMessage, isFailedResult } from '../../core/image/capture-result.js';
import type { PanelState } from '../../core/types.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type StatusAction = { readonly name: 'capture/clear' };

export function createStatusView(state: PanelState, dispatch: (action: StatusAction) => void): HTMLElement {
  const wrapper = document.createElement('section');
  wrapper.className = 'image-trail-panel__section';

  const status = document.createElement('p');
  status.className = 'image-trail-panel__status';
  status.textContent = state.message;

  const meta = document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = `Status: ${state.status} · Updated: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`;

  wrapper.append(status, meta);

  if (state.captureInProgress) {
    const progress = document.createElement('p');
    progress.className = 'image-trail-panel__capture-status';
    progress.textContent = 'Capturing image…';
    wrapper.append(progress);
  }

  if (state.captureResult && isFailedResult(state.captureResult)) {
    const error = document.createElement('p');
    error.className = 'image-trail-panel__capture-error';
    error.textContent = state.captureResult.message || captureFailureMessage(state.captureResult.reason, state.captureResult.origin);
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.textContent = 'Dismiss';
    dismiss.addEventListener('click', () => dispatch({ name: 'capture/clear' }));
    error.append(document.createTextNode(' '), dismiss);
    wrapper.append(error);
  }

  if (state.storageUsage) {
    const usage = document.createElement('p');
    usage.className = 'image-trail-panel__storage-usage';
    usage.textContent = `Storage: ${state.storageUsage.blobCount} image${state.storageUsage.blobCount === 1 ? '' : 's'} stored (${formatBytes(state.storageUsage.totalBytes)})`;
    wrapper.append(usage);
  }

  const auto = state.automation;
  if (auto.slideshowPhase !== 'idle') {
    const slideshow = document.createElement('p');
    slideshow.className = 'image-trail-panel__automation-status';
    slideshow.textContent = `Slideshow: ${auto.slideshowPhase} (${auto.slideshowCount} shown)`;
    wrapper.append(slideshow);
  }

  if (auto.retryPhase !== 'idle') {
    const retry = document.createElement('p');
    retry.className = 'image-trail-panel__automation-status';
    retry.textContent = `Retry: ${auto.retryPhase} (${auto.retriesUsed}/${auto.retriesMax})`;
    wrapper.append(retry);
  }

  if (auto.governorStatus !== 'ready') {
    const governor = document.createElement('p');
    governor.className = 'image-trail-panel__automation-status';
    governor.textContent = `Rate limit: ${auto.governorStatus} (${auto.requestsInLastMinute} req/min)`;
    wrapper.append(governor);
  }

  return wrapper;
}
