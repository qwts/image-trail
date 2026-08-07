export interface SectionToggleOptions {
  readonly open: boolean;
  readonly sectionLabel?: string;
  readonly onToggle?: (open: boolean) => void;
  readonly disabled?: boolean;
}

export function createSectionToggle(options: SectionToggleOptions): HTMLButtonElement {
  let open = options.open;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'image-trail-ds__button image-trail-ds__section-toggle';
  toggle.dataset['variant'] = 'ghost';
  toggle.disabled = options.disabled === true || !options.onToggle;
  toggle.addEventListener('click', () => {
    open = !open;
    syncSectionToggle(toggle, open, options.sectionLabel);
    options.onToggle?.(open);
  });
  syncSectionToggle(toggle, open, options.sectionLabel);
  return toggle;
}

function syncSectionToggle(toggle: HTMLButtonElement, open: boolean, sectionLabel?: string): void {
  toggle.textContent = open ? 'Hide' : 'Show';
  toggle.setAttribute('aria-expanded', String(open));
  if (sectionLabel) toggle.setAttribute('aria-label', `${open ? 'Hide' : 'Show'} ${sectionLabel}`);
}
