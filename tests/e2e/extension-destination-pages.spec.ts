import type { Page, TestInfo, Worker } from '@playwright/test';

import { expect, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

const PREFIX = 'e2e-518-';
const referenceViewport = { width: 924, height: 540 };

test.afterEach(async ({ extensionId, page }) => {
  if (page.isClosed()) return;
  if (!page.url().startsWith(`chrome-extension://${extensionId}/`)) await openDestination(page, extensionId, 'dashboard');
  await page.evaluate(async (prefix) => {
    const snapshot = await chrome.runtime.sendMessage({
      type: 'imageTrail.loadBookmarks',
      version: 1,
      payload: { offset: 0, limit: 500, scope: 'global' },
    });
    const items = (snapshot?.payload?.items ?? []) as Array<{ id: string; url: string }>;
    const ids = items.filter((item) => item.url.includes(prefix)).map((item) => item.id);
    if (ids.length) {
      await chrome.runtime.sendMessage({ type: 'imageTrail.removeBookmarks', version: 1, payload: { ids } });
    }
    await chrome.storage.local.remove('imageTrail.localSettings');
  }, PREFIX);
});

test('real destination pages share navigation and real durable state', async ({ extensionId, page }, testInfo) => {
  test.setTimeout(60_000);
  await page.setViewportSize(referenceViewport);
  await openDestination(page, extensionId, 'dashboard');
  await resetDestinationStorage(page);
  await seedDurableQueue(page, 34);
  await seedRecentOnlyRecord(page);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.locator('.image-trail-destination-page__stat').filter({ hasText: 'Durable records' }).locator('strong')).toHaveText(
    '34',
  );
  await expect(page.getByText('Transient Recents are never included.')).toBeVisible();
  await expect(page.getByText('Target and Trail controls stay with the source panel')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Image Trail destinations' }).getByRole('link')).toHaveCount(4);
  await captureArtifact(page, testInfo, '02-mocked-tab');
  await captureArtifact(page, testInfo, '04-dashboard');

  await page.getByRole('link', { name: /Gallery/u }).click();
  await expect(page).toHaveURL(/\/src\/gallery\/gallery\.html\?view=gallery/u);
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(34);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await captureArtifact(page, testInfo, '05-gallery');

  await page.getByRole('link', { name: /Recall/u }).click();
  await expect(page).toHaveURL(/\/src\/destinations\/view\.html\?view=recall/u);
  await expect(page.getByRole('heading', { name: 'Recall', level: 1 })).toBeVisible();
  await expect(page.locator('.image-trail-destination-recall__row')).toHaveCount(4);
  await expect(page.getByText('RECENT ONLY SHOULD NOT APPEAR')).toHaveCount(0);
  await captureArtifact(page, testInfo, '06-recall');

  await page.locator('.image-trail-destination-recall__row input[type="checkbox"]').first().check();
  await page.getByRole('button', { name: 'Recall selected (1)' }).click();
  await expect(page.locator('.image-trail-destination-recall__row')).toHaveCount(4);
  await expect(page.getByText('Durable record 30')).toHaveCount(0);
  await expect.poll(() => firstDurableLabel(page)).toBe('Durable record 30');

  await page.getByRole('link', { name: /Settings/u }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.locator('.image-trail-destination-settings__group > summary')).toHaveText([
    'Display',
    'Privacy',
    'Automation',
    'Utilities',
    'System',
  ]);
  await captureArtifact(page, testInfo, '07-settings');

  await page.getByText('Privacy', { exact: true }).click();
  const privacy = page.getByRole('checkbox', { name: 'Privacy mode' });
  await privacy.check();
  await expect.poll(() => savedPrivacyMode(page)).toBe(true);
  await page.reload();
  await page.getByText('Privacy', { exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Privacy mode' })).toBeChecked();

  const duplicate = await page.context().newPage();
  try {
    await duplicate.goto(page.url());
    await duplicate.getByText('Privacy', { exact: true }).click();
    await expect(duplicate.getByRole('checkbox', { name: 'Privacy mode' })).toBeChecked();
    await duplicate.getByRole('spinbutton', { name: 'Visible pins' }).fill('45');
    await duplicate.locator('form').first().getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Visible pins' })).toHaveValue('45');

    await page.getByRole('spinbutton', { name: 'Gallery page limit' }).fill('99');
    await page.locator('form').first().getByRole('button', { name: 'Apply' }).click();
    await expect(duplicate.getByRole('spinbutton', { name: 'Visible pins' })).toHaveValue('45');
    await expect(duplicate.getByRole('spinbutton', { name: 'Gallery page limit' })).toHaveValue('99');
  } finally {
    await duplicate.close();
  }

  await page.setViewportSize({ width: 360, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('modifier-opened pages retain and safely lose their source tab', async ({ page, serviceWorker }) => {
  const source = await page.context().newPage();
  const destinationPages: Page[] = [];
  try {
    await openFixturePage(source, fixturePaths.singleImage);
    await togglePanelFromExtensionAction(source, serviceWorker);
    const panel = source.getByRole('dialog', { name: 'Image Trail panel' });
    await expect(panel).toBeVisible();

    const opened = source.context().waitForEvent('page');
    await panel.locator('[data-image-trail-destination="dashboard"]').click({ modifiers: ['Meta'] });
    const destination = await opened;
    destinationPages.push(destination);
    await destination.waitForLoadState('domcontentloaded');
    await expect(destination.getByText('Source tab available')).toBeVisible();
    expect(destination.url()).toMatch(/view=dashboard&sourceTab=\d+/u);

    const duplicate = await source.context().newPage();
    destinationPages.push(duplicate);
    await duplicate.goto(destination.url());
    await expect(duplicate.getByText('Source tab available')).toBeVisible();
    await duplicate.reload();
    await expect(duplicate.getByText('Source tab available')).toBeVisible();

    await destination.getByRole('button', { name: /Source tab/u }).click();
    await expect.poll(() => activeTabUrl(serviceWorker)).toBe(source.url());

    await source.close();
    await destination.bringToFront();
    await expect(destination.getByText('Source tab unavailable')).toBeVisible();
    await expect(destination.getByRole('button', { name: 'Source closed' })).toBeDisabled();
    await duplicate.reload();
    await expect(duplicate.getByText('Source tab unavailable')).toBeVisible();
  } finally {
    for (const destination of destinationPages) {
      if (!destination.isClosed()) await destination.close();
    }
    if (!source.isClosed()) await source.close();
  }
});

async function openDestination(page: Page, extensionId: string, destination: 'dashboard' | 'recall' | 'settings'): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/src/destinations/view.html?view=${destination}`);
  await expect(page.getByRole('heading', { name: destination[0]!.toUpperCase() + destination.slice(1), level: 1 })).toBeVisible();
}

async function seedDurableQueue(page: Page, count: number): Promise<void> {
  const results = await page.evaluate(
    async ({ count, prefix }) => {
      const responses: unknown[] = [];
      for (let index = count - 1; index >= 0; index -= 1) {
        const timestamp = new Date(Date.parse('2026-07-14T12:00:00.000Z') - index * 1_000).toISOString();
        responses.push(
          await chrome.runtime.sendMessage({
            type: 'imageTrail.saveBookmark',
            version: 1,
            payload: {
              record: {
                id: `${prefix}${index}`,
                url: `https://images.example.test/${prefix}${index}.jpg`,
                label: `Durable record ${index}`,
                timestamp,
                queueUpdatedAt: timestamp,
                source: 'bookmark',
                ...(index === 0 ? { captureStatus: 'captured', blobId: `${prefix}blob` } : {}),
              },
            },
          }),
        );
      }
      return responses;
    },
    { count, prefix: PREFIX },
  );
  expect(results.every((response) => (response as { payload?: { ok?: boolean } })?.payload?.ok === true)).toBe(true);
}

