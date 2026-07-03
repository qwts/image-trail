import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ExtensionFixtures {
  extensionId: string;
  serviceWorker: Worker;
  page: Page;
}

interface ExtensionWorkerFixtures {
  extensionContext: BrowserContext;
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionPath = path.join(repoRoot, 'extension/dist');
const fixtureBaseUrl = 'http://127.0.0.1:4173';
const fixturePaths = {
  singleImage: '/single-image.html',
  multipleImages: '/multiple-images.html',
  brokenImage: '/broken-image.html',
  gallerySequence: '/gallery-sequence.html',
} as const;

function buildExtension(): void {
  execFileSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

function extensionIdFromWorker(worker: Worker): string {
  const match = /^chrome-extension:\/\/(?<extensionId>[^/]+)\//u.exec(worker.url());
  const extensionId = match?.groups?.extensionId;
  if (!extensionId) throw new Error(`Could not resolve extension id from service worker URL: ${worker.url()}`);
  return extensionId;
}

export const test = base.extend<ExtensionFixtures, ExtensionWorkerFixtures>({
  extensionContext: [
    async ({ headless }, use) => {
      buildExtension();
      const userDataDir = await mkdtemp(path.join(tmpdir(), 'image-trail-e2e-'));
      const context = await chromium.launchPersistentContext(userDataDir, {
        channel: 'chromium',
        headless,
        args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
      });

      try {
        await use(context);
      } finally {
        await context.close();
        await rm(userDataDir, { recursive: true, force: true });
      }
    },
    { scope: 'worker' },
  ],

  serviceWorker: async ({ extensionContext }, use) => {
    await use(await waitForServiceWorker(extensionContext));
  },

  extensionId: async ({ serviceWorker }, use) => {
    await use(extensionIdFromWorker(serviceWorker));
  },

  page: async ({ extensionContext }, use) => {
    const page = await extensionContext.newPage();
    try {
      await use(page);
    } finally {
      await page.close();
    }
  },
});

export { expect, fixturePaths };

export async function openFixturePage(page: Page, fixturePath: (typeof fixturePaths)[keyof typeof fixturePaths]): Promise<void> {
  await page.goto(new URL(fixturePath, fixtureBaseUrl).href);
  await page.waitForLoadState('domcontentloaded');
}

export async function togglePanelFromExtensionAction(page: Page, serviceWorker: Worker): Promise<void> {
  await page.bringToFront();
  const url = page.url();
  const result = await serviceWorker.evaluate(async (activeUrl) => {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    const tab = tabs.find((candidate) => candidate.url === activeUrl);
    if (typeof tab?.id !== 'number') throw new Error(`Could not find tab for ${activeUrl}`);

    const response = await chrome.tabs.sendMessage(tab.id, {
      type: 'imageTrail.togglePanel',
      version: 1,
      payload: { source: 'browserAction' },
    });
    return response;
  }, url);

  expect(result).toMatchObject({
    type: 'imageTrail.status',
    version: 1,
  });
}

export async function expectPanelOpen(page: Page): Promise<void> {
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(1);
  await expect(page.getByRole('dialog', { name: 'Image Trail panel' })).toBeVisible();
}

export async function expectPanelClosed(page: Page): Promise<void> {
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(0);
}
