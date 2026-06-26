import type { Meta, StoryObj } from '@storybook/html-vite';

import { createImageTransferView, createImportExportView } from './import-export-view.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

type ImportExportStoryState = Parameters<typeof createImportExportView>[0];

const meta = {
  title: 'Extension UI/Import and export',
  render: () => importExportStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const RecordsReady: Story = {};

export const Busy: Story = {
  render: () =>
    importExportStory({
      busy: true,
      lastMessage: 'Exporting encrypted bookmark records...',
    }),
};

export const Error: Story = {
  render: () =>
    importExportStory({
      lastMessage: 'Import failed: backup password did not unlock this file.',
      lastMessageIsError: true,
    }),
};

export const ImageUtilitiesReady: Story = {
  render: () => imageTransferStory(),
};

export const ImageUtilitiesLocked: Story = {
  render: () =>
    imageTransferStory({
      blobKeyUnlocked: false,
      encryptedImageTransferAvailable: false,
      lastMessage: 'Unlock encrypted originals before importing encrypted image files.',
      lastMessageIsError: true,
    }),
};

export const ImageUtilitiesError: Story = {
  render: () =>
    imageTransferStory({
      lastMessage: 'Some selected files were skipped because they were not images.',
      lastMessageIsError: true,
    }),
};

export const Narrow: Story = {
  render: () => importExportStory({}, { width: 300 }),
};

function importExportStory(overrides: Partial<ImportExportStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createImportExportView(importExportState(overrides), mockDispatch('import export story action')), storyOptions);
}

function imageTransferStory(overrides: Partial<ImportExportStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createImageTransferView(importExportState(overrides), mockDispatch('image transfer story action')), storyOptions);
}

function importExportState(overrides: Partial<ImportExportStoryState> = {}): ImportExportStoryState {
  return {
    busy: false,
    currentImageUrl: 'https://images.example.test/gallery/quiet-ridge.jpg',
    selectedHistoryCount: 2,
    selectedBookmarkCount: 1,
    selectedImageDownloadCount: 3,
    visibleImageSelectionCount: 5,
    imageDownloadAvailable: true,
    encryptedImageTransferAvailable: true,
    blobKeyUnlocked: true,
    ...overrides,
  };
}
