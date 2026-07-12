import { panelStory } from './story-host.js';

export function settingsGroupStory(title: string, children: readonly HTMLElement[]): HTMLElement {
  const section = document.createElement('section');
  section.className = 'image-trail-panel__section image-trail-panel__settings-section';
  const heading = document.createElement('h3');
  heading.textContent = 'Settings';
  const group = document.createElement('details');
  group.className = 'image-trail-panel__settings-templates image-trail-panel__settings-utility-section';
  group.open = true;
  const summary = document.createElement('summary');
  summary.className = 'image-trail-panel__settings-utility-summary';
  summary.textContent = title;
  const body = document.createElement('div');
  body.className = 'image-trail-panel__settings-utility-body';
  body.append(...children);
  group.append(summary, body);
  section.append(heading, group);
  return panelStory(section);
}
