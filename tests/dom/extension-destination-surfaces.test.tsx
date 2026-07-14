import assert from 'node:assert/strict';
import test from 'node:test';
import { act, type ReactNode } from 'react';

import type { RecallRecordsResult } from '../../extension/src/content/recall-store.js';
import type { RecallCandidate } from '../../extension/src/core/types.js';
import { DEFAULT_LOCAL_SETTINGS } from '../../extension/src/data/local-settings.js';
import { DashboardDestination } from '../../extension/src/destinations/dashboard-destination.js';
import { RecallDestination } from '../../extension/src/destinations/recall-destination.js';
import { SettingsDestination } from '../../extension/src/destinations/settings-destination.js';
import type { DashboardSnapshot, DestinationServices, RecallWindow } from '../../extension/src/destinations/destination-services.js';
import { renderReactSubtree, unmountReactSubtree } from '../../extension/src/ui/react/react-subtree.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const noopSubscription = (): (() => void) => () => undefined;

function candidate(id: string, privacyStatus?: 'locked'): RecallCandidate {
  return {
    id,
    url: `https://private.example.test/${id}.jpg`,
    label: `Private ${id}`,
    timestamp: '2026-07-14T12:00:00.000Z',
    queueUpdatedAt: '2026-07-14T12:00:00.000Z',
    envelopeCreatedAt: '2026-07-14T12:00:00.000Z',
    source: 'bookmark',
    privacyStatus,
  };
}

function recallWindow(items: readonly RecallCandidate[], privacyMode = false): RecallWindow {
  return {
    privacyMode,
    windowStart: 30,
    result: {
      ok: true,
      candidates: items,
      total: items.length,
      nextOffset: 30 + items.length,
      hasMore: false,
      failedCount: 0,
      message: `Loaded ${items.length} recall records.`,
    },
  };
}

function services(overrides: Partial<DestinationServices> = {}): DestinationServices {
  const dashboard: DashboardSnapshot = {
    limit: 200,
    total: 1,
    captured: 0,
    pins: 1,
    truncated: false,
  };
  return {
    loadDashboard: async () => dashboard,
    loadRecall: async () => recallWindow([]),
    recall: async (): Promise<RecallRecordsResult> => ({ ok: true, records: [], failedCount: 0, message: 'Recalled records.' }),
    loadSettings: async () => DEFAULT_LOCAL_SETTINGS,
    saveSettings: async () => undefined,
    loadBuildIdentity: async () => null,
    subscribeLibrary: noopSubscription,
    subscribeSettings: noopSubscription,
    ...overrides,
  };
}

