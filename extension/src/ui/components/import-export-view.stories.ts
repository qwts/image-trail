import type { Meta, StoryObj } from '@storybook/html-vite';

import { createCloudBackupView, createImageTransferView, createImportExportView } from './import-export-view.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

type ImportExportStoryState = Parameters<typeof createImportExportView>[0];
type CloudBackupStoryState = Parameters<typeof createCloudBackupView>[0];

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

export const CloudBackupDisconnected: Story = {
  render: () => cloudBackupStory(),
};

export const CloudBackupConnected: Story = {
  render: () =>
    cloudBackupStory({
      connectionState: 'connected',
      apiHost: 'api.pcloud.com',
      folderPath: '/Image Trail/backups',
      message: 'Ready for manual encrypted backup.',
    }),
};

export const CloudBackupBackingUp: Story = {
  render: () =>
    cloudBackupStory({
      connectionState: 'busy',
      pendingOperation: 'backing-up',
      apiHost: 'api.pcloud.com',
      folderPath: '/Image Trail/backups',
      message: 'Uploading encrypted backup to pCloud...',
    }),
};

export const CloudBackupVerified: Story = {
  render: () =>
    cloudBackupStory({
      connectionState: 'connected',
      apiHost: 'api.pcloud.com',
      folderPath: '/Image Trail/backups',
      lastBackupAt: '2026-06-27 11:24 AM',
      lastBackupSize: '428 KB',
      lastBackupSha256: 'b6d9a5b7e33e4c0d8fbd8f9fd2a31e4282d9a89db3df91d7b0f8d2a5b0ec8d67',
      message: 'Last backup uploaded and verified byte-for-byte.',
    }),
};

export const CloudBackupRestoreAvailable: Story = {
  render: () =>
    cloudBackupStory({
      connectionState: 'connected',
      apiHost: 'api.pcloud.com',
      folderPath: '/Image Trail/backups',
      restoreCandidateName: 'image-trail-backup-2026-06-27.image-trail-encrypted.json',
      restoreCandidateSize: '428 KB',
      message: 'Restore preview is tracked separately and will run before import.',
    }),
};

export const CloudBackupError: Story = {
  render: () =>
    cloudBackupStory({
      connectionState: 'error',
      apiHost: 'eapi.pcloud.com',
      folderPath: '/Image Trail/backups',
      message: 'pCloud upload failed after the encrypted backup was created locally.',
      messageIsError: true,
    }),
};

export const CloudBackupNarrow: Story = {
  render: () =>
    cloudBackupStory(
      {
        connectionState: 'connected',
        apiHost: 'api.pcloud.com',
        folderPath: '/Image Trail/backups',
        lastBackupAt: '2026-06-27 11:24 AM',
        lastBackupSize: '428 KB',
        lastBackupSha256: 'b6d9a5b7e33e4c0d8fbd8f9fd2a31e4282d9a89db3df91d7b0f8d2a5b0ec8d67',
      },
      { width: 300 },
    ),
};

function importExportStory(overrides: Partial<ImportExportStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createImportExportView(importExportState(overrides), mockDispatch('import export story action')), storyOptions);
}

function imageTransferStory(overrides: Partial<ImportExportStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createImageTransferView(importExportState(overrides), mockDispatch('image transfer story action')), storyOptions);
}

function cloudBackupStory(overrides: Partial<CloudBackupStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createCloudBackupView(cloudBackupState(overrides), mockDispatch('cloud backup story action')), storyOptions);
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

function cloudBackupState(overrides: Partial<CloudBackupStoryState> = {}): CloudBackupStoryState {
  return {
    provider: 'pcloud',
    connectionState: 'disconnected',
    message: 'Connect pCloud to create manual encrypted backups.',
    ...overrides,
  };
}
