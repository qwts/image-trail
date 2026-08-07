import type { Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  openFixturePage,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

async function addRecent(page: Page, url: string): Promise<void> {
  await applyUrlInEditor(page, url);
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  await expectPanelStatusMessage(page, new RegExp(`(Loaded|Applied) .*${escapedUrl}`, 'u'));
}

async function clearAllRecents(page: Page): Promise<void> {
  const scope = page.getByLabel('Recents scope');
  await scope.selectOption('all');
  const deleteRecents = page.getByRole('button', { name: /Delete recents/u });
  if ((await deleteRecents.count()) > 0) await deleteRecents.click();
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);
  await scope.selectOption('site');
}

async function seedOtherSiteRecent(page: Page, extensionId: string): Promise<unknown> {
  const extensionPage = await page.context().newPage();
  try {
    await extensionPage.goto(`chrome-extension://${extensionId}/src/destinations/view.html?view=dashboard`);
    return await extensionPage.evaluate(async () =>
      chrome.runtime.sendMessage({
        type: 'imageTrail.addRecentHistory',
        version: 1,
        payload: {
          pageUrl: 'https://other.test/gallery',
          item: {
            id: 'other-site-recent',
            url: 'https://images.other.test/asset-three.svg',
            timestamp: '2026-07-15T00:00:00.000Z',
            source: 'history',
          },
          scope: 'site',
        },
      }),
    );
  } finally {
    await extensionPage.close();
  }
}

test('Recents keeps sort and scope context below a one-line header at narrow widths (#754)', async ({ page, serviceWorker }) => {
  await page.setViewportSize({ width: 340, height: 720 });
  await openFixturePage(page, fixturePaths.singleImage);
  await page.evaluate(() => history.replaceState(null, '', '/a-very-long-gallery-path-that-forces-the-recents-scope-label-to-wrap'));
  await openPanel(page, serviceWorker);

  const header = page.getByRole('button', { name: 'Hide Recent history' });
  const sort = page.getByLabel('Sort Recents');
  const scope = page.getByLabel('Recents scope');
  const headerBox = (await header.boundingBox())!;
  const sortBox = (await sort.boundingBox())!;
  const scopeBox = (await scope.boundingBox())!;
  const panelBox = (await page.getByRole('dialog', { name: 'Image Trail panel' }).boundingBox())!;

  expect(headerBox.height).toBeLessThan(44);
  expect(sortBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(scopeBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  expect(sortBox.y).toBeLessThanOrEqual(scopeBox.y);
  for (const box of [sortBox, scopeBox]) {
    expect(box.x).toBeGreaterThanOrEqual(panelBox.x);
    expect(box.x + box.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
  }
  await expect(page.locator('.image-trail-panel__section-header--with-actions select')).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__history-context select')).toHaveCount(2);
  expect(await scope.evaluate((element) => element.closest('.image-trail-panel__section-header') === null)).toBe(true);

  await header.click({ position: { x: headerBox.width - 6, y: headerBox.height / 2 } });
  await expect(scope).toBeVisible();
  await expect(sort).toBeVisible();
});

test('Recents switches between current page, current site, and all sites', async ({ extensionId, page, serviceWorker }) => {
  await openFixturePage(page, fixturePaths.singleImage);
  await openPanel(page, serviceWorker);
  await clearAllRecents(page);
  await addRecent(page, fixtureUrl(fixtureAssetPaths.assetOne));
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(1);

  await openFixturePage(page, fixturePaths.redrawImage);
  await openPanel(page, serviceWorker);
  await addRecent(page, fixtureUrl(fixtureAssetPaths.assetTwo));
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(2);

  const scope = page.getByLabel('Recents scope');
  await scope.focus();
  await scope.selectOption('page');
  await expect(scope).toBeFocused();
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(1);
  await expect(page.locator('.image-trail-panel__history-item')).toContainText(['asset-two.svg']);

  await scope.selectOption('site');
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(2);

  const otherSiteResult = await seedOtherSiteRecent(page, extensionId);
  expect(otherSiteResult).toMatchObject({ payload: { items: [{ id: 'other-site-recent' }] } });

  await scope.focus();
  await scope.selectOption('all');
  await expect(scope).toBeFocused();
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(3);
  const otherSiteRow = page.locator('.image-trail-panel__history-item', { hasText: 'asset-three.svg' });
  await expect(otherSiteRow).toHaveCount(1);

  await otherSiteRow.getByRole('button', { name: 'Pin' }).click();
  await scope.selectOption('site');
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(2);
  await expect(otherSiteRow).toHaveCount(0);
});
