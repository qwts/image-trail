import { expect, test } from './fixtures.js';
import {
  closeWorkspacePanel,
  detachHistory,
  hostSnapshot,
  keyboardSnapLeft,
  openWorkspaceFixture,
  openWorkspacePanel,
  prepareHostSnapshot,
} from './workspace-test-helpers.js';

test('SPA replacement keeps one workspace and close restores the host document', async ({ page, serviceWorker }) => {
  await openWorkspaceFixture(page, 'spa');
  const baseline = await prepareHostSnapshot(page);
  await openWorkspacePanel(page, serviceWorker);
  const rail = await keyboardSnapLeft(page, await detachHistory(page));

  await page.locator('#spa-navigate').evaluate((button: HTMLButtonElement) => button.click());
  await expect(page.locator('#host-app')).toHaveAttribute('data-route', '2');
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);
  await expect(rail).toHaveCount(1);
  expect(await page.locator('#host-app').getAttribute('style')).toBe(baseline.appStyle);
  expect(await page.locator('body').getAttribute('style')).toBe(baseline.bodyStyle);

  await closeWorkspacePanel(page);
  await expect(page.locator('[data-image-trail-selected], [data-image-trail-handle], [data-image-trail-lock-box]')).toHaveCount(0);
});

test('full navigation tears down the old workspace and the next page starts clean', async ({ page, serviceWorker }) => {
  await openWorkspaceFixture(page, 'fixed-sticky');
  await openWorkspacePanel(page, serviceWorker);
  await keyboardSnapLeft(page, await detachHistory(page));
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);

  await openWorkspaceFixture(page, 'rtl');
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(0);
  await expect(page.locator('[data-image-trail-selected], [data-image-trail-handle], [data-image-trail-lock-box]')).toHaveCount(0);
  const baseline = await prepareHostSnapshot(page);

  await openWorkspacePanel(page, serviceWorker);
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);
  await closeWorkspacePanel(page);
  expect(await hostSnapshot(page)).toEqual(baseline);
});

test('minimize during a floating drag cancels the gesture without committing stale geometry', async ({ page, serviceWorker }) => {
  await openWorkspaceFixture(page, 'responsive');
  await openWorkspacePanel(page, serviceWorker);
  const floating = await detachHistory(page);
  const original = await floating.boundingBox();
  const header = floating.locator('.image-trail-workspace__window-header');
  const box = await header.boundingBox();
  expect(original).not.toBeNull();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + 40, box!.y + 18);
  await page.mouse.down();
  await page.mouse.move(1, 300, { steps: 5 });
  await expect(page.locator('.image-trail-workspace__snap-preview[data-edge="left"]')).toBeVisible();
  await page.getByRole('button', { name: 'Minimize panel' }).evaluate((button: HTMLButtonElement) => button.click());
  await expect(floating).toHaveCount(0);
  await page.mouse.up();

  await page.getByRole('button', { name: 'Expand Image Trail panel' }).click();
  const restored = page.locator('[data-image-trail-detached-window="history"][data-workspace-mode="floating"]');
  await expect(restored).toBeVisible();
  const restoredBox = await restored.boundingBox();
  expect(restoredBox).not.toBeNull();
  expect(Math.abs(restoredBox!.x - original!.x)).toBeLessThanOrEqual(2);
  expect(Math.abs(restoredBox!.y - original!.y)).toBeLessThanOrEqual(2);
  await expect(page.locator('.image-trail-workspace__snap-preview')).toHaveCount(0);
});

test('pointer cancellation leaves a railed card ordered and interactive', async ({ page, serviceWorker }) => {
  await openWorkspaceFixture(page, 'responsive');
  await openWorkspacePanel(page, serviceWorker);
  const rail = await keyboardSnapLeft(page, await detachHistory(page));
  const card = rail.locator('[data-image-trail-detached-window="history"]');
  const header = card.locator('.image-trail-workspace__window-header');
  const box = await header.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(box!.x + 40, box!.y + 18);
  await page.mouse.down();
  await page.mouse.move(700, 360, { steps: 4 });
  await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await page.mouse.up();

  await expect(card).toBeVisible();
  await expect(card).not.toHaveClass(/is-dragging-out/u);
  await expect(card.getByRole('button', { name: 'Unsnap Recent history from left rail' })).toBeEnabled();
});