async function resetDestinationStorage(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const snapshot = await chrome.runtime.sendMessage({
      type: 'imageTrail.loadBookmarks',
      version: 1,
      payload: { offset: 0, limit: 500, scope: 'global' },
    });
    const ids = (snapshot?.payload?.items ?? []).map((item: { id: string }) => item.id);
    if (ids.length) await chrome.runtime.sendMessage({ type: 'imageTrail.removeBookmarks', version: 1, payload: { ids } });
    await chrome.storage.local.remove('imageTrail.localSettings');
  });
}

async function seedRecentOnlyRecord(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await chrome.runtime.sendMessage({
      type: 'imageTrail.addRecentHistory',
      version: 1,
      payload: {
        pageUrl: 'https://source.example.test/gallery',
        item: {
          id: 'recent-only-518',
          url: 'https://source.example.test/recent-only.jpg',
          label: 'RECENT ONLY SHOULD NOT APPEAR',
          timestamp: '2026-07-14T13:00:00.000Z',
          source: 'history',
        },
      },
    });
  });
}

async function firstDurableLabel(page: Page): Promise<string | undefined> {
  return page.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'imageTrail.loadBookmarks',
      version: 1,
      payload: { offset: 0, limit: 1, scope: 'global' },
    });
    return response?.payload?.items?.[0]?.label as string | undefined;
  });
}

async function savedPrivacyMode(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const response = await chrome.runtime.sendMessage({
      type: 'imageTrail.loadLocalSettings',
      version: 1,
      payload: { requestedAt: Date.now() },
    });
    return response?.payload?.settings?.privacyModeEnabled === true;
  });
}

async function activeTabUrl(serviceWorker: Worker): Promise<string | undefined> {
  return serviceWorker.evaluate(async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.url);
}

async function captureArtifact(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
