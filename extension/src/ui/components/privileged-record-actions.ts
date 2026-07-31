import { bindTrustedClick } from '../trusted-activation.js';

interface TrustedRecordActionOptions {
  readonly stopPropagation?: boolean;
}

export function createCaptureOriginalButton(
  captureInProgress: boolean,
  onCapture: () => void,
  options: TrustedRecordActionOptions = {},
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = captureInProgress ? 'Capturing...' : 'Capture';
  button.disabled = captureInProgress;
  button.classList.toggle('is-waiting', captureInProgress);
  bindTrustedRecordAction(button, onCapture, options);
  return button;
}

export function createDeleteOriginalButton(onDelete: () => void, options: TrustedRecordActionOptions = {}): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'image-trail-panel__delete-original';
  button.textContent = 'Delete original';
  button.title = 'Delete original from encrypted storage.';
  bindTrustedRecordAction(
    button,
    () => {
      if (button.dataset['confirming'] !== 'true') {
        button.dataset['confirming'] = 'true';
        button.textContent = 'Confirm delete original';
        button.title = 'Click again to delete original from encrypted storage.';
        return;
      }
      onDelete();
    },
    options,
  );
  return button;
}

export function createTrustedRecordActionButton(
  label: string,
  onClick: () => void,
  options: TrustedRecordActionOptions & { readonly title?: string; readonly className?: string } = {},
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (options.title) button.title = options.title;
  if (options.className) button.className = options.className;
  bindTrustedRecordAction(button, onClick, options);
  return button;
}

function bindTrustedRecordAction(button: HTMLButtonElement, onClick: () => void, options: TrustedRecordActionOptions): void {
  bindTrustedClick(button, onClick, options.stopPropagation ? { beforeTrustCheck: (event) => event.stopPropagation() } : {});
}
