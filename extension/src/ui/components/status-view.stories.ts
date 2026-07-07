import type { Meta, StoryObj } from '@storybook/html-vite';

import { captureFailureMessage } from '../../core/image/capture-result.js';
import type { PanelState } from '../../core/types.js';
import { DEFAULT_SEARCHABLE_METADATA_POLICY } from '../../core/metadata-policy.js';
import { createStatusView } from './status-view.js';
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
  const toast = statusToastStory(state);
  story.classList.toggle('is-waiting', isPanelWaiting(state));
  story.classList.toggle('has-status-error', hasPanelError(state));
  wrapper.append(story, toast);
  return wrapper;
}

function statusStoryContent(state: PanelState): HTMLElement {
  const fragment = document.createElement('div');
  fragment.append(statusHeaderStory(state), createStatusView(state, mockDispatch('status story action')));
  return fragment;
}

function statusHeaderStory(state: PanelState): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-panel__header';

  const heading = document.createElement('h2');
  heading.className = 'image-trail-panel__title';
  heading.textContent = 'Image Trail';

  const status = document.createElement('p');
  status.className = `image-trail-panel__header-status ${statusToneClass(state)}`;
  status.textContent = statusSummaryText(state);
  status.title = state.message.trim() || status.textContent;
  if (isPanelWaiting(state)) status.classList.add('is-waiting');

  const actions = document.createElement('div');
  actions.className = 'image-trail-panel__header-actions';
  for (const label of ['⚙', '-', 'X']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'image-trail-panel__icon-button';
    button.textContent = label;
    actions.append(button);
  }

  header.append(heading, status, actions);
  return header;
}

function statusToastStory(state: PanelState): HTMLElement {
  const toastRoot = document.createElement('div');
  toastRoot.className = `image-trail-panel-root image-trail-panel__toast-root ${statusToneClass(state)}`;
  toastRoot.classList.toggle('is-waiting', isPanelWaiting(state));
  toastRoot.classList.toggle('has-status-error', hasPanelError(state));
  const toastMessage = toastMessageText(state);
  if (!toastMessage) return toastRoot;

  const toast = document.createElement('aside');
  toast.className = 'image-trail-panel__toast';
  toast.setAttribute('role', hasPanelError(state) ? 'alert' : 'status');
  toast.setAttribute('aria-live', hasPanelError(state) ? 'assertive' : 'polite');

  const label = document.createElement('span');
  label.className = 'image-trail-panel__toast-label';
  label.textContent = hasPanelError(state) ? 'Error' : isPanelWaiting(state) ? 'Working' : statusSummaryText(state);

  const message = document.createElement('span');
  message.className = 'image-trail-panel__toast-message';
  message.textContent = toastMessage;
  message.title = message.textContent;

  toast.append(label, message);
  toastRoot.append(toast);
  return toastRoot;
}

function isPanelWaiting(state: PanelState): boolean {
  return (
    state.captureInProgress ||
    state.importExportBusy ||
    state.recall.busy ||
    state.automation.slideshowPhase === 'running' ||
    state.automation.retryPhase === 'running' ||
    state.automation.governorStatus !== 'ready'
  );
}

function hasPanelError(state: PanelState): boolean {
  return (
    state.status === 'error' ||
    state.importExportMessageIsError === true ||
    state.recall.messageIsError === true ||
    (state.captureResult !== null && state.captureResult.status !== 'captured')
  );
}

function statusSummaryText(state: PanelState): string {
  if (hasPanelError(state)) return 'Needs attention';
  if (state.captureInProgress) return 'Capturing';
  if (state.importExportBusy) return 'Import/export';
  if (state.recall.busy) return 'Recall loading';
  if (state.automation.retryPhase === 'running') return 'Retrying';
  if (state.automation.slideshowPhase === 'running') return 'Slideshow';
  if (state.automation.governorStatus !== 'ready') return 'Rate limited';
  if (state.status === 'picking') return 'Picking';
  return 'Ready';
}

function toastMessageText(state: PanelState): string {
  const waitingMessage = waitingToastMessageText(state);
  if (waitingMessage) return waitingMessage;
  if (!hasPanelError(state)) return '';
  if (state.privacyModeEnabled) return 'Image Trail needs attention. Open the panel for details.';
  if (state.captureResult?.status === 'failed' || state.captureResult?.status === 'remote-only') {
    return state.captureResult.message || captureFailureMessage(state.captureResult.reason, state.captureResult.origin);
  }
  if (state.importExportMessage) return state.importExportMessage;
  if (state.recall.message) return state.recall.message;
  if (state.message.trim()) return state.message.trim();
  return '';
}

function waitingToastMessageText(state: PanelState): string {
  if (state.captureInProgress) return 'Capturing selected image original.';
  if (state.importExportBusy) return 'Import or export is running.';
  if (state.recall.busy) return 'Loading Recall records.';
  if (state.automation.retryPhase === 'running') return 'Retrying failed image loads.';
  if (state.automation.slideshowPhase === 'running') return 'Slideshow is advancing images.';
  if (state.automation.governorStatus !== 'ready') return 'Waiting for the request limit window.';
  return '';
}

function statusToneClass(state: PanelState): string {
  if (hasPanelError(state)) return 'is-error';
  if (isPanelWaiting(state)) return 'is-waiting';
  return 'is-ready';
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
    storageUsage: null,
    blobKeyUnlocked: true,
    blobKeyAvailable: true,
    blobKeyReference: 'session key',
    importExportBusy: false,
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
