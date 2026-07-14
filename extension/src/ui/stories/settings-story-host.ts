import { panelStory } from './story-host.js';
import { applySettingsPrimitiveContracts } from '../components/settings-primitive-contracts.js';

export function settingsGroupStory(
  title: string,
  children: readonly HTMLElement[],
  storyOptions: { readonly width?: number } = {},
): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section image-trail-ds__settings';
  const heading = document.createElement('h3');
  heading.textContent = 'Settings';
  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section image-trail-ds__settings-group';
  group.open = true;
  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  const header = document.createElement('div');
  header.className = 'image-trail-panel__settings-utility-header image-trail-ds__settings-group-header';
  header.textContent = title;
  summary.append(header);
  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body image-trail-ds__settings-group-body';
  body.append(...children);
  group.append(summary, body);
  section.append(heading, group);
  applySettingsPrimitiveContracts(section);
  return panelStory(section, storyOptions);
}
