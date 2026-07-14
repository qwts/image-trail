import type { Page, TestInfo, Worker } from '@playwright/test';

import { expect, expectPanelOpen, fixturePaths, openFixturePage, test, togglePanelFromExtensionAction } from './fixtures.js';

const viewport = { width: 924, height: 540 };

async function clearPageContextOverrides(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const key = 'imageTrail.localSettings';
    const stored = await chrome.storage.local.get(key);
    const raw = stored[key];
    const settings = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? {}) as Record<string, unknown>);
    await chrome.storage.local.set({ [key]: JSON.stringify({ ...settings, pageContextOverrides: {} }) });
  });
}

async function hideBuildOverlay(page: Page): Promise<void> {
  const overlay = page.locator('#image-trail-build-identity-overlay');
  if ((await overlay.count()) > 0) await overlay.evaluate((element) => element.remove());
}

async function openPanel(page: Page, serviceWorker: Worker, path: (typeof fixturePaths)[keyof typeof fixturePaths]): Promise<void> {
  await openFixturePage(page, path);
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await hideBuildOverlay(page);
}

async function captureArtifact(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function storedOverride(serviceWorker: Worker): Promise<string | null> {
  return serviceWorker.evaluate(async () => {
    const raw = (await chrome.storage.local.get('imageTrail.localSettings'))['imageTrail.localSettings'];
    const settings = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? {}) as Record<string, unknown>);
    const overrides = settings['pageContextOverrides'] as Record<string, { context?: string }> | undefined;
    return overrides?.['127.0.0.1']?.context ?? null;
  });
}

test.beforeEach(async ({ page, serviceWorker }) => {
  await page.setViewportSize(viewport);
  await clearPageContextOverrides(serviceWorker);
});

test('automatically detects single and gallery contexts and supports a reversible override', async ({ page, serviceWorker }, testInfo) => {
  await openPanel(page, serviceWorker, fixturePaths.singleImage);
  await expect(page.getByRole('button', { name: 'Single image' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Gallery page' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Grab Mode' })).toHaveCount(0);
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Single image');

  await openPanel(page, serviceWorker, fixturePaths.multipleImages);
  await expect(page.locator('.image-trail-page-context__status')).toHaveText('Automatic · Gallery page');
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Gallery page · 3 images');
  await expect(page.getByRole('button', { name: 'Grab Mode' })).toBeVisible();
  await captureArtifact(page, testInfo, '08-context-gallery');

  await page.getByRole('button', { name: 'Feed' }).click();
  await expect(page.locator('.image-trail-page-context__status')).toContainText('Override · Feed · detected Gallery page');
  await page.getByRole('button', { name: 'Use automatic' }).click();
  await expect(page.locator('.image-trail-page-context__status')).toHaveText('Automatic · Gallery page');
});

test('detects feed context and persists only an explicit per-host override', async ({ page, serviceWorker }, testInfo) => {
  await openPanel(page, serviceWorker, fixturePaths.feed);
  await expect(page.locator('.image-trail-page-context__status')).toHaveText('Automatic · Feed');
  await expect(page.locator('.image-trail-panel__feed-hint')).toHaveText('Turn on Grab mode, then click feed images to pin.');
  await captureArtifact(page, testInfo, '09-context-feed');

  await page.getByRole('button', { name: 'Gallery page' }).click();
  await expect.poll(() => storedOverride(serviceWorker)).toBe('gallery');
  await page.reload();
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  await hideBuildOverlay(page);
  await expect(page.locator('.image-trail-page-context__status')).toContainText('Override · Gallery page · detected Feed');
  await expect(page.locator('.image-trail-panel__feed-hint')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use automatic' }).click();
  await expect.poll(() => storedOverride(serviceWorker)).toBeNull();
  await expect(page.locator('.image-trail-page-context__status')).toHaveText('Automatic · Feed');
});
