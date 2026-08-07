import type { Page, TestInfo, Worker } from '@playwright/test';

import {
  expect,
  expectPanelOpen,
  fixtureAssetPaths,
  fixturePaths,
  openFixturePage,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

const viewport = { width: 924, height: 540 };
const contextSwitcherEnabled = process.env['IMAGE_TRAIL_ENABLE_PAGE_CONTEXT_SWITCHER'] !== '0';

async function clearPageContextOverrides(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(async () => {
    const key = 'imageTrail.localSettings';
    const stored = await chrome.storage.local.get(key);
    const raw = stored[key];
    const settings = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? {}) as Record<string, unknown>);
    await chrome.storage.local.set({ [key]: JSON.stringify({ ...settings, pageContextOverrides: {} }) });
  });
}

async function seedPageContextOverride(serviceWorker: Worker, context: 'single' | 'gallery' | 'feed'): Promise<void> {
  await serviceWorker.evaluate(async (nextContext) => {
    const key = 'imageTrail.localSettings';
    const stored = await chrome.storage.local.get(key);
    const raw = stored[key];
    const settings = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : ((raw ?? {}) as Record<string, unknown>);
    await chrome.storage.local.set({
      [key]: JSON.stringify({
        ...settings,
        pageContextOverrides: { '127.0.0.1': { context: nextContext, updatedAt: Date.now() } },
      }),
    });
  }, context);
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

async function installImageRectReadCounter(page: Page, serviceWorker: Worker): Promise<void> {
  const installed = await serviceWorker.evaluate(async (activeUrl) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabId = tabs.find((candidate) => candidate.url === activeUrl)?.id;
    if (typeof tabId !== 'number') return false;
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => {
        const original = HTMLImageElement.prototype.getBoundingClientRect;
        HTMLImageElement.prototype.getBoundingClientRect = function () {
          const root = document.documentElement;
          const count = Number(root.dataset['imageTrailTestRectReads'] ?? '0');
          root.dataset['imageTrailTestRectReads'] = String(count + 1);
          return original.call(this);
        };
        document.documentElement.dataset['imageTrailTestRectReads'] = '0';
        return true;
      },
    });
    return results[0]?.result === true;
  }, page.url());
  expect(installed).toBe(true);
}

async function imageRectReads(page: Page): Promise<number> {
  const value = await page.locator('html').getAttribute('data-image-trail-test-rect-reads');
  return Number(value ?? '0');
}

test.beforeEach(async ({ page, serviceWorker }) => {
  await page.setViewportSize(viewport);
  await clearPageContextOverrides(serviceWorker);
});

test('automatically detects single and gallery contexts and supports a reversible override', async ({ page, serviceWorker }, testInfo) => {
  if (!contextSwitcherEnabled) await seedPageContextOverride(serviceWorker, 'feed');
  await openPanel(page, serviceWorker, fixturePaths.singleImage);
  if (!contextSwitcherEnabled) {
    await expect(page.locator('.image-trail-page-context-root')).toHaveCount(0);
    await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Single image');
    expect(await storedOverride(serviceWorker)).toBe('feed');
    await openPanel(page, serviceWorker, fixturePaths.multipleImages);
    await expect(page.locator('.image-trail-page-context-root')).toHaveCount(0);
    await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Gallery page · 3 images');
    return;
  }
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
  test.skip(!contextSwitcherEnabled, 'The production build intentionally omits manual page-context overrides.');
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

test('avoids remeasuring unchanged feed images during unrelated host-page churn', async ({ page, serviceWorker }) => {
  await openPanel(page, serviceWorker, fixturePaths.feed);
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Feed · 3 images');
  await page.waitForTimeout(100);
  await installImageRectReadCounter(page, serviceWorker);

  await page.evaluate(() => {
    const churn = document.createElement('div');
    churn.id = 'unrelated-feed-churn';
    for (let index = 0; index < 100; index += 1) {
      const item = document.createElement('span');
      item.textContent = `Unrelated update ${index}`;
      churn.append(item);
    }
    document.querySelector('[role="feed"]')?.append(churn);
  });
  await page.waitForTimeout(100);
  expect(await imageRectReads(page)).toBe(0);

  await page.evaluate((src) => {
    const article = document.createElement('article');
    const image = document.createElement('img');
    image.alt = 'New feed image';
    image.width = 320;
    image.height = 220;
    image.src = src;
    article.append(image);
    document.querySelector('[role="feed"]')?.append(article);
  }, fixtureAssetPaths.assetOne);
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Feed · 4 images');
  expect(await imageRectReads(page)).toBe(1);
});

test('rechecks an image when a delayed load changes its live qualification', async ({ page, serviceWorker }) => {
  let releaseResponse = (): void => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let markRequestStarted = (): void => {};
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  await page.route('**/delayed-context-image.svg', async (route) => {
    markRequestStarted();
    await responseGate;
    await route.fulfill({
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220"/></svg>',
      contentType: 'image/svg+xml',
      status: 200,
    });
  });

  await openPanel(page, serviceWorker, fixturePaths.feed);
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Feed · 3 images');
  await page.evaluate(() => {
    const article = document.createElement('article');
    const image = document.createElement('img');
    image.alt = 'Delayed feed image';
    image.style.width = '1px';
    image.style.height = '1px';
    image.src = new URL('/delayed-context-image.svg', window.location.href).href;
    article.append(image);
    document.querySelector('[role="feed"]')?.append(article);
  });
  await requestStarted;
  await page.waitForTimeout(100);
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Feed · 3 images');

  releaseResponse();
  await expect(page.locator('.image-trail-panel__target-count')).toHaveText('Feed · 4 images');
});
