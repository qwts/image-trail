import { BROWSER_SHORTCUTS, LEGACY_SHORTCUT_DECISIONS, PAGE_SHORTCUTS, type ShortcutReference } from '../../core/keyboard-shortcuts.js';

export function createShortcutSettingsView(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const browserHeading = document.createElement('h5');
  browserHeading.textContent = 'Browser shortcuts';
  const browserList = createShortcutList(BROWSER_SHORTCUTS);

  const panelHeading = document.createElement('h5');
  panelHeading.textContent = 'Panel shortcuts';
  const panelList = createShortcutList(
    PAGE_SHORTCUTS.map((shortcut) => ({
      keys: [shortcut.display],
      label: shortcut.label,
      description: shortcut.description,
    })),
  );

  const legacyHeading = document.createElement('h5');
  legacyHeading.textContent = 'Legacy keys';
  const legacyList = createShortcutList(LEGACY_SHORTCUT_DECISIONS);

  wrapper.append(browserHeading, browserList, panelHeading, panelList, legacyHeading, legacyList);
  return wrapper;
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
  row.className = 'image-trail-panel__shortcut-row';

  const keys = document.createElement('div');
  keys.className = 'image-trail-panel__shortcut-keys';
  for (const key of shortcut.keys) {
    const keyChip = document.createElement('kbd');
    keyChip.textContent = key;
    keys.append(keyChip);
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
