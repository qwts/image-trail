import type { Locator, Page, TestInfo, Worker } from '@playwright/test';

import { expect, expectPanelOpen, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

const detachHistoryName = 'Detach Recent history into a floating window (drag to place)';
const historyWindowName = 'Recent history (floating)';

async function openPanel(page: Page, serviceWorker: Worker): Promise<void> {
  await openFixturePage(page, fixturePaths.singleImage);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  const overlay = page.locator('#image-trail-build-identity-overlay');
  if ((await overlay.count()) > 0) await overlay.evaluate((element) => element.remove());
}

async function captureArtifact(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function keyboardSnap(page: Page, floating: Locator, edge: 'left' | 'top' | 'right' | 'bottom'): Promise<void> {
  const key = { left: 'ArrowLeft', top: 'ArrowUp', right: 'ArrowRight', bottom: 'ArrowDown' }[edge];
  await floating.locator('.image-trail-workspace__window-header').focus();
  await page.keyboard.down('Alt');
  await page.keyboard.down(key);
  const preview = page.locator(`.image-trail-workspace__snap-preview[data-edge="${edge}"]`);
  await expect(preview).toBeVisible();
  await expect(preview.locator('.image-trail-workspace__snap-label')).toContainText(new RegExp(`${edge} dock · position \\d+`, 'u'));
  await page.keyboard.up(key);
  await page.keyboard.up('Alt');
}

async function expectPanelOutsideRail(page: Page, rail: Locator, edge: 'left' | 'top' | 'right' | 'bottom'): Promise<void> {
  const panelBox = await page.getByRole('dialog', { name: 'Image Trail panel' }).boundingBox();
  const railBox = await rail.boundingBox();
  expect(panelBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  if (edge === 'left') expect(panelBox!.x).toBeGreaterThanOrEqual(railBox!.x + railBox!.width);
  if (edge === 'right') expect(panelBox!.x + panelBox!.width).toBeLessThanOrEqual(railBox!.x);
  if (edge === 'top') expect(panelBox!.y).toBeGreaterThanOrEqual(railBox!.y + railBox!.height);
  if (edge === 'bottom') expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(railBox!.y);
}

test('detaching Recent history opens a floating dialog with a panel placeholder and restore paths work', async ({
  page,
  serviceWorker,
}) => {
  await openPanel(page, serviceWorker);

  await page.getByRole('button', { name: detachHistoryName }).click();

  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  await expect(page.getByText('Recent history is open in a floating window.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Image Trail panel' }).locator('.image-trail-panel__history-section')).toHaveCount(0);

  // Shade is a workspace-chrome state distinct from the attached section collapse state.
  await windowEl.getByRole('button', { name: 'Shade Recent history' }).click();
  await expect(windowEl.locator('.image-trail-workspace__dom-body')).toHaveCount(0);
  await windowEl.getByRole('button', { name: 'Unshade Recent history' }).click();
  await expect(windowEl.locator('.image-trail-workspace__dom-body')).toBeVisible();

  // Close (X) restores the section into the panel and focuses the detach control.
  await windowEl.getByRole('button', { name: 'Restore Recent history into the panel' }).click();
  await expect(windowEl).toHaveCount(0);
  const detachControl = page.getByRole('button', { name: detachHistoryName });
  await expect(detachControl).toBeVisible();
  await expect(detachControl).toBeFocused();
});

test('dragging the detach control places the window at the drop point and Escape restores it', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  const detachControl = page.getByRole('button', { name: detachHistoryName });
  await detachControl.scrollIntoViewIfNeeded();
  const box = await detachControl.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  // Drag up-left into open space so the drop point sits inside the viewport clamp.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 120, startY - 160, { steps: 5 });
  await page.mouse.up();

  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const windowBox = await windowEl.boundingBox();
  expect(windowBox).not.toBeNull();
  // The window opens at the drop position (pointer minus the small grab offset, before clamping).
  // Tolerance covers sub-pixel pointer coordinates and the window's border box.
  expect(Math.abs(windowBox!.x - (startX + 120 - 24))).toBeLessThanOrEqual(4);
  expect(Math.abs(windowBox!.y - (startY - 160 - 12))).toBeLessThanOrEqual(4);

  await windowEl.press('Escape');
  await expect(windowEl).toHaveCount(0);
  await expect(page.getByRole('button', { name: detachHistoryName })).toBeVisible();
});

test('dragging a section by its heading detaches at the drop point, and Escape cancels a live drag', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  const heading = page.locator('.image-trail-panel__history-section .image-trail-panel__section-header h3');
  await heading.scrollIntoViewIfNeeded();
  const box = await heading.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width / 2;
  const startY = box!.y + box!.height / 2;

  // Escape mid-drag cancels: the ghost disappears and nothing detaches.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 150, startY - 120, { steps: 4 });
  await expect(page.locator('.image-trail-panel__detach-ghost')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.image-trail-panel__detach-ghost')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole('dialog', { name: historyWindowName })).toHaveCount(0);

  // The same gesture released normally detaches at the drop point.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 180, startY - 200, { steps: 4 });
  await page.mouse.up();
  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const windowBox = await windowEl.boundingBox();
  expect(windowBox).not.toBeNull();
  expect(Math.abs(windowBox!.x - (startX + 180 - 24))).toBeLessThanOrEqual(4);
  expect(Math.abs(windowBox!.y - (startY - 200 - 12))).toBeLessThanOrEqual(4);
});

test('React workspace chrome snaps to every edge with pointer and keyboard previews and ordered stacks', async ({
  page,
  serviceWorker,
}, testInfo) => {
  await openPanel(page, serviceWorker);
  await page.setViewportSize({ width: 1_280, height: 800 });
  await page.getByRole('button', { name: detachHistoryName }).click();

  for (const edge of ['left', 'top', 'right', 'bottom'] as const) {
    const floating = page.locator('[data-image-trail-detached-window="history"][data-workspace-mode="floating"]');
    await keyboardSnap(page, floating, edge);
    const rail = page.locator(`[data-edge="${edge}"].image-trail-workspace__rail`);
    const card = rail.locator('[data-image-trail-detached-window="history"][data-workspace-mode="railed"]');
    await expect(card).toBeVisible();
    await expectPanelOutsideRail(page, rail, edge);
    const unsnap = card.getByRole('button', { name: `Unsnap Recent history from ${edge} rail` });
    await expect(unsnap).toBeFocused();
    await captureArtifact(page, testInfo, `workspace-${edge}-rail`);
    await unsnap.click();
    await expect(floating).toBeVisible();
    await expect(floating.locator('.image-trail-workspace__window-header')).toBeFocused();
  }

  const floating = page.locator('[data-image-trail-detached-window="history"][data-workspace-mode="floating"]');
  const movedHeader = floating.locator('.image-trail-workspace__window-header');
  const box = await movedHeader.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 40, box!.y + 16);
  await page.mouse.down();
  await page.mouse.move(1, 300, { steps: 6 });
  await expect(page.locator('.image-trail-workspace__snap-preview[data-edge="left"]')).toBeVisible();
  await page.mouse.up();
  const leftRail = page.locator('[data-edge="left"].image-trail-workspace__rail');
  await expect(leftRail).toBeVisible();

  await page.setViewportSize({ width: 800, height: 600 });
  await expect(leftRail).toHaveCount(0);
  await expect(floating).toBeVisible();
  const clamped = await floating.boundingBox();
  expect(clamped).not.toBeNull();
  expect(clamped!.x).toBeGreaterThanOrEqual(12);
  expect(clamped!.x + clamped!.width).toBeLessThanOrEqual(788);
  const fallbackHeader = floating.locator('.image-trail-workspace__window-header');
  await fallbackHeader.focus();
  await page.keyboard.down('Alt');
  await page.keyboard.down('ArrowLeft');
  const fallbackPreview = page.locator('.image-trail-workspace__snap-preview.is-fallback[data-edge="left"]');
  await expect(fallbackPreview).toBeVisible();
  await expect(fallbackPreview.locator('.image-trail-workspace__snap-label')).toHaveText('keep floating');
  await expect(
    page.locator('[role="status"]').filter({ hasText: 'will stay floating because the left rail leaves too little center space' }),
  ).toHaveCount(1);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('Alt');
  await expect(leftRail).toHaveCount(0);

  await page.setViewportSize({ width: 1_280, height: 800 });
  await keyboardSnap(page, floating, 'left');
  await expect(leftRail).toBeVisible();

  await page.getByRole('button', { name: 'Detach Queue into a floating window (drag to place)' }).click();
  await keyboardSnap(page, page.locator('[data-image-trail-detached-window="bookmarks"][data-workspace-mode="floating"]'), 'left');
  await leftRail.getByRole('button', { name: 'Move Queue earlier in left rail' }).click();
  await expect(leftRail.locator('[data-workspace-mode="railed"]').first()).toHaveAttribute('data-image-trail-detached-window', 'bookmarks');
  await captureArtifact(page, testInfo, 'workspace-left-rail-stack');

  const queueCard = leftRail.locator('[data-image-trail-detached-window="bookmarks"]');
  const queueHeader = queueCard.locator('.image-trail-workspace__window-header');
  const queueHeaderBox = await queueHeader.boundingBox();
  expect(queueHeaderBox).not.toBeNull();
  await page.mouse.move(queueHeaderBox!.x + 60, queueHeaderBox!.y + 16);
  await page.mouse.down();
  await page.mouse.move(700, 360, { steps: 4 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(queueCard).toBeVisible();

  await page.mouse.move(queueHeaderBox!.x + 60, queueHeaderBox!.y + 16);
  await page.mouse.down();
  await page.mouse.move(700, 360, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('[data-image-trail-detached-window="bookmarks"][data-workspace-mode="floating"]')).toBeVisible();
});

test('detached Settings follows the gear toggle without duplicating the surface', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  await page.getByRole('button', { name: 'Show settings' }).click();
  await page.getByRole('button', { name: 'Detach Settings into a floating window (drag to place)' }).click();

  const settingsWindow = page.getByRole('dialog', { name: 'Settings (floating)' });
  await expect(settingsWindow).toBeVisible();
  await expect(page.locator('.image-trail-panel__settings-section')).toHaveCount(1, {
    timeout: 5000,
  });

  // The gear hides the window (Settings closed) and shows it again — never a duplicate.
  await page.getByRole('button', { name: 'Hide settings' }).click();
  await expect(settingsWindow).toHaveCount(0);
  await page.getByRole('button', { name: 'Show settings' }).click();
  await expect(settingsWindow).toBeVisible();
  await expect(page.locator('.image-trail-panel__settings-section')).toHaveCount(1);

  await settingsWindow.getByRole('button', { name: 'Restore Settings into the panel' }).click();
  await expect(settingsWindow).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Image Trail panel' }).locator('.image-trail-panel__settings-section')).toHaveCount(1);
});

test('the per-site workspace layout persists across a reload when opted in, and reset reattaches everything', async ({
  page,
  serviceWorker,
}) => {
  await openPanel(page, serviceWorker);

  const openSystemGroup = async (): Promise<void> => {
    const showSettingsButton = page.getByRole('button', { name: 'Show settings' });
    if ((await showSettingsButton.count()) > 0) await showSettingsButton.click();
    const heading = page.getByRole('heading', { name: 'System' });
    const group = heading.locator('xpath=ancestor::details[1]');
    if (!(await group.evaluate((element) => element.hasAttribute('open')))) await heading.click();
  };

  // Opt in (System → Panel layout), then close settings to leave a clean panel.
  await openSystemGroup();
  const restoreToggle = page.getByLabel('Restore workspace layout per site');
  await restoreToggle.check();
  await page.getByRole('button', { name: 'Hide settings' }).click();
  await page.getByRole('button', { name: 'Hide the Queue list' }).click();

  // Detach Recent history, drag its window to a distinctive spot, and shade it.
  await page.getByRole('button', { name: detachHistoryName }).click();
  const windowEl = page.getByRole('dialog', { name: historyWindowName });
  await expect(windowEl).toBeVisible();
  const header = windowEl.locator('.image-trail-workspace__window-header');
  const headerBox = await header.boundingBox();
  expect(headerBox).not.toBeNull();
  // Park the window at the far left, well clear of the right-docked panel, so the restored
  // (minimized) title bar can never sit over the panel's controls and intercept later clicks.
  await page.mouse.move(headerBox!.x + 40, headerBox!.y + headerBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(90, 420, { steps: 8 });
  await page.mouse.up();
  const movedBox = await windowEl.boundingBox();
  expect(movedBox).not.toBeNull();
  await windowEl.getByRole('button', { name: 'Shade Recent history' }).click();
  // Let the debounced save (400ms) flush before reloading.
  await page.waitForTimeout(700);

  await page.reload();
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);

  // The saved workspace restores: Recent history opens detached, at the dragged spot, still shaded.
  const restoredWindow = page.getByRole('dialog', { name: historyWindowName });
  await expect(restoredWindow).toBeVisible();
  const restoredBox = await restoredWindow.boundingBox();
  expect(restoredBox).not.toBeNull();
  expect(Math.abs(restoredBox!.x - movedBox!.x)).toBeLessThanOrEqual(4);
  expect(Math.abs(restoredBox!.y - movedBox!.y)).toBeLessThanOrEqual(4);
  await expect(restoredWindow.locator('.image-trail-workspace__dom-body')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Show the Queue list' })).toBeVisible();

  // Reset clears the saved layout for the site and reattaches the section.
  await openSystemGroup();
  await page.getByRole('button', { name: 'Reset workspace layout' }).click();
  await expect(restoredWindow).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide settings' }).click();
  await expect(page.getByRole('button', { name: detachHistoryName })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hide the Queue list' })).toBeVisible();

  // Leave the shared profile the way we found it: opt back out.
  await openSystemGroup();
  await page.getByLabel('Restore workspace layout per site').uncheck();
});

test('a detached section window keeps its header-row action toolbar usable (#430)', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker);

  await page.getByRole('button', { name: 'Detach Queue into a floating window (drag to place)' }).click();
  const windowEl = page.getByRole('dialog', { name: 'Queue (floating)' });
  await expect(windowEl).toBeVisible();

  // The window chrome carries the title, but the header row must stay for its actions: the
  // toolbar moved into the section header (#430) and previously vanished with it when detached.
  await expect(windowEl.getByRole('button', { name: 'Pin current' })).toBeVisible();
  await expect(windowEl.getByTitle('Queue scope and maintenance actions.')).toBeVisible();
  await expect(windowEl.locator('.image-trail-panel__section-header--with-actions h3')).toBeHidden();

  // A detached header carries no live toggle (#441): clicking its surface must not flip the
  // hidden attached collapse state — the restored section comes back expanded.
  await windowEl.locator('.image-trail-panel__section-header').click({ position: { x: 10, y: 10 } });
  await windowEl.locator('.image-trail-panel__section-header').click({ position: { x: 10, y: 10 } });

  await windowEl.getByRole('button', { name: 'Restore Queue into the panel' }).click();
  await expect(windowEl).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Hide the Queue list' })).toBeVisible();
  await expect(page.locator('.image-trail-panel__bookmark-status-row')).toHaveCount(1);
});
