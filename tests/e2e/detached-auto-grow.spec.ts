import type { Locator, Page, Worker } from '@playwright/test';

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

async function openCleanPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await page.setViewportSize({ width: 1_440, height: 900 });
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  const overlay = page.locator('#image-trail-build-identity-overlay');
  if ((await overlay.count()) > 0) await overlay.evaluate((element) => element.remove());

  const deleteRecents = page.getByRole('button', { name: /Delete recents/u });
  if ((await deleteRecents.count()) > 0) await deleteRecents.click();
  await expect(page.locator('.image-trail-panel__history-item')).toHaveCount(0);

  for (let pass = 0; pass < 3; pass += 1) {
    await openSettingsGroup(page, 'System');
    const deleteCurrent = page.getByRole('button', { name: /^Delete current queue \(\d+\)$/u });
    if ((await deleteCurrent.count()) > 0 && !(await deleteCurrent.isDisabled())) {
      await deleteCurrent.click();
      await page.getByRole('button', { name: /^Confirm Delete current queue \(\d+\)$/u }).click();
    }
    const deleteRecall = page.getByRole('button', { name: /^Delete Recall items \(\d+\)$/u });
    if ((await deleteRecall.count()) > 0 && !(await deleteRecall.isDisabled())) {
      await deleteRecall.click();
      await page.getByRole('button', { name: /^Confirm Delete Recall items \(\d+\)$/u }).click();
    }
    await closeSettings(page);
    if ((await page.locator('.image-trail-panel__bookmark-item').count()) === 0) break;
  }
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(0);

  await openSettingsGroup(page, 'Display');
  const visiblePins = page.getByRole('spinbutton', { name: 'Visible pins' });
  await visiblePins.fill('30');
  await visiblePins.locator('xpath=ancestor::form[1]').getByRole('button', { name: 'Apply' }).click();
  await expect(visiblePins).toHaveValue('30');
  await closeSettings(page);
}

async function loadAsset(page: Page, assetPath: string, filename: string): Promise<void> {
  await applyUrlInEditor(page, fixtureUrl(assetPath));
  await expectPanelStatusMessage(page, new RegExp(`(Loaded|Applied) .*${filename.replace('.', '\\.')}`, 'u'));
}

async function windowHeight(windowElement: Locator): Promise<number> {
  const box = await windowElement.boundingBox();
  expect(box).not.toBeNull();
  return Math.round(box!.height);
}

async function windowWidth(windowElement: Locator): Promise<number> {
  const box = await windowElement.boundingBox();
  expect(box).not.toBeNull();
  return Math.round(box!.width);
}

async function pinCurrent(queueWindow: Locator, expectedRows: number): Promise<void> {
  const pinButton = queueWindow.getByRole('button', { name: 'Pin current' });
  await expect(pinButton).toBeEnabled();
  await pinButton.click();
  await expect(queueWindow.locator('.image-trail-panel__bookmark-item')).toHaveCount(expectedRows);
}

async function moveWindow(page: Page, windowElement: Locator, left: number, top: number): Promise<void> {
  const header = windowElement.locator('.image-trail-workspace__window-header');
  const windowBox = await windowElement.boundingBox();
  const headerBox = await header.boundingBox();
  expect(windowBox).not.toBeNull();
  expect(headerBox).not.toBeNull();
  const startX = headerBox!.x + 80;
  const startY = headerBox!.y + headerBox!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + left - windowBox!.x, startY + top - windowBox!.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await windowElement.boundingBox())?.x ?? 0)).toBe(left);
}

async function resizeWindowWidth(page: Page, windowElement: Locator, accessibleName: string, delta: number): Promise<void> {
  const handle = windowElement.getByRole('button', { name: accessibleName });
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + delta, startY, { steps: 4 });
  await page.mouse.up();
}

test('detached Recents and Queue auto-grow until resized, then keep their user size and remain resizable (#572)', async ({
  page,
  serviceWorker,
}) => {
  await openCleanPanel(page, serviceWorker);
  await loadAsset(page, fixtureAssetPaths.assetOne, 'asset-one.svg');
  await page.getByRole('button', { name: 'Pin current' }).click();
  await expect(page.locator('.image-trail-panel__bookmark-item')).toHaveCount(1);

  await page.getByRole('button', { name: 'Detach Recent history into a floating window (drag to place)' }).click();
  await page.getByRole('button', { name: 'Detach Queue into a floating window (drag to place)' }).click();
  const recents = page.locator('[data-image-trail-detached-window="history"][data-workspace-mode="floating"]');
  const queue = page.locator('[data-image-trail-detached-window="bookmarks"][data-workspace-mode="floating"]');
  await expect(recents).toHaveAttribute('data-workspace-size-mode', 'auto');
  await expect(queue).toHaveAttribute('data-workspace-size-mode', 'auto');
  await moveWindow(page, recents, 600, 24);
  await moveWindow(page, queue, 1_000, 24);
  const initialRecentsHeight = await windowHeight(recents);
  const initialQueueHeight = await windowHeight(queue);

  await loadAsset(page, fixtureAssetPaths.assetTwo, 'asset-two.svg');
  await expect(recents.locator('.image-trail-panel__history-item')).toHaveCount(2);
  await expect.poll(() => windowHeight(recents)).toBeGreaterThan(initialRecentsHeight);
  await pinCurrent(queue, 2);
  await expect.poll(() => windowHeight(queue)).toBeGreaterThan(initialQueueHeight);

  await recents.getByRole('button', { name: 'Resize Recent history' }).press('Shift+ArrowDown');
  await queue.getByRole('button', { name: 'Resize Queue' }).press('Shift+ArrowDown');
  await expect(recents).toHaveAttribute('data-workspace-size-mode', 'user');
  await expect(queue).toHaveAttribute('data-workspace-size-mode', 'user');
  const userRecentsHeight = await windowHeight(recents);
  const userQueueHeight = await windowHeight(queue);
  const userRecentsWidth = await windowWidth(recents);
  const userQueueWidth = await windowWidth(queue);

  await loadAsset(page, fixtureAssetPaths.assetThree, 'asset-three.svg');
  await expect(recents.locator('.image-trail-panel__history-item')).toHaveCount(3);
  await pinCurrent(queue, 3);
  await expect.poll(() => windowHeight(recents)).toBe(userRecentsHeight);
  await expect.poll(() => windowHeight(queue)).toBe(userQueueHeight);

  await resizeWindowWidth(page, recents, 'Resize Recent history', 24);
  await expect.poll(() => windowWidth(recents)).toBe(userRecentsWidth + 24);
  await resizeWindowWidth(page, queue, 'Resize Queue', 24);
  await expect.poll(() => windowWidth(queue)).toBe(userQueueWidth + 24);

  await recents.getByRole('button', { name: 'Restore Recent history into the panel' }).click({ force: true });
  await page.getByRole('button', { name: 'Detach Recent history into a floating window (drag to place)' }).click();
  await expect(recents).toHaveAttribute('data-workspace-size-mode', 'auto');
});
