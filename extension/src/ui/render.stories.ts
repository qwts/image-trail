import type { Meta, StoryObj } from '@storybook/html-vite';

import type { PanelState } from '../core/types.js';
import { renderPanel, type PanelLayoutState } from './render.js';
import {
  bookmarkFixtures,
  originalDeletedQueueRecord,
  originalDeletedRecentRecord,
  recallState,
  recentFixtures,
} from './stories/fixtures.js';
import { mockDispatch } from './stories/story-host.js';

const meta = {
  title: 'Extension UI/Panel layout',
  render: () => panelLayoutStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const SettingsSectionOrder: Story = {
  render: () =>
    panelLayoutStory({
      settingsOpen: true,
      storageUsage: {
        blobCount: 14,
        totalBytes: 867_328,
        orphanedBlobCount: 1,
        originals: { count: 3, totalBytes: 742_400 },
        queueRecords: { count: 7, totalBytes: 86_016 },
        thumbnails: { count: 4, totalBytes: 38_912 },
      },
    }),
};

export const ParsedFieldFailedLoad: Story = {
  render: () =>
    panelLayoutStory({
      status: 'error',
      message: 'Image failed to load: HTTP 404',
      activeFieldId: 'q:0:0',
      failedFieldId: 'q:0:0',
      successfulFieldIds: ['q:1:0'],
      unchangedFieldIds: [],
      unlockedFieldIds: ['q:1:0'],
    }),
};

export const DeleteOriginalSynced: Story = {
  render: () =>
    panelLayoutStory({
      message: 'Original deleted. Queue and recent rows are synced.',
      history: [originalDeletedRecentRecord],
      bookmarks: [originalDeletedQueueRecord],
      bookmarkTotal: 1,
      recall: recallState({
        candidates: [{ ...originalDeletedQueueRecord, id: 'recall-original-deleted', envelopeCreatedAt: '2026-06-25T15:29:00.000Z' }],
        total: 1,
        nextOffset: 1,
      }),
    }),
};

export const SecondaryControlsCollapsed: Story = {
  render: () => panelLayoutStory({ secondaryControlsOpen: false }),
};

export const SecondaryControlsExpanded: Story = {
  render: () => panelLayoutStory({ secondaryControlsOpen: true }),
};

function panelLayoutStory(overrides: Partial<PanelState> = {}): HTMLElement {
  const host = document.createElement('div');
  host.className = 'image-trail-panel-root image-trail-panel';
  host.style.position = 'relative';
  host.style.inset = 'auto';
  host.style.margin = '16px';
  host.style.width = '380px';
  host.style.inlineSize = '380px';

  const layoutState: PanelLayoutState = {
    fieldsPanelOpen: true,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
  };

  renderPanel(
    {
      root: host,
      dispatch: mockDispatch('panel layout story action'),
      layoutState,
    },
    panelState(overrides),
    { renderRecall: false },
  );

  return host;
}

function panelState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    visible: true,
    minimized: false,
    status: 'ready',
    message: 'Image Trail is ready.',
    lastUpdatedAt: Date.parse('2026-06-25T15:30:00.000Z'),
    target: {
      mode: 'auto',
      picking: false,
      grabModeActive: false,
      candidateCount: 1,
      selectedUrl: 'https://images.example.test/gallery/2026/quiet-ridge-0042.jpg?page=17&color=0x2a&slug=quiet-ridge-final',
      selectedHandleId: 'target-current',
      selectedDimensions: '1280 x 854',
      fillScreen: false,
      objectFit: 'contain',
      message: '',
    },
    draftUrl: 'https://images.example.test/gallery/2026/quiet-ridge-0042.jpg?page=17&color=0x2a&slug=quiet-ridge-final',
    history: recentFixtures,
    recentHistoryLimit: 50,
    recentHistoryOverflowBehavior: 'drop-oldest',
    bookmarks: bookmarkFixtures,
    bookmarkOffset: 0,
    bookmarkLimit: 10,
    bookmarkTotal: bookmarkFixtures.length,
    bookmarkVisibilityScope: 'global',
    pinSaveStoragePreference: 'encrypted',
    privacyModeEnabled: false,
    urlReviewStatusLimit: 200,
    clearUrlReviewStatusAfterExport: false,
    requestThrottleMs: 250,
    requestThrottleMaxRequests: 60,
    requestThrottleWindowMs: 60_000,
    neighborPreloadEnabled: true,
    neighborPreloadRadius: 5,
    neighborPreloadCacheLimit: 20,
    secondaryControlsOpen: false,
    hasOlderBookmarks: false,
    hasNewerBookmarks: false,
    captureInProgress: false,
    captureResult: null,
    storageUsage: null,
    blobKeyUnlocked: true,
    blobKeyAvailable: true,
    blobKeyReference: 'session key',
    importExportBusy: false,
    pcloudBackup: {
      connectionState: 'disconnected',
    },
    settingsOpen: false,
    automation: {
      slideshowPhase: 'idle',
      slideshowCount: 0,
      retryPhase: 'idle',
      retriesUsed: 0,
      retriesMax: 3,
      governorStatus: 'ready',
      requestsInWindow: 0,
    },
    recall: recallState(),
    selectedHistoryIds: [],
    selectedBookmarkIds: [],
    activeFieldId: null,
    failedFieldId: null,
    successfulFieldIds: ['query-page'],
    unchangedFieldIds: [],
    unlockedFieldIds: [],
    manuallyExcludedFieldIds: [],
    fieldSplitSpecs: [],
    fieldDigitWidthSpecs: [],
    urlTemplates: [],
    grabSourcePatterns: [],
    activeUrlTemplateId: null,
    currentImageFingerprint: 'current-fingerprint',
    ...overrides,
  };
}
