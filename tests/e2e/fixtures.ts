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
const fixtureAssetPaths = {
  assetOne: '/assets/asset-one.svg',
  assetTwo: '/assets/asset-two.svg',
  assetThree: '/assets/asset-three.svg',
  missingImage: '/missing-image.png',
} as const;

function buildExtension(): void {
  execFileSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  });
}

async function waitForServiceWorker(context: BrowserContext): Promise<Worker> {
  const worker = context.serviceWorkers().find((candidate) => candidate.url().startsWith('chrome-extension://'));
  if (worker) return worker;

  while (true) {
    const candidate = await context.waitForEvent('serviceworker');
    if (candidate.url().startsWith('chrome-extension://')) return candidate;
  }
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

export { expect, fixtureAssetPaths, fixturePaths };

export async function openFixturePage(page: Page, fixturePath: (typeof fixturePaths)[keyof typeof fixturePaths]): Promise<void> {
  await page.goto(new URL(fixturePath, fixtureBaseUrl).href);
  await page.waitForLoadState('load');
}

export function fixtureUrl(pathname: string): string {
  return new URL(pathname, fixtureBaseUrl).href;
}

export async function togglePanelFromExtensionAction(page: Page, serviceWorker: Worker): Promise<void> {
  await page.bringToFront();
  const url = page.url();
  const result = await serviceWorker.evaluate(async (activeUrl) => {
    const findTargetTab = async (): Promise<chrome.tabs.Tab | undefined> => {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return (
        tabs.find((candidate) => candidate.url === activeUrl) ??
        tabs.find((candidate) => candidate.active && candidate.url?.startsWith('http'))
      );
    };

    const sendStatusMessage = async (tabId: number, type: 'imageTrail.ping' | 'imageTrail.togglePanel') => {
      return chrome.tabs.sendMessage(tabId, {
        type,
        version: 1,
        payload: type === 'imageTrail.ping' ? { sentAt: Date.now() } : { source: 'browserAction' },
      });
    };

    const sleep = (delayMs: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, delayMs));
    let tabId: number | undefined;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const tab = await findTargetTab();
      tabId = tab?.id;
      if (typeof tabId === 'number') {
        try {
          const response = await sendStatusMessage(tabId, 'imageTrail.ping');
          if (response?.type === 'imageTrail.status') break;
        } catch {
          // Content script is declared at document_idle; keep polling until its listener is ready.
        }
      }
      await sleep(100);
    }

    if (typeof tabId !== 'number') throw new Error(`Could not find tab for ${activeUrl}`);
    const response = await sendStatusMessage(tabId, 'imageTrail.togglePanel');
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

export function panelStatus(page: Page) {
  return page.locator('.image-trail-panel__header-status');
}

export async function expectPanelStatusMessage(page: Page, message: string | RegExp): Promise<void> {
  await expect(panelStatus(page)).toHaveAttribute('title', message);
}

export async function applyUrlInEditor(page: Page, url: string): Promise<void> {
  const editor = page.locator('.image-trail-panel__full-url-input');
  await editor.fill(url);
  await editor.press('Enter');
}

export async function imageNavigationSnapshot(page: Page, imageSelector: string, sourceSelector?: string) {
  return page.locator(imageSelector).evaluate((image, selector) => {
    const source = selector ? document.querySelector(selector) : null;
    return {
      src: image.getAttribute('src'),
      propertySrc: image instanceof HTMLImageElement ? image.src : null,
      currentSrc: image instanceof HTMLImageElement ? image.currentSrc : null,
      srcset: image.getAttribute('srcset'),
      sizes: image.getAttribute('sizes'),
      sourceSrcset: source?.getAttribute('srcset') ?? null,
      sourceSizes: source?.getAttribute('sizes') ?? null,
      style: image.getAttribute('style'),
      selected: image.getAttribute('data-image-trail-selected'),
      handle: image.getAttribute('data-image-trail-handle'),
      lockBox: image.getAttribute('data-image-trail-lock-box'),
    };
  }, sourceSelector);
}
