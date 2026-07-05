export interface ShortcutKeyBinding {
  readonly key: string;
  readonly shift?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly action: string;
  readonly display: string;
  readonly label: string;
  readonly description: string;
}

export interface ShortcutReference {
  readonly keys: readonly string[];
  readonly label: string;
  readonly description: string;
}

export const PAGE_SHORTCUTS: readonly ShortcutKeyBinding[] = [
  {
    key: 'ArrowRight',
    action: 'next',
    display: 'ArrowRight',
    label: 'Next trail step',
    description: 'Step included parsed fields forward.',
  },
  {
    key: 'ArrowLeft',
    action: 'previous',
    display: 'ArrowLeft',
    label: 'Previous trail step',
    description: 'Step included parsed fields backward.',
  },
  {
    key: 'ArrowDown',
    action: 'download',
    display: 'ArrowDown',
    label: 'Download image',
    description: 'Download the current image without a Save As prompt.',
  },
  {
    key: ' ',
    action: 'slideshow-toggle',
    display: 'Space',
    label: 'Slideshow',
    description: 'Start, pause, or resume slideshow navigation.',
  },
  {
    key: 'Escape',
    action: 'stop',
    display: 'Escape',
    label: 'Stop automation',
    description: 'Stop active slideshow and retry automation.',
  },
  {
    key: 's',
    action: 'buffer-debug-toggle',
    display: 'S',
    label: 'Buffer debug',
    description: 'Toggle the buffered navigation debug display.',
  },
  {
    key: 'p',
    action: 'panel-toggle',
    display: 'P',
    label: 'Hide panel',
    description: 'Close the in-page panel. Reopen it from the extension button or assigned browser shortcut.',
  },
  {
    key: 'd',
    action: 'download',
    display: 'D',
    label: 'Download image',
    description: 'Download the current image without a Save As prompt.',
  },
  {
    key: 'D',
    shift: true,
    action: 'download-save-as',
    display: 'Shift+D',
    label: 'Download with Save As',
    description: 'Download the current image with a Save As prompt.',
  },
  {
    key: 'G',
    shift: true,
    action: 'grab-mode-toggle',
    display: 'Shift+G',
    label: 'Grab mode',
    description: 'Start or stop target-image grab mode.',
  },
  {
    key: 'Enter',
    shift: true,
    action: 'download-save-as',
    display: 'Shift+Enter',
    label: 'Download with Save As',
    description: 'Download the current image with a Save As prompt.',
  },
  {
    key: 'r',
    action: 'retry',
    display: 'R',
    label: 'Retry navigation',
    description: 'Start retry automation for the current image.',
  },
];

export const BROWSER_SHORTCUTS: readonly ShortcutReference[] = [
  {
    keys: ['Extension button', 'Browser shortcut'],
    label: 'Open or hide panel',
    description: 'Use the toolbar button or assign the Image Trail action in browser extension shortcuts.',
  },
  {
    keys: ['Alt+Shift+B'],
    label: 'Build identity overlay',
    description: 'Toggle the local build identity overlay when build identity is available.',
  },
];

export const LEGACY_SHORTCUT_DECISIONS: readonly ShortcutReference[] = [
  {
    keys: ['A-Z'],
    label: 'Legacy field jumps not assigned',
    description: 'Use field rows directly; Prev/Next and arrows step included navigable fields together.',
  },
  {
    keys: ['H'],
    label: 'Legacy grayscale hide not assigned',
    description: 'Use P to hide the panel; selected-image styling remains controlled by target display settings.',
  },
];
