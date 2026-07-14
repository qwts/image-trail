export interface ShortcutKeyBinding {
  readonly key: string;
  readonly shift?: boolean;
  readonly ctrl?: boolean;
  readonly alt?: boolean;
  readonly action: string;
  readonly display: string;
  readonly label: string;
  readonly description: string;
  readonly group: 'trail' | 'capture' | 'panel';
}

export type DownArrowAction = 'capture' | 'download' | 'off';

export const DOWN_ARROW_ACTION_OPTIONS: readonly { readonly value: DownArrowAction; readonly label: string }[] = [
  { value: 'capture', label: 'Capture original' },
  { value: 'download', label: 'Download image' },
  { value: 'off', label: 'Unassigned' },
];

export function isDownArrowAction(value: unknown): value is DownArrowAction {
  return value === 'capture' || value === 'download' || value === 'off';
}

export interface ShortcutReference {
  readonly keys: readonly string[];
  readonly label: string;
  readonly description: string;
}

export interface BrowserCommandShortcut {
  readonly command: string;
  readonly action: string;
  readonly label: string;
  readonly description: string;
  readonly manifestDescription: string;
}

export const PAGE_SHORTCUTS: readonly ShortcutKeyBinding[] = [
  {
    key: 'ArrowRight',
    shift: false,
    action: 'next',
    display: '→',
    label: 'Next trail step',
    description: 'Step included parsed fields forward.',
    group: 'trail',
  },
  {
    key: 'ArrowLeft',
    shift: false,
    action: 'previous',
    display: '←',
    label: 'Previous trail step',
    description: 'Step included parsed fields backward.',
    group: 'trail',
  },
  {
    key: 'c',
    action: 'capture-current',
    display: 'C',
    label: "Capture the current image's original",
    description: "Capture the current image's encrypted original.",
    group: 'capture',
  },
  {
    key: 'p',
    action: 'pin-current',
    display: 'P',
    label: 'Pin the current image',
    description: 'Save the current image link to the durable queue.',
    group: 'capture',
  },
  {
    key: 'b',
    action: 'capture-and-bookmark',
    display: 'B',
    label: 'Capture original & bookmark',
    description: 'Capture the original and save it as a durable bookmark.',
    group: 'capture',
  },
  {
    key: 'g',
    action: 'grab-mode-toggle',
    display: 'G',
    label: 'Toggle grab mode',
    description: 'Start or stop target-image grab mode.',
    group: 'capture',
  },
  {
    key: 'ArrowDown',
    shift: false,
    action: 'down-arrow',
    display: '↓',
    label: 'Assignable — Capture original or Download image (Settings › Automation)',
    description: 'Run Capture original or Download image, as assigned in Settings › Automation.',
    group: 'capture',
  },
  {
    key: '?',
    shift: true,
    action: 'help-toggle',
    display: '?',
    label: 'Toggle this help',
    description: 'Open or close the in-panel Help surface.',
    group: 'panel',
  },
  {
    key: ',',
    shift: false,
    action: 'settings-toggle',
    display: ',',
    label: 'Open settings',
    description: 'Open or close the Settings destination.',
    group: 'panel',
  },
  {
    key: 'Escape',
    shift: false,
    action: 'close-surface',
    display: 'Esc',
    label: 'Close the panel',
    description: 'Leave Help or a destination, then close the panel.',
    group: 'panel',
  },
];

export const BROWSER_COMMAND_SHORTCUTS: readonly BrowserCommandShortcut[] = [
  {
    command: 'shortcut-next',
    action: 'next',
    label: 'Next trail step',
    description: 'Run the same action as ArrowRight on the active Image Trail panel.',
    manifestDescription: 'Next Image Trail step (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-previous',
    action: 'previous',
    label: 'Previous trail step',
    description: 'Run the same action as ArrowLeft on the active Image Trail panel.',
    manifestDescription: 'Previous Image Trail step (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-download',
    action: 'download',
    label: 'Download image',
    description: 'Download the current image without a Save As prompt.',
    manifestDescription: 'Download current image (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-download-save-as',
    action: 'download-save-as',
    label: 'Download with Save As',
    description: 'Download the current image with a Save As prompt.',
    manifestDescription: 'Download current image with Save As (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-slideshow-toggle',
    action: 'slideshow-toggle',
    label: 'Slideshow',
    description: 'Start, pause, or resume slideshow navigation.',
    manifestDescription: 'Toggle Image Trail slideshow (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-stop',
    action: 'stop',
    label: 'Stop automation',
    description: 'Stop active slideshow and retry automation.',
    manifestDescription: 'Stop Image Trail automation (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-grab-mode-toggle',
    action: 'grab-mode-toggle',
    label: 'Grab mode',
    description: 'Start or stop target-image grab mode.',
    manifestDescription: 'Toggle Image Trail Grab Mode (assign in browser shortcuts)',
  },
  {
    command: 'shortcut-retry',
    action: 'retry',
    label: 'Retry navigation',
    description: 'Start retry automation for the current image.',
    manifestDescription: 'Retry Image Trail navigation (assign in browser shortcuts)',
  },
];
