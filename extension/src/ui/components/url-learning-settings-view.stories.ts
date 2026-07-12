import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent } from 'storybook/test';

import { parseUrl } from '../../core/url/parse-url.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import { createGrabSourcePattern, createUrlTemplateRecord } from '../../core/url/templates.js';
import { settingsGroupStory } from '../stories/settings-story-host.js';
import { createGrabSourcePatternSettingsView, createTemplateSettingsView } from './url-learning-settings-view.js';

const model = parseUrl('https://images.example.test/albums/1024/photo_0042.jpg');
const fields = collectUrlFields(model);
const template = createUrlTemplateRecord({ model, fields, includedFieldIds: [fields[0]!.id] });
if (!template) throw new Error('expected URL learning story template');
const pattern = createGrabSourcePattern({ model });
const dispatchSpy = fn();
const meta = {
  title: 'Extension UI/URL learning settings',
  render: () =>
    settingsGroupStory('URL learning', [
      createTemplateSettingsView([template], template.id, fields, dispatchSpy),
      createGrabSourcePatternSettingsView([pattern], dispatchSpy),
    ]),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TemplateControlsDispatch: Story = {
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const templateItem = canvasElement.querySelector('.image-trail-panel__settings-template-list li.is-active');
    if (!templateItem) throw new Error('expected active URL template');
    const match = templateItem.querySelector('select');
    if (!match) throw new Error('expected template match control');
    await userEvent.selectOptions(match, 'broad-site');
    await expect(dispatchSpy).toHaveBeenCalledWith({
      name: 'url-template/update-settings',
      id: template.id,
      matchMode: 'broad-site',
    });
    const autoApply = Array.from(templateItem.querySelectorAll('label')).find((label) => label.textContent?.includes('Auto-apply'));
    const checkbox = autoApply?.querySelector('input');
    if (!checkbox) throw new Error('expected template auto-apply control');
    await userEvent.click(checkbox);
    await expect(dispatchSpy).toHaveBeenCalledWith({
      name: 'url-template/update-settings',
      id: template.id,
      autoApplyEnabled: false,
    });
  },
};
