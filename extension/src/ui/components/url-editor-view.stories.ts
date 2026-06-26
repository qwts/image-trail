import type { Meta, StoryObj } from '@storybook/html-vite';

import { createUrlEditorView } from './url-editor-view.js';
import { urlEditorFixtures } from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/URL editor',
  render: () => urlEditorStory(urlEditorFixtures.current),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const CurrentUrl: Story = {};

export const Empty: Story = {
  render: () => urlEditorStory(null),
};

export const DraftUrl: Story = {
  render: () => urlEditorStory(urlEditorFixtures.draft),
};

export const ReviewNeededUrl: Story = {
  render: () => urlEditorStory(urlEditorFixtures.invalidDraft),
};

export const DataUrl: Story = {
  render: () => urlEditorStory(urlEditorFixtures.dataUrl, { isDataUrl: true }),
};

export const PrivacyMasked: Story = {
  render: () => urlEditorStory(urlEditorFixtures.current, { privacyMode: true }),
};

export const LongOverflow: Story = {
  render: () => urlEditorStory(urlEditorFixtures.long),
};

export const Narrow: Story = {
  render: () => urlEditorStory(urlEditorFixtures.long, {}, { width: 300 }),
};

function urlEditorStory(
  url: string | null,
  stateOverrides: { readonly isDataUrl?: boolean; readonly privacyMode?: boolean } = {},
  storyOptions: { readonly width?: number } = {},
) {
  return panelStory(
    createUrlEditorView(
      {
        url,
        ...stateOverrides,
      },
      {
        onApply: mockDispatch<string>('url editor apply'),
      },
    ),
    storyOptions,
  );
}
