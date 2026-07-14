import { BROWSER_COMMAND_SHORTCUTS, PAGE_SHORTCUTS, type ShortcutReference } from '../../core/keyboard-shortcuts.js';
import { createKbd } from './primitives.js';

const SHORTCUT_GROUPS = [
  { id: 'trail', label: 'Trail navigation' },
  { id: 'capture', label: 'Capture' },
  { id: 'panel', label: 'Panel' },
] as const;

export function createShortcutSettingsView(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates image-trail-ds__shortcut-reference';

  for (const group of SHORTCUT_GROUPS) {
    const heading = document.createElement('h5');
    heading.textContent = group.label;
    const shortcuts = group.id === 'trail' ? trailShortcutReference() : shortcutReferencesForGroup(group.id);
    wrapper.append(heading, createShortcutList(shortcuts));
    if (group.id === 'trail') wrapper.append(createTrailNote());
  }
  wrapper.append(createBrowserCommandNote());
  return wrapper;
}

function trailShortcutReference(): readonly ShortcutReference[] {
  const previous = PAGE_SHORTCUTS.find((shortcut) => shortcut.action === 'previous');
  const next = PAGE_SHORTCUTS.find((shortcut) => shortcut.action === 'next');
  if (!previous || !next) return [];
  return [
    {
      keys: [previous.display, next.display],
      label: 'Step to the previous / next image in the trail',
      description: `${previous.description} ${next.description}`,
    },
  ];
}

function shortcutReferencesForGroup(group: 'capture' | 'panel'): readonly ShortcutReference[] {
  return PAGE_SHORTCUTS.filter((shortcut) => shortcut.group === group).map((shortcut) => ({
    keys: [shortcut.display],
    label: shortcut.label,
    description: shortcut.description,
  }));
}

function createTrailNote(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'image-trail-panel__meta';
  note.textContent =
    'Arrow keys decrement / increment every parsed field included in the Trail together — usually one field, but multiple fields advance in lockstep.';
  return note;
}

function createBrowserCommandNote(): HTMLElement {
  const note = document.createElement('p');
  note.className = 'image-trail-panel__meta image-trail-panel__browser-command-note';
  note.textContent = `Modifier shortcuts — ${BROWSER_COMMAND_SHORTCUTS.map((shortcut) => shortcut.label).join(', ')} — are browser commands you rebind in your browser's extension keyboard shortcuts page. The single-key shortcuts above are handled in-page by Image Trail.`;
  return note;
}

function createShortcutList(shortcuts: readonly ShortcutReference[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'image-trail-panel__shortcut-list';
  for (const shortcut of shortcuts) {
    list.append(createShortcutRow(shortcut));
  }
  return list;
}

function createShortcutRow(shortcut: ShortcutReference): HTMLElement {
  const row = document.createElement('div');
  row.className = 'image-trail-panel__shortcut-row image-trail-ds__shortcut-row';

  const keys = document.createElement('div');
  keys.className = 'image-trail-panel__shortcut-keys';
  for (const key of shortcut.keys) {
    keys.append(createKbd(key));
  }

  const body = document.createElement('div');
  body.className = 'image-trail-panel__shortcut-body';

  const label = document.createElement('strong');
  label.textContent = shortcut.label;

  const description = document.createElement('span');
  description.textContent = shortcut.description;

  body.append(label, description);
  row.append(keys, body);
  return row;
}
