import { BROWSER_SHORTCUTS, LEGACY_SHORTCUT_DECISIONS, PAGE_SHORTCUTS, type ShortcutReference } from '../../core/keyboard-shortcuts.js';

export function createShortcutSettingsView(): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'image-trail-panel__settings-templates';

  const heading = document.createElement('h4');
  heading.textContent = 'Keyboard shortcuts';

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

  wrapper.append(heading, browserHeading, browserList, panelHeading, panelList, legacyHeading, legacyList);
  return wrapper;
}

function createShortcutList(shortcuts: readonly ShortcutReference[]): HTMLElement {
  const list = document.createElement('dl');
  list.className = 'image-trail-panel__build-identity';
  for (const shortcut of shortcuts) {
    appendKeyValueRow(list, shortcut.keys.join(' / '), `${shortcut.label}: ${shortcut.description}`);
  }
  return list;
}

function appendKeyValueRow(list: HTMLDListElement, label: string, value: string): void {
  const key = document.createElement('dt');
  key.textContent = label;
  const data = document.createElement('dd');
  data.textContent = value;
  list.append(key, data);
}
