import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { createUrlEditorView, type UrlEditorViewCallbacks } from './url-editor-view.js';
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
  render: () => urlEditorStory(urlEditorFixtures.draft, { hostUrl: urlEditorFixtures.current }),
};

export const ReviewNeededUrl: Story = {
  render: () => urlEditorStory(urlEditorFixtures.invalidDraft, { hostUrl: urlEditorFixtures.current }),
};

export const DataUrl: Story = {
  render: () => urlEditorStory(urlEditorFixtures.dataUrl, { isDataUrl: true }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByDisplayValue('data URL')).toBeDisabled();
  },
};

const applySpy = fn();
const rejectSpy = fn();

export const AppliesOnEnter: Story = {
  render: () => urlEditorStory(urlEditorFixtures.current, {}, {}, { onApply: applySpy, onRejectUnsupportedInput: rejectSpy }),
  play: async ({ canvasElement }) => {
    applySpy.mockClear();
    rejectSpy.mockClear();
    const canvas = within(canvasElement);
    const textarea = canvas.getByRole('textbox');
    await userEvent.click(textarea);
    await userEvent.keyboard('{Enter}');
    await expect(applySpy).toHaveBeenCalledWith(urlEditorFixtures.current);
    await userEvent.paste('data:image/png;base64,AAA');
    await expect(rejectSpy).toHaveBeenCalled();
    await expect(textarea).toHaveValue(urlEditorFixtures.current);
  },
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
  stateOverrides: { readonly hostUrl?: string | null; readonly isDataUrl?: boolean; readonly privacyMode?: boolean } = {},
  storyOptions: { readonly width?: number } = {},
  callbacks: UrlEditorViewCallbacks = { onApply: mockDispatch<string>('url editor apply') },
) {
  return panelStory(
    createUrlEditorView(
      {
        url,
        ...stateOverrides,
      },
      callbacks,
    ),
    storyOptions,
  );
}
