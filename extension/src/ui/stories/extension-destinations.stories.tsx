import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import type { ReactNode } from 'react';

import '../../destinations/destination-tokens.css';
import '../../destinations/destination-page.css';
import '../../destinations/destination-surfaces.css';
import { DEFAULT_LOCAL_SETTINGS } from '../../content/panel-services.js';
import type { RecallRecordsResult } from '../../content/recall-store.js';
import type { RecallCandidate } from '../../core/types.js';
import { DashboardDestination } from '../../destinations/dashboard-destination.js';
import type { DashboardSnapshot, DestinationServices, RecallWindow } from '../../destinations/destination-services.js';
import { RecallDestination } from '../../destinations/recall-destination.js';
import { SettingsDestination } from '../../destinations/settings-destination.js';
import { DestinationFrame } from '../../destinations/destination-frame.js';
import type { SecureSessionClient } from '../../content/secure-session-client.js';
import { ExtensionDestinationShell, type DestinationRouteLink } from '../react/extension-destination-shell.js';
import { renderReactSubtree } from '../react/react-subtree.js';

const recalled = fn<(ids: readonly string[]) => void>();
const saved = fn<(privacyModeEnabled: boolean) => void>();
const savedDownArrowAction = fn<(value: string) => void>();
const secureUnlock = fn<SecureSessionClient['unlock']>();
const routes: readonly DestinationRouteLink[] = [
  { id: 'dashboard', href: '#dashboard' },
  { id: 'gallery', href: '#gallery' },
  { id: 'recall', href: '#recall' },
  { id: 'settings', href: '#settings' },
];

const records: readonly RecallCandidate[] = [
  {
    id: 'pin-1',
    url: 'https://images.example.test/alpine-lake.jpg',
    label: 'Alpine lake',
    thumbnail: thumbnail(),
    timestamp: '2026-07-14T03:00:00.000Z',
    queueUpdatedAt: '2026-07-14T03:00:00.000Z',
    envelopeCreatedAt: '2026-07-14T03:00:00.000Z',
    source: 'bookmark',
    captureStatus: 'captured',
    blobId: 'blob-1',
  },
  {
    id: 'pin-2',
    url: 'https://images.example.test/coastline.webp',
    label: 'Coastline study',
    timestamp: '2026-07-14T02:00:00.000Z',
    queueUpdatedAt: '2026-07-14T02:00:00.000Z',
    envelopeCreatedAt: '2026-07-14T02:00:00.000Z',
    source: 'bookmark',
  },
];

const meta = {
  title: 'Design System/Extension destinations',
  render: () => page('dashboard', <DashboardDestination services={services()} />),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('12')).toBeVisible();
    await expect(canvas.getByText(/Transient Recents are never included/u)).toBeVisible();
  },
};

export const RecallInteractive: Story = {
  render: () => page('recall', <RecallDestination services={services()} />),
  play: async ({ canvasElement }) => {
    recalled.mockClear();
    const canvas = within(canvasElement);
    const rows = await canvas.findAllByRole('checkbox');
    await userEvent.click(rows[0]!);
    await userEvent.click(canvas.getByRole('button', { name: 'Recall selected (1)' }));
    await expect(recalled).toHaveBeenCalledWith(['pin-1']);
  },
};

export const RecallPrivate: Story = {
  render: () => page('recall', <RecallDestination services={services({ privacyMode: true })} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findAllByText('Private durable record')).toHaveLength(2);
    await expect(canvasElement.innerHTML).not.toContain('images.example.test');
  },
};

export const Settings: Story = {
  render: () => page('settings', <SettingsDestination services={services()} />),
  play: async ({ canvasElement }) => {
    saved.mockClear();
    savedDownArrowAction.mockClear();
    const canvas = within(canvasElement);
    const privacy = await canvas.findByRole('checkbox', { name: 'Privacy mode' });
    await userEvent.click(privacy);
    await expect(saved).toHaveBeenCalledWith(true);
    const downArrow = canvas.getByRole('combobox', { name: 'Down arrow action' });
    await userEvent.selectOptions(downArrow, 'download');
    await expect(savedDownArrowAction).toHaveBeenCalledWith('download');
  },
};

export const EmptyRecall: Story = {
  render: () => page('recall', <RecallDestination services={services({ records: [] })} />),
};

export const Loading: Story = {
  render: () => page('dashboard', <DashboardDestination services={services({ pending: true })} />),
};

export const Error: Story = {
  render: () => page('dashboard', <DashboardDestination services={services({ failure: true })} />),
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('Dashboard could not load durable records.')).toBeVisible();
  },
};

export const SettingsError: Story = {
  render: () => page('settings', <SettingsDestination services={services({ settingsFailure: true })} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('Settings could not be loaded.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Retry' })).toBeVisible();
  },
};

