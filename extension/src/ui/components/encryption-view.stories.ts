import type { Meta, StoryObj } from '@storybook/html-vite';

import { createEncryptionView } from './encryption-view.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

type EncryptionStoryState = Parameters<typeof createEncryptionView>[0];

const meta = {
  title: 'Extension UI/Encrypted originals',
  render: () => encryptionStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const SetupRequired: Story = {};

export const LockedWithBackup: Story = {
  render: () =>
    encryptionStory({
      hasKey: true,
      keyReference: 'blob:demo-key',
    }),
};

export const Busy: Story = {
  render: () =>
    encryptionStory({
      hasKey: true,
      keyReference: 'blob:demo-key',
      busy: true,
    }),
};

export const Unlocked: Story = {
  render: () =>
    encryptionStory({
      unlocked: true,
      hasKey: true,
      keyReference: 'restored backup key',
    }),
};

export const MaintenanceNeeded: Story = {
  render: () =>
    encryptionStory({
      unlocked: true,
      hasKey: true,
      abandonedOriginalCount: 3,
      keyReference: 'session key',
    }),
};

export const Narrow: Story = {
  render: () => encryptionStory({ hasKey: true, keyReference: 'blob:demo-key' }, { width: 300 }),
};

function encryptionStory(overrides: Partial<EncryptionStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createEncryptionView(encryptionState(overrides), mockDispatch('encryption story action')), storyOptions);
}

function encryptionState(overrides: Partial<EncryptionStoryState> = {}): EncryptionStoryState {
  return {
    unlocked: false,
    keyReference: null,
    hasKey: false,
    busy: false,
    abandonedOriginalCount: 0,
    ...overrides,
  };
}
