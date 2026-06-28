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

export const RestorePreviewReady: Story = {
  render: () =>
    importExportStory({
      restorePreview: {
        fileName: 'image-trail-bookmarks-2026-06-27.json',
        payloadLabel: 'Bookmarks',
        recordCount: 12,
        capturedOriginalCount: 8,
        duplicateCount: 1,
        skippedCount: 0,
        unsupportedCount: 0,
        message: 'Preview loaded. Import has not changed local records yet. 1 duplicate record will be skipped on confirm.',
        samples: [
          {
            label: 'quiet-ridge.jpg',
            url: 'https://images.example.test/gallery/quiet-ridge.jpg',
            detail: '1280 x 854, captured original metadata reference',
          },
          {
            label: 'night-market-frame-042.webp',
            url: 'https://cdn.example.test/sets/night-market/frame-042.webp',
            detail: '1920 x 1080, pin metadata only; Duplicate URL, skipped on confirm',
          },
          {
            label: 'archive scan 17.png',
            url: 'https://archive.example.test/scans/collection/17.png',
            detail: '900 x 1200, captured original metadata reference',
          },
        ],
      },
    }),
};

export const RestorePreviewNeedsReview: Story = {
  render: () =>
    importExportStory({
      restorePreview: {
        fileName: 'mixed-image-trail-restore.json',
        payloadLabel: 'Mixed restore payload',
        recordCount: 21,
        capturedOriginalCount: 14,
        skippedCount: 3,
        unsupportedCount: 2,
        plaintext: true,
        message: 'Some sections cannot be imported by this version.',
        messageIsError: true,
        samples: [
          {
            label: 'gallery-cover.avif',
            url: 'https://images.example.test/gallery/cover.avif',
            detail: 'Bookmark metadata with encrypted original reference',
          },
          {
            label: 'old history entry',
            url: 'https://legacy.example.test/path/photo-009.jpg',
            detail: 'History record, URL review status present',
          },
        ],
        unsupportedSections: [
          {
            label: 'automation presets',
            detail: 'Payload section is newer than this build.',
          },
          {
            label: 'duplicate originals',
            detail: 'Two blob entries have the same fingerprint.',
          },
        ],
      },
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

export const RestorePreviewNarrow: Story = {
  render: () =>
    importExportStory(
      {
        restorePreview: {
          fileName: 'image-trail-very-long-restore-file-name-2026-06-27.json',
          payloadLabel: 'Bookmarks',
          recordCount: 7,
          capturedOriginalCount: 4,
          skippedCount: 1,
          message: 'Preview loaded. Import has not changed local records yet.',
          samples: [
            {
              label: 'very-long-descriptive-filename-with-edition-and-source-marker.jpg',
              url: 'https://images.example.test/gallery/very-long-descriptive-filename-with-edition-and-source-marker.jpg',
              detail: '2048 x 1536, captured original included',
            },
          ],
        },
      },
      { width: 300 },
    ),
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

export const CloudBackupCollapsed: Story = {
  render: () =>
    cloudBackupStory(
      {
        connectionState: 'connected',
        apiHost: 'api.pcloud.com',
        folderPath: '/Image Trail/backups',
        message: 'Ready for manual encrypted backup.',
      },
      { collapsed: true },
    ),
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
      lastBackupName: 'image-trail-pcloud-backup-2026-06-27T16-24-00Z.image-trail-encrypted.json',
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
      restoreCandidates: [
        {
          fileId: 402,
          fileName: 'image-trail-pcloud-backup-2026-06-27T16-24-00Z.image-trail-encrypted.json',
          size: '428 KB',
          modifiedAt: 'Sat, 27 Jun 2026 16:24:00 +0000',
        },
        {
          fileId: 401,
          fileName: 'image-trail-pcloud-backup-2026-06-26T15-10-00Z.image-trail-encrypted.json',
          size: '392 KB',
          modifiedAt: 'Fri, 26 Jun 2026 15:10:00 +0000',
        },
      ],
      message: 'Found 2 encrypted pCloud backups.',
    }),
};

export const CloudBackupRestorePreviewReady: Story = {
  render: () =>
    cloudBackupStory({
      connectionState: 'connected',
      apiHost: 'api.pcloud.com',
      folderPath: '/Image Trail/backups',
      lastBackupName: 'image-trail-pcloud-backup-2026-06-28T00-51-15Z.image-trail-encrypted.json',
      lastBackupAt: '2026-06-28T00:51:22.335Z',
      lastBackupSize: '22.3 KB',
      lastBackupSha256: 'c5ac3697b905ae544fb9d8987ec2fe71c4283bd3afab62fd4740aaccf5a53925',
      restoreCandidateName: 'image-trail-pcloud-backup-2026-06-28T00-51-15Z.image-trail-encrypted.json',
      restoreCandidateSize: '22.3 KB',
      restoreDownloadedAt: '2026-06-28T00:51:50.135Z',
      restoreCandidateSha256: 'c5ac3697b905ae544fb9d8987ec2fe71c4283bd3afab62fd4740aaccf5a53925',
      restorePreview: {
        fileName: 'image-trail-pcloud-backup-2026-06-28T00-51-15Z.image-trail-encrypted.json',
        payloadLabel: 'Bookmarks',
        recordCount: 9,
        capturedOriginalCount: 4,
        duplicateCount: 1,
        skippedCount: 0,
        unsupportedCount: 0,
        message: 'Preview loaded. Import has not changed local records yet. 1 duplicate record will be skipped on confirm.',
        samples: [
          {
            label: 'quiet-ridge.jpg',
            url: 'https://images.example.test/gallery/quiet-ridge.jpg',
            detail: '1280 x 854, captured original metadata reference',
          },
          {
            label: 'frame-042.webp',
            url: 'https://cdn.example.test/sets/night-market/frame-042.webp',
            detail: 'Duplicate URL, skipped on confirm',
          },
        ],
      },
      message: 'Downloaded encrypted pCloud backup. Review the restore preview before importing.',
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
        lastBackupName: 'image-trail-pcloud-backup-2026-06-27T16-24-00Z.image-trail-encrypted.json',
        lastBackupAt: '2026-06-27 11:24 AM',
        lastBackupSize: '428 KB',
        lastBackupSha256: 'b6d9a5b7e33e4c0d8fbd8f9fd2a31e4282d9a89db3df91d7b0f8d2a5b0ec8d67',
      },
      { width: 300 },
    ),
};

function importExportStory(overrides: Partial<ImportExportStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  const view = createImportExportView(importExportState(overrides), mockDispatch('import export story action'));
  view.open = true;
  return panelStory(view, storyOptions);
}

function imageTransferStory(overrides: Partial<ImportExportStoryState> = {}, storyOptions: { readonly width?: number } = {}): HTMLElement {
  return panelStory(createImageTransferView(importExportState(overrides), mockDispatch('image transfer story action')), storyOptions);
}

function cloudBackupStory(
  overrides: Partial<CloudBackupStoryState> = {},
  storyOptions: { readonly width?: number; readonly collapsed?: boolean } = {},
): HTMLElement {
  const view = createCloudBackupView(cloudBackupState(overrides), mockDispatch('cloud backup story action'));
  setUtilityDetailsOpen(view, !storyOptions.collapsed);
  return panelStory(view, storyOptions);
}

function setUtilityDetailsOpen(view: HTMLDetailsElement, open: boolean): void {
  view.open = open;
  const summary = view.querySelector<HTMLElement>('.image-trail-panel__settings-utility-summary');
  const body = view.querySelector<HTMLElement>('.image-trail-panel__settings-utility-body');
  summary?.setAttribute('aria-expanded', String(open));
  if (body) body.hidden = !open;
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
