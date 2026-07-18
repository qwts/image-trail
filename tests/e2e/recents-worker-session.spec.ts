import type { Page, Worker } from '@playwright/test';

import { expect, test } from './fixtures.js';

async function stopExtensionWorker(page: Page, worker: Worker): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const { targetInfos } = await session.send('Target.getTargets');
  const target = targetInfos.find((candidate) => candidate.type === 'service_worker' && candidate.url === worker.url());
  if (!target) throw new Error(`Extension service-worker target not found: ${worker.url()}`);
  const closed = await session.send('Target.closeTarget', { targetId: target.targetId });
  expect(closed.success).toBe(true);
  await session.detach();

  const observer = await page.context().newCDPSession(page);
  await expect
    .poll(async () => (await observer.send('Target.getTargets')).targetInfos.some((candidate) => candidate.targetId === target.targetId))
    .toBe(false);
  await observer.detach();
}

test('Recents survive MV3 service-worker suspension within the browser session', async ({
  extensionContext,
  extensionId,
  page,
  serviceWorker,
}) => {
  const extensionPage = await extensionContext.newPage();
  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/src/destinations/view.html?view=dashboard`);
    const addResult = await extensionPage.evaluate(async () =>
      chrome.runtime.sendMessage({
        type: 'imageTrail.addRecentHistory',
        version: 1,
        payload: {
          pageUrl: 'https://example.test/gallery',
          item: {
            id: 'worker-session-recent',
            url: 'https://images.example.test/worker-session.jpg',
            timestamp: '2026-07-18T00:00:00.000Z',
            source: 'history',
          },
          scope: 'site',
        },
      }),
    );
    expect(addResult).toMatchObject({ payload: { items: [{ id: 'worker-session-recent' }] } });

    await stopExtensionWorker(page, serviceWorker);

    const loadResult = await extensionPage.evaluate(async () =>
      chrome.runtime.sendMessage({
        type: 'imageTrail.loadRecentHistory',
        version: 1,
        payload: {
          pageUrl: 'https://example.test/gallery',
          includeRetained: true,
          scope: 'site',
        },
      }),
    );
    expect(loadResult).toMatchObject({ payload: { items: [{ id: 'worker-session-recent' }] } });
  } finally {
    await extensionPage.close();
  }
});
