import { captureFailureMessage } from '../../core/image/capture-result.js';
import type { PanelAction, PanelState } from '../../core/types.js';
import { createButton, createIconButton, createStatusPill, createToast, type StatusTone, type ToastTone } from './primitives.js';

interface PanelShellCallbacks {
  readonly dispatch: (action: PanelAction) => void;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
}

export function panelHasError(state: PanelState): boolean {
  return (
    state.status === 'error' ||
    state.importExportMessageIsError === true ||
    state.recall.messageIsError === true ||
    (state.captureResult !== null && state.captureResult.status !== 'captured')
  );
}

export function panelIsWaiting(state: PanelState): boolean {
  return (
    state.captureInProgress ||
    state.importExportBusy ||
    state.pcloudBackup.connectionState === 'busy' ||
    state.recall.busy ||
    state.automation.slideshowPhase === 'running' ||
    state.automation.retryPhase === 'running' ||
    state.automation.governorStatus !== 'ready' ||
    state.automation.navigationBusy
  );
}

function statusSummary(state: PanelState): string {
  if (panelHasError(state)) return 'Needs attention';
  if (state.captureInProgress) return 'Capturing';
  if (state.importExportBusy) return 'Import/export';
  if (state.pcloudBackup.connectionState === 'busy') return 'pCloud';
  if (state.recall.busy) return 'Recall loading';
  if (state.automation.retryPhase === 'running') return 'Retrying';
  if (state.automation.slideshowPhase === 'running') return 'Slideshow';
  if (state.automation.governorStatus !== 'ready') return 'Rate limited';
  if (state.automation.navigationBusy) return 'Loading';
  if (state.status === 'picking') return 'Picking';
  return 'Ready';
}

function statusTone(state: PanelState): StatusTone {
  if (panelHasError(state)) return 'error';
  if (panelIsWaiting(state)) return 'busy';
  return 'ready';
}

export function createPanelHeader(state: PanelState, callbacks: PanelShellCallbacks): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-panel__header image-trail-ds__panel-header';

  const heading = document.createElement('h2');
  heading.className = 'image-trail-panel__title image-trail-ds__wordmark';
  heading.textContent = 'Image Trail';
  if (callbacks.onPanelDragStart) heading.addEventListener('pointerdown', callbacks.onPanelDragStart);

  const label = statusSummary(state);
  const tone = statusTone(state);
  const status = createStatusPill({ label, tone, waiting: panelIsWaiting(state) });
  status.classList.add('image-trail-panel__header-status', tone === 'error' ? 'is-error' : tone === 'busy' ? 'is-waiting' : 'is-ready');
  status.title = state.privacyModeEnabled ? label : state.message.trim() || label;

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__header-actions image-trail-ds__panel-header-actions';
  actions.append(
    createIconButton({
      glyph: '?',
      label: state.helpOpen ? 'Hide help' : 'Show help',
      pressed: state.helpOpen,
      className: 'image-trail-panel__icon-button',
      onClick: () => callbacks.dispatch({ name: 'help/toggle' }),
    }),
    createIconButton({
      glyph: '⚙',
      label: state.settingsOpen ? 'Hide settings' : 'Show settings',
      pressed: state.settingsOpen,
      className: 'image-trail-panel__icon-button',
      onClick: () => callbacks.dispatch({ name: 'settings/toggle' }),
    }),
    createIconButton({
      glyph: '−',
      label: 'Minimize panel',
      className: 'image-trail-panel__icon-button',
      onClick: () => callbacks.dispatch({ name: 'panel/minimize' }),
    }),
    createIconButton({
      glyph: '×',
      label: 'Close panel',
      className: 'image-trail-panel__icon-button',
      onClick: () => callbacks.dispatch({ name: 'close-panel' }),
    }),
  );

  header.append(heading, status, actions);
  return header;
}

export function createMinimizedPanel(state: PanelState, dispatch: (action: PanelAction) => void): HTMLElement {
  const container = document.createElement('div');
  container.className = 'image-trail-panel__minimized image-trail-ds__minimized';
  const label = state.target.grabModeActive ? 'Expand Image Trail panel. Grab Mode is active.' : 'Expand Image Trail panel';
  const button = createButton({
    label: 'Image Trail',
    ariaLabel: label,
    title: label,
    className: 'image-trail-panel__minimized-button',
    onClick: () => dispatch({ name: 'panel/expand' }),
  });
  button.dataset['grabMode'] = state.target.grabModeActive ? 'active' : 'inactive';
  container.append(button);
  return container;
}

function waitingMessage(state: PanelState): string {
  if (state.captureInProgress) return 'Capturing selected image original.';
  if (state.importExportBusy) return 'Import or export is running.';
  if (state.pcloudBackup.connectionState === 'busy') return state.pcloudBackup.message ?? 'pCloud is working.';
  if (state.recall.busy) return 'Loading Recall records.';
  if (state.automation.retryPhase === 'running') return 'Retrying failed image loads.';
  if (state.automation.slideshowPhase === 'running') return 'Slideshow is advancing images.';
  if (state.automation.governorStatus !== 'ready') return 'Waiting for the request limit window.';
  if (state.automation.navigationBusy) return 'Loading the next image.';
  return '';
}

function toastMessage(state: PanelState): string {
  const waiting = waitingMessage(state);
  if (waiting) return waiting;
  if (!panelHasError(state)) return '';
  if (state.privacyModeEnabled) return 'Image Trail needs attention. Open the panel for details.';
  if (state.captureResult?.status === 'failed' || state.captureResult?.status === 'remote-only') {
    return state.captureResult.message || captureFailureMessage(state.captureResult.reason, state.captureResult.origin);
  }
  if (state.importExportMessage) return state.importExportMessage;
  if (state.recall.message) return state.recall.message;
  return state.message.trim();
}

export function renderPanelToast(toastRoot: HTMLElement | null | undefined, state: PanelState): void {
  if (!toastRoot) return;
  const message = toastMessage(state);
  const showToast = state.visible && state.status !== 'closed' && message.length > 0;
  const label = panelHasError(state) ? 'Error' : panelIsWaiting(state) ? 'Working' : statusSummary(state);
  const tone: ToastTone = panelHasError(state) ? 'error' : panelIsWaiting(state) ? 'warning' : 'ready';
  const toastKey = showToast ? [tone, String(panelIsWaiting(state)), label, message].join('\u0000') : '';
  if (toastRoot.dataset['imageTrailToastKey'] === toastKey) return;
  toastRoot.dataset['imageTrailToastKey'] = toastKey;
  toastRoot.replaceChildren();
  toastRoot.className = 'image-trail-panel-root image-trail-panel__toast-root';
  toastRoot.classList.toggle('is-waiting', panelIsWaiting(state));
  toastRoot.classList.toggle('has-status-error', panelHasError(state));
  if (!showToast) return;

  const toast = state.privacyModeEnabled
    ? createToast({ privacyMasked: true, privateMessage: message, label, tone, waiting: panelIsWaiting(state) })
    : createToast({ message, label, tone, waiting: panelIsWaiting(state) });
  toast.classList.add('image-trail-panel__toast');
  toast.querySelector('.image-trail-ds__toast-label')?.classList.add('image-trail-panel__toast-label');
  const copy = toast.querySelector<HTMLElement>('.image-trail-ds__toast-message');
  copy?.classList.add('image-trail-panel__toast-message');
  if (copy) copy.title = state.privacyModeEnabled ? 'Privacy-safe status' : message;
  toastRoot.append(toast);
}