export const SecureWorkspaceLockBoundary: Story = {
  render: () => secureWorkspacePage(),
  play: async ({ canvasElement }) => {
    secureUnlock.mockClear();
    const canvas = within(canvasElement);
    await expect(await canvas.findByRole('heading', { name: 'Image Trail is locked' })).toBeVisible();
    await expect(canvas.queryByText('Sensitive durable workspace')).not.toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText('Password'), 'wrong');
    await userEvent.click(canvas.getByRole('button', { name: 'Unlock workspace' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Password did not unlock encrypted storage.');
    await expect(canvas.queryByText('Sensitive durable workspace')).not.toBeInTheDocument();
    await userEvent.type(canvas.getByLabelText('Password'), 'correct');
    await userEvent.click(canvas.getByRole('button', { name: 'Unlock workspace' }));
    await expect(await canvas.findByText('Sensitive durable workspace')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Lock' })).toBeVisible();
  },
};

export const Narrow: Story = {
  render: () => page('settings', <SettingsDestination services={services()} />, { width: 360 }),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.image-trail-destination-page');
    await expect(root?.scrollWidth).toBeLessThanOrEqual(root?.clientWidth ?? 0);
  },
};

export const ReducedMotion: Story = {
  render: () => page('recall', <RecallDestination services={services()} />, { reducedMotion: true }),
  play: async ({ canvasElement }) => {
    const pageRoot = canvasElement.querySelector<HTMLElement>('.image-trail-destination-page');
    await expect(pageRoot).toHaveAttribute('data-reduced-motion-preview', 'true');
  },
};

interface ServiceOptions {
  readonly records?: readonly RecallCandidate[];
  readonly privacyMode?: boolean;
  readonly pending?: boolean;
  readonly failure?: boolean;
  readonly settingsFailure?: boolean;
}

function services(options: ServiceOptions = {}): DestinationServices {
  const items = options.records ?? records;
  const dashboard: DashboardSnapshot = {
    limit: 200,
    total: 12,
    pins: 7,
    captured: 5,
    truncated: false,
  };
  const fail = async (): Promise<never> => {
    throw new Error('Fixture failure');
  };
  const pending = async (): Promise<never> => new Promise(() => undefined);
  const loadDashboard = options.failure ? fail : options.pending ? pending : async () => dashboard;
  return {
    loadDashboard,
    loadRecall: async (): Promise<RecallWindow> => ({
      privacyMode: options.privacyMode ?? false,
      windowStart: 30,
      result: {
        ok: true,
        candidates: items,
        total: items.length,
        nextOffset: 30 + items.length,
        hasMore: false,
        failedCount: 0,
        message: items.length ? `Loaded ${items.length} recall records.` : '',
      },
    }),
    recall: async (ids): Promise<RecallRecordsResult> => {
      recalled(ids);
      return { ok: true, records: [], failedCount: 0, message: 'Selected records moved to the front.' };
    },
    loadSettings: options.settingsFailure ? fail : async () => DEFAULT_LOCAL_SETTINGS,
    saveSettings: async (settings) => {
      saved(settings.privacyModeEnabled);
      savedDownArrowAction(settings.downArrowAction);
    },
    loadBuildIdentity: async () => ({
      schemaVersion: 1,
      version: '0.6.0',
      builtAt: '2026-07-14T12:00:00.000Z',
      commit: 'fixture',
      branch: 'storybook',
      worktree: 'image-trail',
      mode: 'local',
    }),
    subscribeLibrary: () => () => undefined,
    subscribeSettings: () => () => undefined,
  };
}

function page(
  destination: 'dashboard' | 'recall' | 'settings',
  body: ReactNode,
  options: { readonly width?: number; readonly reducedMotion?: boolean } = {},
): HTMLElement {
  const host = document.createElement('div');
  if (options.width) host.style.width = `${options.width}px`;
  renderReactSubtree(
    host,
    <ExtensionDestinationShell destination={destination} routes={routes} sourceState="unbound" onReturnToSource={() => undefined}>
      <div data-reduced-motion-preview={options.reducedMotion ? 'true' : undefined}>{body}</div>
    </ExtensionDestinationShell>,
  );
  if (options.reducedMotion)
    host.querySelector<HTMLElement>('.image-trail-destination-page')?.setAttribute('data-reduced-motion-preview', 'true');
  if (options.width) host.querySelector<HTMLElement>('.image-trail-destination-page')?.setAttribute('data-narrow-preview', 'true');
  return host;
}

function thumbnail(): string {
  return `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160"><rect width="240" height="160" fill="#173d56"/></svg>',
  )}`;
}

function secureWorkspacePage(): HTMLElement {
  secureUnlock.mockImplementation(async (password) =>
    password === 'correct'
      ? { ok: true, keyReference: 'blob:storybook', message: 'Unlocked.' }
      : { ok: false, reason: 'wrong-password', message: 'Password did not unlock encrypted storage.' },
  );
  const client: SecureSessionClient = {
    status: async () => ({ unlocked: false, keyReference: null, hasKey: true, reason: 'manual' }),
    unlock: secureUnlock,
    lock: async () => ({ ok: true, keyReference: '', message: 'Locked.' }),
    subscribe: () => () => undefined,
  };
  const host = document.createElement('div');
  renderReactSubtree(
    host,
    <DestinationFrame destination="dashboard" secureSessionClient={client}>
      <p>Sensitive durable workspace</p>
    </DestinationFrame>,
  );
  return host;
}
