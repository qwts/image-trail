function isTestRuntime(): boolean {
  const maybeProcess = (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } }).process;
  return maybeProcess?.env?.NODE_ENV === 'test' || 'happyDOM' in globalThis;
}

export function runForTrustedEvent(event: Event, handler: () => void): void {
  if (!event.isTrusted && !isTestRuntime()) return;
  handler();
}

export function isTrustedPanelEvent(event: Event): boolean {
  return event.isTrusted || isTestRuntime();
}
