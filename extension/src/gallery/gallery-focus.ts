export interface GalleryControlFocus {
  readonly tagName: 'input' | 'select';
  readonly ariaLabel: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  readonly selectionDirection: 'forward' | 'backward' | 'none' | null;
}

export function captureFocusedGalleryControl(container: HTMLElement): GalleryControlFocus | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLInputElement || active instanceof HTMLSelectElement) || !container.contains(active)) return null;
  const ariaLabel = active.getAttribute('aria-label');
  if (!ariaLabel) return null;
  return {
    tagName: active instanceof HTMLInputElement ? 'input' : 'select',
    ariaLabel,
    selectionStart: active instanceof HTMLInputElement ? active.selectionStart : null,
    selectionEnd: active instanceof HTMLInputElement ? active.selectionEnd : null,
    selectionDirection: active instanceof HTMLInputElement ? active.selectionDirection : null,
  };
}

export function restoreFocusedGalleryControl(container: HTMLElement, focus: GalleryControlFocus): void {
  const control = Array.from(container.querySelectorAll<HTMLInputElement | HTMLSelectElement>(focus.tagName)).find(
    (candidate) => candidate.getAttribute('aria-label') === focus.ariaLabel,
  );
  if (!control || control.disabled) return;
  control.focus({ preventScroll: true });
  if (!(control instanceof HTMLInputElement) || focus.selectionStart === null || focus.selectionEnd === null) return;
  control.setSelectionRange(focus.selectionStart, focus.selectionEnd, focus.selectionDirection ?? undefined);
}
