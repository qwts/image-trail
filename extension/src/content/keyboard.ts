export type KeyTarget = 'typing' | 'button' | 'panel' | 'page';

export interface KeyBinding {
  readonly key: string;
  readonly shift?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly action: string;
}

export type KeyActionHandler = (action: string) => void;

export const DEFAULT_BINDINGS: KeyBinding[] = [
  { key: 'ArrowRight', action: 'next' },
  { key: 'ArrowLeft', action: 'previous' },
  { key: 'ArrowDown', action: 'download' },
  { key: ' ', action: 'slideshow-toggle' },
  { key: 'Escape', action: 'stop' },
  { key: 's', action: 'slideshow-toggle' },
  { key: 'p', action: 'panel-toggle' },
  { key: 'd', action: 'download' },
  { key: 'D', shift: true, action: 'download-save-as' },
  { key: 'Enter', shift: true, action: 'download-save-as' },
  { key: 'r', action: 'retry' },
];

export function classifyTarget(event: KeyboardEvent): KeyTarget {
  const composedTarget = event.composedPath?.()[0];
  const el = (composedTarget ?? event.target) as unknown as Record<string, unknown> | null;
  if (!el || typeof el['tagName'] !== 'string') return 'page';
  const tag = el['tagName'] as string;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return 'typing';
  if (el['isContentEditable'] === true) return 'typing';
  if (tag === 'BUTTON') return 'button';
  if (typeof el['closest'] === 'function' && (el as unknown as HTMLElement).closest('#image-trail-panel-root')) return 'panel';
  return 'page';
}

export function shouldRouteKeyboardShortcut(target: KeyTarget, action: string): boolean {
  if (target === 'typing') return false;
  // Keep native button activation intact; only the explicit download shortcuts are global from focused panel controls.
  if (target === 'button') return action === 'download' || action === 'download-save-as';
  return true;
}

function matchesBinding(event: KeyboardEvent, binding: KeyBinding): boolean {
  if (event.key !== binding.key) return false;
  if ((binding.shift ?? false) !== event.shiftKey) return false;
  if ((binding.ctrl ?? false) !== event.ctrlKey) return false;
  if ((binding.alt ?? false) !== event.altKey) return false;
  return true;
}

export class KeyboardRouter {
  private active = false;
  private bindings: KeyBinding[];

  constructor(
    private readonly handler: KeyActionHandler,
    bindings?: KeyBinding[],
  ) {
    this.bindings = bindings ?? [...DEFAULT_BINDINGS];
  }

  enable(): void {
    if (this.active) return;
    this.active = true;
    document.addEventListener('keydown', this.onKeyDown, true);
  }

  disable(): void {
    if (!this.active) return;
    this.active = false;
    document.removeEventListener('keydown', this.onKeyDown, true);
  }

  updateBindings(bindings: KeyBinding[]): void {
    this.bindings = bindings;
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const target = classifyTarget(event);

    for (const binding of this.bindings) {
      if (matchesBinding(event, binding)) {
        if (!shouldRouteKeyboardShortcut(target, binding.action)) return;
        event.preventDefault();
        event.stopPropagation();
        this.handler(binding.action);
        return;
      }
    }
  };
}
