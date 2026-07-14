const settingsGroupsOpen = new Map<string, boolean>();

export interface SettingsDisclosureOptions {
  readonly defaultOpen?: boolean;
}

export function createSettingsDisclosure(
  title: string,
  id: string,
  children: readonly HTMLElement[],
  options: SettingsDisclosureOptions = {},
): HTMLDetailsElement {
  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section image-trail-ds__settings-group';
  group.open = settingsGroupsOpen.get(id) ?? options.defaultOpen === true;
  group.addEventListener('toggle', () => settingsGroupsOpen.set(id, group.open));

  const heading = document.createElement('h4');
  heading.textContent = title;
  const header = document.createElement('div');
  header.className = 'image-trail-panel__settings-utility-header image-trail-ds__settings-group-header';
  header.append(heading);
  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.append(header);
  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body image-trail-ds__settings-group-body';
  body.append(...children);
  group.append(summary, body);
  return group;
}
