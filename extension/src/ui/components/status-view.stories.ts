import type { Meta, StoryObj } from '@storybook/html-vite';

import type { PanelAction, PanelState } from '../../core/types.js';
import { createInitialPanelState } from '../../core/state.js';
import { DEFAULT_SEARCHABLE_METADATA_POLICY } from '../../core/metadata-policy.js';
import { createStatusView } from './status-view.js';
import { createPanelHeader, panelHasError, panelIsWaiting, renderPanelToast } from './panel-shell-view.js';
import { bookmarkFixtures, recallState, recentFixtures } from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Status and async cues',
  render: () => statusStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {};

export const Capturing: Story = {
  render: () =>
    statusStory({
      status: 'ready',
      message: 'Capturing selected image original.',
      captureInProgress: true,
    }),
};

export const CapturePermissionError: Story = {
  render: () =>
    statusStory({
      status: 'error',
      message: 'Capture needs attention.',
      captureResult: {
        status: 'failed',
        reason: 'permission-needed',
        message: '',
        origin: 'https://cdn.example.test',
      },
      captureRetryRequest: {
        url: 'https://cdn.example.test/gallery/current.jpg',
        sourceType: 'target',
      },
    }),
};

export const PrivacyMaskedErrorToast: Story = {
  render: () =>
    statusStory({
      status: 'error',
      privacyModeEnabled: true,
      message: 'Loaded bookmark: https://private.example.test/originals/private-image.jpg',
      captureResult: {
        status: 'failed',
        reason: 'permission-needed',
        message: '',
        origin: 'https://private.example.test',
      },
      captureRetryRequest: {
        url: 'https://private.example.test/originals/private-image.jpg',
        sourceType: 'bookmark',
        sourceRecordId: 'bookmark-private',
      },
    }),
};

export const RetryAndRateLimit: Story = {
  render: () =>
    statusStory({
      status: 'ready',
      message: 'Automation is waiting on request governance.',
      automation: {
        slideshowPhase: 'paused',
        slideshowCount: 12,
        retryPhase: 'running',
        retriesUsed: 2,
        retriesMax: 5,
        governorStatus: 'throttled',
        requestsInWindow: 5,
      },
    }),
};

export const StorageUsage: Story = {
  render: () =>
    statusStory({
      storageUsage: {
        blobCount: 3,
        totalBytes: 18_432_000,
        orphanedBlobCount: 1,
      },
    }),
};

function statusStory(overrides: Partial<PanelState> = {}): HTMLElement {
  const state = panelState(overrides);
  const wrapper = document.createElement('div');
  const story = panelStory(statusStoryContent(state));
  const toast = document.createElement('div');
  renderPanelToast(toast, state);
  story.classList.toggle('is-waiting', panelIsWaiting(state));
  story.classList.toggle('has-status-error', panelHasError(state));
  wrapper.append(story, toast);
  return wrapper;
}

function statusStoryContent(state: PanelState): HTMLElement {
  const fragment = document.createElement('div');
  const dispatch = mockDispatch<PanelAction>('status story action');
  fragment.append(createPanelHeader(state, { dispatch }), createStatusView(state, dispatch));
  return fragment;
}

function panelState(overrides: Partial<PanelState> = {}): PanelState {
  const initial = createInitialPanelState(0);
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
      selectedUrl: 'https://images.example.test/gallery/current.jpg',
      selectedHandleId: 'target-current',
      selectedDimensions: '1280 x 854',
      fillScreen: false,
      objectFit: 'contain',
      message: '',
    },
    draftUrl: 'https://images.example.test/gallery/current.jpg',
    history: recentFixtures,
    recentHistoryLimit: 50,
    recentHistoryRetainedLimit: 50,
    recentHistoryOverflowBehavior: 'drop-oldest',
    bookmarks: bookmarkFixtures,
    bookmarkOffset: 0,
    bookmarkLimit: 10,
    bookmarkTotal: bookmarkFixtures.length,
    bookmarkVisibilityScope: 'global',
    pinSaveStoragePreference: 'encrypted',
    privacyModeEnabled: false,
    searchableMetadataPolicy: DEFAULT_SEARCHABLE_METADATA_POLICY,
    urlReviewStatusLimit: 200,
    clearUrlReviewStatusAfterExport: false,
    requestThrottleMs: 250,
    requestThrottleMaxRequests: 60,
    requestThrottleWindowMs: 60_000,
    neighborPreloadEnabled: true,
    neighborPreloadRadius: 5,
    neighborPreloadCacheLimit: 20,
    neighborPreloadProbeMethod: 'get',
    loadFailureFeedback: 'mute',
    hasOlderBookmarks: false,
    hasNewerBookmarks: false,
    captureInProgress: false,
    captureResult: null,
    captureRetryRequest: null,
    storageUsage: null,
    blobKeyUnlocked: true,
    blobKeyAvailable: true,
    blobKeyReference: 'session key',
    importExportBusy: false,
    pcloudBackup: initial.pcloudBackup,
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
    successfulFieldIds: [],
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
