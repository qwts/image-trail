import { createShortcutSettingsView } from './shortcut-settings-view.js';
import { applySettingsPrimitiveContracts } from './settings-primitive-contracts.js';
import { createSectionHeader } from './primitives.js';
import { createSettingsDisclosure } from './settings-disclosure.js';

/**
 * The in-panel Help surface: the shared shortcut registry plus concise workspace/about notes.
 * Static copy only; no page URL, record label, or original metadata enters this privacy-inert view.
 */
export function createHelpView(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__help-section image-trail-ds__help';

  const header = createSectionHeader({ title: '? Help', className: 'image-trail-panel__section-header' });

  const workspaceNote = document.createElement('p');
  workspaceNote.className = 'image-trail-panel__meta';
  workspaceNote.textContent =
    'Every workspace section can detach into a floating window. Drag its heading out, minimize it with −, and restore it with ×.';
  const about = document.createElement('p');
  about.className = 'image-trail-panel__meta';
  about.textContent = 'Image Trail keeps session Recents transient and durable pins in the extension-owned queue.';

  section.append(
    header,
    createSettingsDisclosure('Shortcuts', 'help-shortcuts', [createShortcutSettingsView()], { defaultOpen: true }),
    createSettingsDisclosure('Workspace', 'help-workspace', [workspaceNote]),
    createSettingsDisclosure('About', 'help-about', [about]),
  );
  applySettingsPrimitiveContracts(section);
  return section;
}
