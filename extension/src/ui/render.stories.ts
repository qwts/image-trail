import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { PanelState } from '../core/types.js';
import { createInitialPanelState } from '../core/state.js';
import { floatingSection, railedSection, type WorkspaceSectionLayout } from '../core/workspace-layout.js';
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
      activeDestination: 'settings',
      storageUsage: {
        blobCount: 14,
        totalBytes: 867_328,
        orphanedBlobCount: 1,
        originals: { count: 3, totalBytes: 742_400 },
        queueRecords: { count: 7, totalBytes: 86_016 },
        thumbnails: { count: 4, totalBytes: 38_912 },
      },
    }),
  play: async ({ canvasElement }) => expectDestination(canvasElement, 'settings'),
};

export const DashboardDestination: Story = {
  render: () => panelLayoutStory({ activeDestination: 'dashboard' }),
  play: async ({ canvasElement }) => expectDestination(canvasElement, 'dashboard'),
};

export const GalleryDestination: Story = {
  render: () => panelLayoutStory({ activeDestination: 'gallery' }),
  play: async ({ canvasElement }) => expectDestination(canvasElement, 'gallery'),
};

export const RecallDestination: Story = {
  render: () => panelLayoutStory({ activeDestination: 'recall' }),
  play: async ({ canvasElement }) => expectDestination(canvasElement, 'recall'),
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
  render: () => panelLayoutStory({ activeDestination: 'gallery' }, { width: 300 }),
  play: async ({ canvasElement }) => {
    const panel = canvasElement.querySelector<HTMLElement>('.image-trail-panel');
    await expect(panel).not.toBeNull();
    await expect(panel?.scrollWidth).toBeLessThanOrEqual(panel?.clientWidth ?? 0);
  },
};

async function expectDestination(canvasElement: HTMLElement, destination: 'dashboard' | 'gallery' | 'recall' | 'settings'): Promise<void> {
  const surface = canvasElement.querySelector<HTMLElement>(`.image-trail-panel__destination-surface[data-destination="${destination}"]`);
  const active = canvasElement.querySelector<HTMLElement>(`[data-image-trail-destination="${destination}"]`);
  await expect(surface).not.toBeNull();
  await expect(active).toHaveAttribute('aria-pressed', 'true');
  await expect(surface?.querySelector('.image-trail-panel__destination-close')).not.toBeNull();
}

export const ReducedMotion: Story = {
  render: () => panelLayoutStory({ captureInProgress: true }, { reducedMotion: true }),
};

export const SettingsDetached: Story = {
  render: () => detachedPanelStory({ activeDestination: 'settings', detachedSections: ['settings'] }),
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector('.image-trail-panel')?.querySelector('.image-trail-panel__settings-section')).toBeNull();
    await expect(canvasElement.querySelector('[data-image-trail-detached-placeholder="settings"]')).not.toBeNull();
    const windowEl = canvasElement.querySelector<HTMLElement>('[data-image-trail-detached-window="settings"]');
    await expect(windowEl).not.toBeNull();
    await expect(windowEl?.querySelector('.image-trail-panel__settings-section')).not.toBeNull();
  },
};

const workspaceDispatch = fn();

export const WorkspaceRailAndFloating: Story = {
  render: () =>
    detachedPanelStory(
      { detachedSections: ['history', 'bookmarks', 'controls'] },
      [
        railedSection('history', 'left', 0),
        railedSection('bookmarks', 'left', 1),
        floatingSection('controls', { left: 520, top: 48, width: 340, height: 320 }),
      ],
      workspaceDispatch,
    ),
  play: async ({ canvasElement }) => {
    workspaceDispatch.mockClear();
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector('[data-edge="left"].image-trail-workspace__rail')).not.toBeNull();
    await expect(canvasElement.querySelectorAll('[data-workspace-mode="railed"]')).toHaveLength(2);
    await userEvent.click(canvas.getByRole('button', { name: 'Shade Recent history' }));
    const floatingHeader = canvas.getByLabelText('Move Manual controls; Alt plus an arrow key previews and snaps to an edge');
    floatingHeader.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true }));
    floatingHeader.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowDown', altKey: true, bubbles: true }));
    await expect(workspaceDispatch).toHaveBeenCalledWith({ name: 'workspace/shade', sectionId: 'history' });
    await expect(workspaceDispatch).toHaveBeenCalledWith({ name: 'workspace/snap', sectionId: 'controls', edge: 'bottom' });
  },
};

export const WorkspaceTopRail: Story = {
  render: () =>
    detachedPanelStory({ detachedSections: ['history', 'bookmarks'] }, [
      railedSection('history', 'top', 0),
      railedSection('bookmarks', 'top', 1),
    ]),
};

const workspaceSizeDispatch = fn();

export const WorkspaceAutomaticAndUserSizing: Story = {
  render: () =>
    detachedPanelStory(
      { detachedSections: ['history', 'bookmarks'] },
      [
        floatingSection('history', { left: 460, top: 16, width: 340, height: 180 }),
        floatingSection('bookmarks', { left: 820, top: 16, width: 340, height: 360 }, { floatingSizeMode: 'user' }),
      ],
      workspaceSizeDispatch,
    ),
  play: async ({ canvasElement }) => {
    workspaceSizeDispatch.mockClear();
    const recents = canvasElement.querySelector<HTMLElement>('[data-image-trail-detached-window="history"]');
    const queue = canvasElement.querySelector<HTMLElement>('[data-image-trail-detached-window="bookmarks"]');
    await expect(recents).toHaveAttribute('data-workspace-size-mode', 'auto');
    await expect(recents?.style.height).toBe('');
    await expect(queue).toHaveAttribute('data-workspace-size-mode', 'user');
    await expect(queue?.style.height).toBe('360px');

    const canvas = within(canvasElement);
    canvas
      .getByRole('button', { name: 'Resize Queue' })
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await expect(workspaceSizeDispatch).toHaveBeenCalledWith(expect.objectContaining({ name: 'workspace/resize', sectionId: 'bookmarks' }));
  },
};

export const SettingsDetachedPrivacyMasked: Story = {
  render: () => detachedPanelStory({ activeDestination: 'settings', detachedSections: ['settings'], privacyModeEnabled: true }),
};

/** Panel plus a detached-window root in one canvas; fixed windows become absolute for the story. */
function detachedPanelStory(
  overrides: Partial<PanelState> = {},
  placements: readonly WorkspaceSectionLayout[] = [floatingSection('settings', { left: 460, top: 16, width: 420, height: 640 })],
  dispatch = mockDispatch('panel layout story action'),
): HTMLElement {
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
    workspaceSections: new Map(placements.map((placement) => [placement.sectionId, placement])),
    collapsibleListScrollTops: new Map(),
    primaryPanelScrollTop: null,
    destinationScrollTops: new Map(),
  };
  wrapper.append(host, detachedRoot);

  renderPanel(
    {
      root: host,
      detachedRoot,
      dispatch,
      layoutState,
    },
    panelState(overrides),
  );

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
    workspaceSections: new Map(),
    collapsibleListScrollTops: new Map(),
    primaryPanelScrollTop: null,
    destinationScrollTops: new Map(),
  };

  renderPanel(
    {
      root: host,
      dispatch: mockDispatch('panel layout story action'),
      layoutState,
    },
    panelState(overrides),
  );

  return host;
}

function panelState(overrides: Partial<PanelState> = {}): PanelState {
  return {
    ...createInitialPanelState(Date.parse('2026-06-25T15:30:00.000Z')),
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
    activeDestination: null,
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
