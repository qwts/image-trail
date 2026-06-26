import { captureFailureMessage, isFailedResult } from '../../core/image/capture-result.js';
import type { PanelState } from '../../core/types.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type StatusAction = { readonly name: 'capture/clear' };

export function createStatusView(state: PanelState, dispatch: (action: StatusAction) => void, existing?: HTMLElement | null): HTMLElement {
  const wrapper = existing ?? document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__status-section';

  const status = wrapper.querySelector<HTMLParagraphElement>('.image-trail-panel__status') ?? document.createElement('p');
  status.className = 'image-trail-panel__status';
  const statusText = state.message.trim() || 'Image Trail is ready.';
  status.textContent = statusText;
  status.title = statusText;

  const meta = wrapper.querySelector<HTMLParagraphElement>('.image-trail-panel__meta') ?? document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = `Status: ${state.status} · Updated: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`;

  const children: HTMLElement[] = [status, meta];

  if (state.captureInProgress) {
    const progress = document.createElement('p');
    progress.className = 'image-trail-panel__capture-status';
    progress.textContent = 'Capturing image…';
    children.push(progress);
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
    children.push(error);
  }

  if (state.storageUsage) {
    const usage = document.createElement('p');
    usage.className = 'image-trail-panel__storage-usage';
    usage.textContent = `Storage: ${state.storageUsage.blobCount} image${state.storageUsage.blobCount === 1 ? '' : 's'} stored (${formatBytes(state.storageUsage.totalBytes)})`;
    children.push(usage);
  }

  const auto = state.automation;
  if (auto.slideshowPhase !== 'idle') {
    const slideshow = document.createElement('p');
    slideshow.className = 'image-trail-panel__automation-status';
    slideshow.textContent = `Slideshow: ${auto.slideshowPhase} (${auto.slideshowCount} shown)`;
    children.push(slideshow);
  }

  if (auto.retryPhase !== 'idle') {
    const retry = document.createElement('p');
    retry.className = 'image-trail-panel__automation-status';
    retry.textContent = `Retry: ${auto.retryPhase} (${auto.retriesUsed}/${auto.retriesMax})`;
    children.push(retry);
  }

  if (auto.governorStatus !== 'ready') {
    const governor = document.createElement('p');
    governor.className = 'image-trail-panel__automation-status';
    governor.textContent = `Rate limit: ${auto.governorStatus} (${auto.requestsInWindow} in window)`;
    children.push(governor);
  }

  wrapper.replaceChildren(...children);
  return wrapper;
}
