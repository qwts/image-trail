import { captureFailureMessage, isFailedResult } from '../../core/image/capture-result.js';
import type { PanelState } from '../../core/types.js';
import { createButton, createStatusPill } from './primitives.js';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type StatusAction = { readonly name: 'capture/clear' | 'capture/permission-retry' };

export function createStatusView(state: PanelState, dispatch: (action: StatusAction) => void, existing?: HTMLElement | null): HTMLElement {
  const wrapper = existing ?? document.createElement('section');
  wrapper.className = 'image-trail-panel__section image-trail-panel__status-section';

  const status = wrapper.querySelector<HTMLParagraphElement>('.image-trail-panel__status') ?? document.createElement('p');
  status.className = 'image-trail-panel__status';
  const statusText = state.privacyModeEnabled
    ? state.status === 'error' || (state.captureResult !== null && state.captureResult.status !== 'captured')
      ? 'Image Trail needs attention.'
      : 'Image Trail is ready.'
    : state.message.trim() || 'Image Trail is ready.';
  status.textContent = statusText;
  status.title = statusText;

  const meta = wrapper.querySelector<HTMLParagraphElement>('.image-trail-panel__meta') ?? document.createElement('p');
  meta.className = 'image-trail-panel__meta';
  meta.textContent = `Status: ${state.status} · Updated: ${new Date(state.lastUpdatedAt).toLocaleTimeString()}`;

  const children: HTMLElement[] = [status, meta];

  if (state.captureInProgress) {
    const progress = createStatusPill({ label: 'Capturing image…', tone: 'busy', waiting: true });
    progress.classList.add('image-trail-panel__capture-status');
    children.push(progress);
  }

  if (state.captureResult && isFailedResult(state.captureResult)) {
    const error = document.createElement('p');
    error.className = 'image-trail-panel__capture-error';
    error.setAttribute('role', 'alert');
    error.textContent = state.privacyModeEnabled
      ? 'Image Trail could not capture the selected image.'
      : state.captureResult.message || captureFailureMessage(state.captureResult.reason, state.captureResult.origin);
    if (state.captureResult.reason === 'permission-needed' && state.captureRetryRequest) {
      const retry = createButton({
        label: 'Grant permission and retry',
        variant: 'primary',
        className: 'image-trail-panel__primary-action',
        onClick: () => dispatch({ name: 'capture/permission-retry' }),
      });
      error.append(document.createTextNode(' '), retry);
    }
    const dismiss = createButton({ label: 'Dismiss', variant: 'ghost', onClick: () => dispatch({ name: 'capture/clear' }) });
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
    const slideshow = createStatusPill({
      label: `Slideshow: ${auto.slideshowPhase} (${auto.slideshowCount} shown)`,
      tone: auto.slideshowPhase === 'running' ? 'busy' : 'neutral',
      waiting: auto.slideshowPhase === 'running',
      className: 'image-trail-panel__automation-status',
    });
    children.push(slideshow);
  }

  if (auto.retryPhase !== 'idle') {
    const retry = createStatusPill({
      label: `Retry: ${auto.retryPhase} (${auto.retriesUsed}/${auto.retriesMax})`,
      tone: auto.retryPhase === 'running' ? 'busy' : 'neutral',
      waiting: auto.retryPhase === 'running',
      className: 'image-trail-panel__automation-status',
    });
    children.push(retry);
  }

  if (auto.governorStatus !== 'ready') {
    const governor = createStatusPill({
      label: `Rate limit: ${auto.governorStatus} (${auto.requestsInWindow} in window)`,
      tone: 'busy',
      waiting: true,
      className: 'image-trail-panel__automation-status',
    });
    children.push(governor);
  }

  wrapper.replaceChildren(...children);
  return wrapper;
}