async function mount(content: ReactNode): Promise<HTMLElement> {
  const root = document.createElement('div');
  document.body.append(root);
  await act(async () => {
    renderReactSubtree(root, content);
    await Promise.resolve();
  });
  return root;
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function cleanup(root: HTMLElement): Promise<void> {
  await act(async () => unmountReactSubtree(root));
  root.remove();
}

test('dashboard reports exact durable total and bounded snapshot semantics', async () => {
  const root = await mount(
    <DashboardDestination
      services={services({
        loadDashboard: async () => ({
          limit: 200,
          total: 412,
          captured: 1,
          pins: 1,
          truncated: true,
        }),
      })}
    />,
  );
  try {
    await flush();
    assert.match(root.textContent ?? '', /412Durable records/u);
    assert.match(root.textContent ?? '', /1Loaded pins/u);
    assert.match(root.textContent ?? '', /1Loaded bookmarks/u);
    assert.match(root.textContent ?? '', /bounded 200-record snapshot/u);
    assert.match(root.textContent ?? '', /does not clone page-coupled target/u);
  } finally {
    await cleanup(root);
  }
});

test('dashboard ignores a stale response after a newer library refresh', async () => {
  const resolvers: Array<(snapshot: DashboardSnapshot) => void> = [];
  let refresh: () => void = () => undefined;
  const api = services({
    loadDashboard: () => new Promise((resolve) => resolvers.push(resolve)),
    subscribeLibrary: (listener) => {
      refresh = listener;
      return () => undefined;
    },
  });
  const root = await mount(<DashboardDestination services={api} />);
  try {
    await act(async () => refresh());
    await flush();
    assert.equal(resolvers.length, 2);
    resolvers[1]?.({ limit: 200, total: 2, captured: 0, pins: 2, truncated: false });
    await flush();
    resolvers[0]?.({ limit: 200, total: 99, captured: 0, pins: 99, truncated: false });
    await flush();
    assert.match(root.textContent ?? '', /2Durable records/u);
    assert.doesNotMatch(root.textContent ?? '', /99Durable records/u);
  } finally {
    await cleanup(root);
  }
});

test('Recall masks private metadata and moves only selected durable records', async () => {
  const recalled: string[][] = [];
  const api = services({
    loadRecall: async () => recallWindow([candidate('pin-1'), candidate('pin-2', 'locked')], true),
    recall: async (ids) => {
      recalled.push([...ids]);
      return { ok: true, records: [], failedCount: 0, message: 'Moved 1 record to the front.' };
    },
  });
  const root = await mount(<RecallDestination services={api} />);
  try {
    await flush();
    assert.equal(root.querySelectorAll('ol > li').length, 2);
    assert.doesNotMatch(root.innerHTML, /private\.example|Private pin-1|Private pin-2/u);
    assert.equal(root.querySelectorAll('[data-privacy="true"]').length, 2);
    await act(async () => root.querySelector<HTMLInputElement>('input[type="checkbox"]')?.click());
    await flush();
    const recall = Array.from(root.querySelectorAll('button')).find((button) => button.textContent?.includes('Recall selected'));
    await act(async () => recall?.click());
    await flush();
    assert.deepEqual(recalled, [['pin-1']]);
    assert.match(root.textContent ?? '', /durable queue producer only/u);
  } finally {
    await cleanup(root);
  }
});

test('Settings renders all groups and persists through the extension-owned service', async () => {
  const saved: boolean[] = [];
  const api = services({
    saveSettings: async (settings) => {
      saved.push(settings.privacyModeEnabled);
    },
  });
  const root = await mount(<SettingsDestination services={api} />);
  try {
    await flush();
    assert.deepEqual(
      Array.from(root.querySelectorAll('summary')).map((summary) => summary.textContent),
      ['Display', 'Privacy', 'Automation', 'Utilities', 'System'],
    );
    const privacyGroup = Array.from(root.querySelectorAll('details')).find(
      (details) => details.querySelector('summary')?.textContent === 'Privacy',
    );
    const privacyToggle = Array.from(privacyGroup?.querySelectorAll<HTMLInputElement>('input[type="checkbox"]') ?? []).find((input) =>
      input.parentElement?.textContent?.includes('Privacy mode'),
    );
    await act(async () => privacyToggle?.click());
    await flush();
    assert.deepEqual(saved, [true]);
    assert.match(root.textContent ?? '', /Settings saved/u);
    assert.match(root.textContent ?? '', /session-only active CryptoKey/u);
  } finally {
    await cleanup(root);
  }
});

test('Settings reloads uncontrolled form drafts before a duplicate tab can overwrite newer values', async () => {
  let current = DEFAULT_LOCAL_SETTINGS;
  let refresh: () => void = () => undefined;
  const saved: Array<typeof DEFAULT_LOCAL_SETTINGS> = [];
  const api = services({
    loadSettings: async () => current,
    saveSettings: async (settings) => {
      saved.push(settings);
    },
    subscribeSettings: (listener) => {
      refresh = listener;
      return () => undefined;
    },
  });
  const root = await mount(<SettingsDestination services={api} />);
  try {
    await flush();
    const visiblePins = root.querySelector<HTMLInputElement>('input[name="visibleBookmarkSoftMax"]');
    const requestInterval = root.querySelector<HTMLInputElement>('input[name="requestThrottleMs"]');
    assert.equal(visiblePins?.value, String(DEFAULT_LOCAL_SETTINGS.visibleBookmarkSoftMax));
    assert.equal(requestInterval?.value, String(DEFAULT_LOCAL_SETTINGS.requestThrottleMs));

    current = { ...current, visibleBookmarkSoftMax: 45, requestThrottleMs: 1_234 };
    await act(async () => refresh());
    await flush();

    assert.equal(root.querySelector<HTMLInputElement>('input[name="visibleBookmarkSoftMax"]')?.value, '45');
    assert.equal(root.querySelector<HTMLInputElement>('input[name="requestThrottleMs"]')?.value, '1234');
    const applyButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button[type="submit"]'));
    await act(async () => applyButtons[0]?.click());
    await flush();
    await act(async () => applyButtons[1]?.click());
    await flush();
    assert.deepEqual(
      saved.map((settings) => [settings.visibleBookmarkSoftMax, settings.requestThrottleMs]),
      [
        [45, 1_234],
        [45, 1_234],
      ],
    );
  } finally {
    await cleanup(root);
  }
});

test('Settings exposes a retry path after a repository load failure', async () => {
  let attempts = 0;
  const api = services({
    loadSettings: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('fixture failure');
      return DEFAULT_LOCAL_SETTINGS;
    },
  });
  const root = await mount(<SettingsDestination services={api} />);
  try {
    await flush();
    assert.match(root.textContent ?? '', /Settings could not be loaded/u);
    const retry = Array.from(root.querySelectorAll('button')).find((button) => button.textContent === 'Retry');
    await act(async () => retry?.click());
    await flush();
    assert.equal(attempts, 2);
    assert.equal(root.querySelectorAll('.image-trail-destination-settings__group').length, 5);
  } finally {
    await cleanup(root);
  }
});
