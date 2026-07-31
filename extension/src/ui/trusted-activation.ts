import { isTrustedActivation } from '../core/trusted-activation.js';

export function bindTrustedClick(
  element: HTMLElement,
  onClick: (event: MouseEvent) => void,
  options: { readonly beforeTrustCheck?: (event: MouseEvent) => void } = {},
): void {
  element.addEventListener('click', (event) => {
    options.beforeTrustCheck?.(event);
    if (!isTrustedActivation(event)) return;
    onClick(event);
  });
}
