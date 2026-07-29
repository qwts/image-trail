import type { Page, Worker } from '@playwright/test';

import {
  applyUrlInEditor,
  closeSettings,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixtureAssetPaths,
  fixturePaths,
  fixtureUrl,
  openFixturePage,
  openSettingsGroup,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await page.setViewportSize({ width: 924, height: 540 });
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
}

async function clearDurableQueue(page: Page): Promise<void> {
  await openSettingsGroup(page, 'System');
  for (const name of ['current queue', 'Recall items']) {
    const button = page.getByRole('button', { name: new RegExp(`^Delete ${name} \\(\\d+\\)$`, 'u') });
    if ((await button.count()) === 0 || (await button.isDisabled())) continue;
    await button.click();
    await page.getByRole('button', { name: new RegExp(`^Confirm Delete ${name} \\(\\d+\\)$`, 'u') }).click();
  }
  await closeSettings(page);
}

async function pinUrl(page: Page, url: string, expectedVisibleCount: number): Promise<void> {
  await applyUrlInEditor(page, url);
  const escaped = url.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  await expectPanelStatusMessage(page, new RegExp(`(Loaded|Applied|Image loaded but did not change).*${escaped}`, 'u'));
  await page.getByRole('button', { name: 'Pin current' }).click();
  // Each pin does a thumbnail-generation + IndexedDB round trip; six in a row on a loaded CI
  // runner can outrun the default 5s expect timeout even though the pin itself succeeds.
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(expectedVisibleCount, { timeout: 15_000 });
}

async function setVisiblePinLimit(page: Page, limit: string): Promise<void> {
  await openSettingsGroup(page, 'Display');
  const pins = page
    .getByRole('heading', { name: 'Pins' })
    .locator('xpath=ancestor::div[contains(@class, "image-trail-panel__settings-templates")][1]');
  await pins.locator('input[type="number"]').fill(limit);
  await pins.locator('button', { hasText: 'Apply' }).click();
  await closeSettings(page);
}

test('Recall selection preserves route chrome and deep list scroll (#628)', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);
  await clearDurableQueue(page);

  for (let index = 1; index <= 6; index += 1) {
    await pinUrl(page, `${fixtureUrl(fixtureAssetPaths.assetOne)}?recall-selection=${index}`, index);
  }
  await setVisiblePinLimit(page, '1');

  await page.getByRole('button', { name: 'Open Recall' }).click();
  const recall = page.getByRole('dialog', { name: 'Recall' });
  const list = recall.locator('.image-trail-panel__recall-list');
  const rows = list.locator(':scope > li');
  await expect(rows).toHaveCount(5);

  const target = rows.last();
  await target.scrollIntoViewIfNeeded();
  const scrolled = await list.evaluate((element) => element.scrollTop);
  expect(scrolled).toBeGreaterThan(0);

  const header = recall.locator('.image-trail-panel__destination-header');
  await header.evaluate((element) => {
    element.dataset['imageTrailTestRouteIdentity'] = 'stable';
  });
  await target.click();

  await expect(list.locator(':scope > li.is-selected')).toHaveCount(1);
  await expect(header).toHaveAttribute('data-image-trail-test-route-identity', 'stable');
  await expect.poll(async () => list.evaluate((element) => element.scrollTop)).toBe(scrolled);
});
