export function dispatchTrustedClick(button: HTMLButtonElement): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  markTrusted(event);
  button.dispatchEvent(event);
  return event;
}

export function dispatchTrustedKeydown(target: EventTarget, key: string, options: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...options });
  markTrusted(event);
  target.dispatchEvent(event);
  return event;
}

function markTrusted(event: Event): void {
  Object.defineProperty(event, 'isTrusted', { value: true });
}
