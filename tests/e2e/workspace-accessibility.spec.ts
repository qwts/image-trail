import { expect, test } from './fixtures.js';
import {
  closeWorkspacePanel,
  detachedHistoryName,
  detachHistory,
  keyboardSnapLeft,
  openWorkspaceFixture,
  openWorkspacePanel,
  prepareHostSnapshot,
} from './workspace-test-helpers.js';

test('keyboard focus, names, announcements, and reduced motion survive every workspace state', async ({ page, serviceWorker }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openWorkspaceFixture(page, 'responsive');
  await openWorkspacePanel(page, serviceWorker);
  const floating = await detachHistory(page);
  const restore = floating.getByRole('button', { name: 'Restore Recent history into the panel' });
  await expect(restore).toBeFocused();
  expect(await floating.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');

  await floating.getByRole('button', { name: 'Shade Recent history' }).click();
  await expect(floating.getByRole('button', { name: 'Unshade Recent history' })).toBeFocused();
  await expect(page.locator('.image-trail-workspace__announcement')).toContainText('Recent history floating, shaded');
  await floating.getByRole('button', { name: 'Unshade Recent history' }).click();

  const rail = await keyboardSnapLeft(page, floating);
  const unsnap = rail.getByRole('button', { name: 'Unsnap Recent history from left rail' });
  await expect(unsnap).toBeFocused();
  await expect(page.locator('.image-trail-workspace__announcement')).toContainText('Recent history docked to left rail, position 1');
  await rail.getByRole('button', { name: 'Restore Recent history into the panel' }).click();
  await expect(page.getByRole('button', { name: detachedHistoryName })).toBeFocused();
});

test('coarse-pointer workspace controls expose 44px touch targets', async ({ page, serviceWorker }) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'pointer', value: 'coarse' }] });
  await openWorkspaceFixture(page, 'responsive');
  await openWorkspacePanel(page, serviceWorker);
  const floating = await detachHistory(page);
  expect(await page.evaluate(() => matchMedia('(pointer: coarse)').matches)).toBe(true);

  const sizes = await floating.locator('.image-trail-workspace__window-actions button').evaluateAll((buttons) =>
    buttons.map((button) => {
      const style = getComputedStyle(button);
      return { width: Number.parseFloat(style.width), height: Number.parseFloat(style.height) };
    }),
  );
  expect(sizes.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true);
});

test('zoom-equivalent and narrow CSS viewports fall back to reachable floating geometry', async ({ page, serviceWorker }) => {
  await openWorkspaceFixture(page, 'responsive');
  const panel = await openWorkspacePanel(page, serviceWorker);
  await keyboardSnapLeft(page, await detachHistory(page));

  await page.setViewportSize({ width: 720, height: 450 });
  await expect(page.locator('.image-trail-workspace__rail')).toHaveCount(0);
  const floating = page.locator('[data-image-trail-detached-window="history"][data-workspace-mode="floating"]');
  await expect(floating).toBeVisible();
  const zoomBox = await floating.boundingBox();
  expect(zoomBox).not.toBeNull();
  expect(zoomBox!.x).toBeGreaterThanOrEqual(12);
  expect(zoomBox!.x + zoomBox!.width).toBeLessThanOrEqual(708);

  await page.setViewportSize({ width: 360, height: 740 });
  const narrowPanel = await panel.boundingBox();
  const narrowWindow = await floating.boundingBox();
  expect(narrowPanel).not.toBeNull();
  expect(narrowWindow).not.toBeNull();
  expect(narrowPanel!.width).toBeLessThanOrEqual(336);
  expect(narrowWindow!.width).toBeLessThanOrEqual(336);
  expect(narrowWindow!.x).toBeGreaterThanOrEqual(12);
  expect(narrowWindow!.x + narrowWindow!.width).toBeLessThanOrEqual(348);
});

test('host fullscreen hides and restores the injected overlay without leaving host mutations', async ({ page, serviceWorker }) => {
  await openWorkspaceFixture(page, 'fullscreen');
  const baseline = await prepareHostSnapshot(page);
  const panel = await openWorkspacePanel(page, serviceWorker);
  await page.locator('#fullscreen-button').click();
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null)).toBe('fullscreen-surface');
  await expect.poll(() => page.evaluate(() => document.elementFromPoint(200, 200)?.id ?? null)).toBe('fullscreen-surface');

  await page.evaluate(() => document.exitFullscreen());
  await expect.poll(() => page.evaluate(() => document.fullscreenElement?.id ?? null)).toBeNull();
  await expect(panel).toBeVisible();
  await closeWorkspacePanel(page);
  expect((await prepareHostSnapshot(page)).htmlStyle).toBe(baseline.htmlStyle);
  expect((await prepareHostSnapshot(page)).bodyStyle).toBe(baseline.bodyStyle);
});
