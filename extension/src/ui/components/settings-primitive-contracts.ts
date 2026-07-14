import type { ButtonVariant } from './primitives.js';

/**
 * Applies the shared primitive contracts to the existing Settings controls without replacing
 * their stateful listeners or native elements. Settings owns composition; primitives own visual
 * variants, focus, disabled, waiting, and form-control presentation.
 */
export function applySettingsPrimitiveContracts(root: HTMLElement): void {
  root.classList.add('image-trail-ds__settings-surface');
  if (root.matches('.image-trail-panel__settings-utility-section') && !root.classList.contains('image-trail-ds__settings-group')) {
    root.classList.add('image-trail-ds__settings-integration');
  }
  for (const integration of Array.from(root.querySelectorAll<HTMLElement>('.image-trail-panel__settings-utility-section'))) {
    if (!integration.classList.contains('image-trail-ds__settings-group')) {
      integration.classList.add('image-trail-ds__settings-integration');
    }
  }
  for (const button of Array.from(root.querySelectorAll<HTMLButtonElement>('button'))) applyButtonContract(button);
  for (const input of Array.from(root.querySelectorAll<HTMLInputElement>('input'))) applyInputContract(input);
  for (const select of Array.from(root.querySelectorAll<HTMLSelectElement>('select'))) select.classList.add('image-trail-ds__select');
  for (const textarea of Array.from(root.querySelectorAll<HTMLTextAreaElement>('textarea'))) {
    textarea.classList.add('image-trail-ds__input');
  }
  for (const toggle of Array.from(
    root.querySelectorAll<HTMLElement>('.image-trail-panel__settings-checkbox, .image-trail-panel__toggle'),
  )) {
    toggle.classList.add('image-trail-ds__toggle');
  }
  for (const status of Array.from(root.querySelectorAll<HTMLElement>('.image-trail-panel__cloud-provider-status'))) {
    applyStatusContract(status);
  }
}

function applyStatusContract(status: HTMLElement): void {
  const connectionState =
    status.className
      .split(/\s+/u)
      .find((className: string) => className.startsWith('is-'))
      ?.slice(3) ?? 'neutral';
  status.classList.add('image-trail-ds__status-pill');
  status.dataset['tone'] = connectionState === 'disconnected' ? 'neutral' : connectionState;
  status.classList.toggle('is-waiting', connectionState === 'busy');
  if (connectionState === 'busy') status.setAttribute('aria-busy', 'true');
}

function applyButtonContract(button: HTMLButtonElement): void {
  const variant = buttonVariant(button);
  button.classList.add('image-trail-ds__button');
  button.dataset['variant'] = variant;
  if (button.classList.contains('is-waiting')) {
    button.setAttribute('aria-busy', 'true');
    button.setAttribute('aria-live', 'polite');
  }
}

function applyInputContract(input: HTMLInputElement): void {
  if (input.type === 'checkbox' || input.type === 'radio' || input.type === 'file') return;
  input.classList.add('image-trail-ds__input');
}

function buttonVariant(button: HTMLButtonElement): ButtonVariant {
  if (button.classList.contains('is-danger')) return 'danger';
  if (button.classList.contains('image-trail-panel__primary-action')) return 'primary';
  if (button.classList.contains('image-trail-panel__secondary-action')) return 'secondary';
  return 'ghost';
}
