import type { Page, Worker } from '@playwright/test';

import { expect, fixturePaths, openFixturePage, resetExtensionLibrary, test } from './fixtures.js';
import { pinCurrentImage } from './current-image-actions.js';
import { detachHistory, keyboardSnapLeft, openWorkspacePanel, workspaceViewport } from './workspace-test-helpers.js';

interface RenderCounters {
  readonly panel: number;
  readonly recall: number;
}

test.afterEach(async ({ extensionId, page }) => {
  await resetExtensionLibrary(page, extensionId);
});

async function installRenderCounters(page: Page, serviceWorker: Worker): Promise<void> {
  const installed = await serviceWorker.evaluate(async (activeUrl) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tabId = tabs.find((candidate) => candidate.url === activeUrl)?.id;
    if (typeof tabId !== 'number') return false;
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'ISOLATED',
      func: () => {
        const original = Element.prototype.replaceChildren;
        Element.prototype.replaceChildren = function (...nodes) {
          const html = document.documentElement;
          if (this.matches('.image-trail-panel')) {
            html.dataset['imageTrailTestPanelRebuilds'] = String(Number(html.dataset['imageTrailTestPanelRebuilds'] ?? '0') + 1);
          }
          if (this.matches('.image-trail-panel__destination-dom-host[data-destination="recall"]')) {
            html.dataset['imageTrailTestRecallRebuilds'] = String(Number(html.dataset['imageTrailTestRecallRebuilds'] ?? '0') + 1);
          }
          original.call(this, ...nodes);
        };
        document.documentElement.dataset['imageTrailTestPanelRebuilds'] = '0';
        document.documentElement.dataset['imageTrailTestRecallRebuilds'] = '0';
        return true;
      },
    });
    return results[0]?.result === true;
  }, page.url());
  expect(installed).toBe(true);
}

async function resetRenderCounters(page: Page): Promise<void> {
  await page.locator('html').evaluate((html) => {
    html.dataset['imageTrailTestPanelRebuilds'] = '0';
    html.dataset['imageTrailTestRecallRebuilds'] = '0';
  });
}

async function renderCounters(page: Page): Promise<RenderCounters> {
  return page.locator('html').evaluate((html) => ({
    panel: Number(html.dataset['imageTrailTestPanelRebuilds'] ?? '0'),
    recall: Number(html.dataset['imageTrailTestRecallRebuilds'] ?? '0'),
  }));
}

test('panel drag stays geometry-only and viewport bursts render once at resize end', async ({ extensionId, page, serviceWorker }) => {
  test.setTimeout(60_000);
  await resetExtensionLibrary(page, extensionId);
  await page.setViewportSize(workspaceViewport);
  await openFixturePage(page, fixturePaths.singleImage);
  const panel = await openWorkspacePanel(page, serviceWorker);
  await pinCurrentImage(page);
  await expect(panel.locator('.image-trail-panel__bookmark-item')).toHaveCount(1);
  await keyboardSnapLeft(page, await detachHistory(page));
  await panel.getByRole('button', { name: 'Open Recall' }).click();
  const recall = page.getByRole('dialog', { name: 'Recall' });
  await expect(recall).toBeVisible();
  await expect(recall.getByRole('button', { name: 'Reload' })).toBeEnabled();
  await expect(recall).toContainText('Select records to bring back into the visible queue.');
  await installRenderCounters(page, serviceWorker);

  const title = panel.locator('.image-trail-panel__title');
  const titleBox = await title.boundingBox();
  expect(titleBox).not.toBeNull();
  await page.mouse.move(titleBox!.x + titleBox!.width / 2, titleBox!.y + titleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(titleBox!.x + 120, titleBox!.y + 80, { steps: 12 });
  await page.mouse.up();
  expect(await renderCounters(page)).toEqual({ panel: 0, recall: 0 });
  await expect(recall).toBeVisible();

  await resetRenderCounters(page);
  await page.evaluate(() => {
    for (let index = 0; index < 20; index += 1) {
      window.dispatchEvent(new Event('resize'));
      window.visualViewport?.dispatchEvent(new Event('resize'));
    }
  });
  expect(await renderCounters(page)).toEqual({ panel: 0, recall: 0 });
  await expect.poll(async () => (await renderCounters(page)).panel).toBe(1);
  await page.waitForTimeout(250);
  const afterResize = await renderCounters(page);
  expect(afterResize.panel).toBe(1);
  expect(afterResize.recall).toBeGreaterThan(0);
  expect(afterResize.recall).toBeLessThanOrEqual(2);
});
