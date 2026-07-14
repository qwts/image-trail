import type { Meta, StoryObj } from '@storybook/html-vite';

import type { TargetState } from '../../core/types.js';
import { createTargetPickerView } from '../react/target-picker-view.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Host target',
  render: () => targetStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Selected: Story = {};

export const NeedsSelection: Story = {
  render: () =>
    targetStory({
      mode: 'manual',
      candidateCount: 4,
      selectedUrl: null,
      selectedHandleId: null,
      selectedDimensions: null,
    }),
};

export const Picking: Story = {
  render: () =>
    targetStory({
      picking: true,
      candidateCount: 6,
      selectedUrl: null,
      selectedHandleId: null,
      selectedDimensions: null,
    }),
};

export const GrabMode: Story = {
  render: () =>
    targetStory({
      grabModeActive: true,
      candidateCount: 8,
      selectedUrl: null,
      selectedHandleId: null,
      selectedDimensions: null,
    }),
};

export const FillScreenActive: Story = {
  render: () =>
    targetStory({
      fillScreen: true,
      objectFit: 'cover',
    }),
};

export const PrivacyMasked: Story = {
  render: () => targetStory({}, { privacyMode: true }),
};

export const LongOverflow: Story = {
  render: () =>
    targetStory({
      selectedUrl:
        'https://images.example.test/gallery/2026/06/25/camera-a/exports/very-long-gallery-name-with-color-pass-and-review-notes/quiet-ridge-final-frame-00000042-ultra-wide.jpg?session=screen-review&token=long-target-story-fixture',
    }),
};

export const Narrow: Story = {
  render: () => targetStory({}, {}, { width: 300 }),
};

function targetStory(
  overrides: Partial<TargetState> = {},
  options: { readonly privacyMode?: boolean } = {},
  storyOptions: { readonly width?: number } = {},
): HTMLElement {
  return panelStory(createTargetPickerView(targetState(overrides), mockDispatch('target story action'), options), storyOptions);
}

function targetState(overrides: Partial<TargetState> = {}): TargetState {
  return {
    mode: 'auto',
    picking: false,
    grabModeActive: false,
    candidateCount: 1,
    selectedUrl: 'https://images.example.test/gallery/current-target.jpg',
    selectedHandleId: 'target-current',
    selectedDimensions: '1280 x 854',
    fillScreen: false,
    objectFit: 'contain',
    message: '',
    ...overrides,
  };
}
