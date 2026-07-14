import { createShortcutSettingsView } from './shortcut-settings-view.js';
import { applySettingsPrimitiveContracts } from './settings-primitive-contracts.js';
import { createSectionHeader } from './primitives.js';
import { createSettingsDisclosure } from './settings-disclosure.js';

interface HelpFeatureEntry {
  readonly label: string;
  readonly description: string;
}

// Static reference copy ONLY (#352): no URLs, record labels, or captured-original details may
// appear here, so the surface is privacy-inert by construction and needs no privacy masking.
const HELP_FEATURES: readonly HelpFeatureEntry[] = [
  {
    label: 'Host target',
    description: 'Pick a host image on the page (or use Grab Mode); Image Trail projects loaded images into it.',
  },
  {
    label: 'URL editor',
    description: 'Inspect the current image address or paste an http/https image URL and Apply to load it.',
  },
  {
    label: 'Field Editor',
    description:
      'Numeric URL segments become steppable fields. Step one with −/+, or Include fields so Prev/Next and the arrow keys walk them together. Reset all returns to the first edit of the session.',
  },
  {
    label: 'Recents',
    description:
      'Successful loads appear newest-first and last for the session only. Click selects a row; double-click (or Enter) projects it; Pin saves it to the queue.',
  },
  {
    label: 'Queue',
    description:
      'Durable pins and bookmarks. Pin current saves the current image; Recall browses offloaded records and moves selected ones back into the visible queue.',
  },
  {
    label: 'Captured originals',
    description:
      'Capture stores the original image bytes encrypted; unlock with your encrypted-originals password to preview or export them.',
  },
  {
    label: 'Import, export, and backup',
    description: 'Settings → Image utilities exports images or encrypted records, imports them back, and runs manual cloud backups.',
  },
  {
    label: 'Automation',
    description:
      'Slideshow and retry step included fields on a schedule under the request throttle. Escape stops slideshow, retry, and queued navigation.',
  },
  {
    label: 'Settings',
    description: 'The gear toggles grouped settings: Display, Privacy, Automation, Utilities, and System.',
  },
];

/**
 * The in-panel Help surface (#352): the shared shortcut reference (same registry the keyboard
 * router and Settings use, so bindings cannot drift from the copy) plus a concise feature guide
 * for each major panel area.
 */
export function createHelpView(): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__help-section image-trail-ds__help';

  const header = createSectionHeader({ title: 'Help', className: 'image-trail-panel__section-header' });

  const features = document.createElement('dl');
  features.className = 'image-trail-panel__help-features';
  for (const feature of HELP_FEATURES) {
    const label = document.createElement('dt');
    label.textContent = feature.label;
    const description = document.createElement('dd');
    description.textContent = feature.description;
    features.append(label, description);
  }

  const workspaceNote = document.createElement('p');
  workspaceNote.className = 'image-trail-panel__meta';
  workspaceNote.textContent =
    'Every workspace section can detach into a floating window. Drag a section heading out, minimize the window with −, and restore it with ×.';
  const about = document.createElement('p');
  about.className = 'image-trail-panel__meta';
  about.textContent = 'Image Trail keeps session Recents transient and durable pins in the extension-owned queue.';

  section.append(
    header,
    createSettingsDisclosure('Shortcuts', 'help-shortcuts', [createShortcutSettingsView()], { defaultOpen: true }),
    createSettingsDisclosure('Workspace', 'help-workspace', [workspaceNote, features]),
    createSettingsDisclosure('About', 'help-about', [about]),
  );
  applySettingsPrimitiveContracts(section);
  return section;
}
