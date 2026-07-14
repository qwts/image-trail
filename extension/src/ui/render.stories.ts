import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect } from 'storybook/test';

import type { PanelState } from '../core/types.js';
import { DEFAULT_SEARCHABLE_METADATA_POLICY } from '../core/metadata-policy.js';
import { EMPTY_PAGE_CONTEXT_STATE } from '../core/page-context.js';
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

const STORY_BUILD_IDENTITY = {
  schemaVersion: 1,
  version: '0.1.0',
  builtAt: '2026-06-28T03:30:00.000Z',
  commit: 'abc123def456',
  branch: 'codex/dev',
  worktree: '7bc4/image-bookmarklet',
  timezone: 'America/Chicago',
  mode: 'local',
} as const;

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

export const HistoryDetachedPlaceholder: Story = {
  render: () => panelLayoutStory({ history: recentFixtures, detachedSections: ['history'] }),
};

export const SecondaryControlsExpanded: Story = {
  render: () => panelLayoutStory({ secondaryControlsOpen: true }),
};

export const Minimized: Story = {
  render: () => panelLayoutStory({ minimized: true }),
};

export const Waiting: Story = {
  render: () => panelLayoutStory({ captureInProgress: true, message: 'Capturing selected image original.' }),
};

export const Error: Story = {
  render: () => panelLayoutStory({ status: 'error', message: 'Image Trail needs attention.' }),
};

export const Narrow: Story = {
  render: () => panelLayoutStory({}, { width: 300 }),
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>('.image-trail-panel');
    await expect(panel).not.toBeNull();
    await expect(panel?.scrollWidth).toBeLessThanOrEqual(panel?.clientWidth ?? 0);
  },
};

export const ReducedMotion: Story = {
  render: () => panelLayoutStory({ captureInProgress: true }, { reducedMotion: true }),
};

export const SettingsDetached: Story = {
  render: () => detachedPanelStory({ settingsOpen: true, detachedSections: ['settings'] }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.image-trail-panel')?.querySelector('.image-trail-panel__settings-section')).toBeNull();
    await expect(canvasElement.querySelector('[data-image-trail-detached-placeholder="settings"]')).not.toBeNull();
    const windowEl = canvasElement.querySelector<HTMLElement>('[data-image-trail-detached-window="settings"]');
    await expect(windowEl).not.toBeNull();
    await expect(windowEl?.querySelector('.image-trail-panel__settings-section')).not.toBeNull();
  },
};

export const SettingsDetachedPrivacyMasked: Story = {
  render: () => detachedPanelStory({ settingsOpen: true, detachedSections: ['settings'], privacyModeEnabled: true }),
};

/** Panel plus a detached-window root in one canvas; fixed windows become absolute for the story. */
function detachedPanelStory(overrides: Partial<PanelState> = {}): HTMLElement {
  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.style.minInlineSize = '940px';
  wrapper.style.minBlockSize = '700px';

  const host = document.createElement('div');
  host.className = 'image-trail-panel-root image-trail-panel';
  host.style.position = 'absolute';
  host.style.inset = 'auto';
  host.style.left = '16px';
  host.style.top = '16px';
  host.style.width = '420px';
  host.style.inlineSize = '420px';

  const detachedRoot = document.createElement('div');
  const layoutState: PanelLayoutState = {
    fieldsPanelOpen: false,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    detachedWindowPositions: new Map([['settings', { left: 460, top: 16 }]]),
    detachedWindowMinimized: new Set(),
    collapsibleListScrollTops: new Map(),
  };
  wrapper.append(host, detachedRoot);

  renderPanel(
    {
      root: host,
      detachedRoot,
      dispatch: mockDispatch('panel layout story action'),
      layoutState,
    },
    panelState(overrides),
    { renderRecall: false },
  );

  for (const windowEl of Array.from(detachedRoot.querySelectorAll<HTMLElement>('.image-trail-panel__detached-window'))) {
    windowEl.style.position = 'absolute';
  }
  return wrapper;
}

function panelLayoutStory(
  overrides: Partial<PanelState> = {},
  options: { readonly width?: number; readonly reducedMotion?: boolean } = {},
): HTMLElement {
  const host = document.createElement('div');
  host.className = 'image-trail-panel-root image-trail-panel';
  host.style.position = 'relative';
  host.style.inset = 'auto';
  host.style.margin = '16px';
  host.style.width = `${options.width ?? 420}px`;
  host.style.inlineSize = `${options.width ?? 420}px`;
  if (options.reducedMotion) host.dataset['reducedMotionPreview'] = 'true';

  const layoutState: PanelLayoutState = {
    fieldsPanelOpen: true,
    fieldsPanelBlockSize: null,
    historyListBlockSize: null,
    fieldDisplayModes: new Map(),
    detachedWindowPositions: new Map(),
    detachedWindowMinimized: new Set(),
    collapsibleListScrollTops: new Map(),
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
    pageContext: EMPTY_PAGE_CONTEXT_STATE,
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
    secondaryControlsOpen: false,
    detachedSections: [],
    hasOlderBookmarks: false,
    hasNewerBookmarks: false,
    captureInProgress: false,
    captureResult: null,
    storageUsage: null,
    buildIdentity: STORY_BUILD_IDENTITY,
    blobKeyUnlocked: true,
    blobKeyAvailable: true,
    blobKeyReference: 'session key',
    importExportBusy: false,
    pcloudBackup: {
      connectionState: 'disconnected',
    },
    settingsOpen: false,
    helpOpen: false,
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
