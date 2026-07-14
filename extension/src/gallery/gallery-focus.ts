export interface GalleryInputFocus {
  readonly ariaLabel: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  readonly selectionDirection: 'forward' | 'backward' | 'none' | null;
}

export function captureFocusedGalleryInput(container: HTMLElement): GalleryInputFocus | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement) || !container.contains(active)) return null;
  const ariaLabel = active.getAttribute('aria-label');
  if (!ariaLabel) return null;
  return {
    ariaLabel,
    selectionStart: active.selectionStart,
    selectionEnd: active.selectionEnd,
    selectionDirection: active.selectionDirection,
  };
}

export function restoreFocusedGalleryInput(container: HTMLElement, focus: GalleryInputFocus): void {
  const input = Array.from(container.querySelectorAll<HTMLInputElement>('input')).find(
    (candidate) => candidate.getAttribute('aria-label') === focus.ariaLabel,
  );
  if (!input || input.disabled) return;
  input.focus({ preventScroll: true });
  if (focus.selectionStart === null || focus.selectionEnd === null) return;
  input.setSelectionRange(focus.selectionStart, focus.selectionEnd, focus.selectionDirection ?? undefined);
}
