import { test as base, chromium, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface ExtensionFixtures {
  extensionId: string;
  serviceWorker: Worker;
  page: Page;
}

export interface ExtensionDownloadRequest {
  readonly url: string;
  readonly filename?: string;
  readonly saveAs?: boolean;
  readonly conflictAction?: string;
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
  oversizedImage: '/oversized-image.html',
  redrawImage: '/redraw-image.html',
} as const;
const fixtureAssetPaths = {
  assetOne: '/assets/asset-one.svg',
  assetTwo: '/assets/asset-two.svg',
  assetThree: '/assets/asset-three.svg',
  missingImage: '/missing-image.png',
} as const;

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
  const extensionId = match?.groups?.['extensionId'];
  if (!extensionId) throw new Error(`Could not resolve extension id from service worker URL: ${worker.url()}`);
  return extensionId;
}

export const test = base.extend<ExtensionFixtures, ExtensionWorkerFixtures>({
  extensionContext: [
    async ({ headless }, use) => {
      // The extension is built once in global-setup.ts; each worker only loads it.
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
      return tabs.find((candidate) => candidate.url === activeUrl) ?? tabs.find((candidate) => candidate.active);
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
    let scriptReady = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const tab = await findTargetTab();
      tabId = tab?.id;
      if (typeof tabId === 'number') {
        try {
          const response = await sendStatusMessage(tabId, 'imageTrail.ping');
          if (response?.type === 'imageTrail.status') {
            scriptReady = true;
            break;
          }
        } catch {
          // The production manifest injects only after an explicit activeTab gesture.
        }
      }
      await sleep(100);
    }

    if (typeof tabId !== 'number') throw new Error(`Could not find tab for ${activeUrl}`);
    if (!scriptReady) {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['src/content/content-script.js'] });
    }
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

export async function installDownloadRequestLog(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(() => {
    const globalScope = globalThis as typeof globalThis & {
      __imageTrailDownloadLog?: unknown[];
      __imageTrailOriginalDownload?: typeof chrome.downloads.download;
    };
    if (globalScope.__imageTrailOriginalDownload) {
      globalScope.__imageTrailDownloadLog = [];
      return;
    }
    globalScope.__imageTrailDownloadLog = [];
    globalScope.__imageTrailOriginalDownload = chrome.downloads.download.bind(chrome.downloads);
    chrome.downloads.download = ((...args: Parameters<typeof chrome.downloads.download>) => {
      const [options] = args;
      globalScope.__imageTrailDownloadLog?.push({
        url: options.url,
        filename: options.filename,
        saveAs: options.saveAs,
        conflictAction: options.conflictAction,
      });
      return globalScope.__imageTrailOriginalDownload!(...args);
    }) as typeof chrome.downloads.download;
  });
}

export async function clearDownloadRequestLog(serviceWorker: Worker): Promise<void> {
  await serviceWorker.evaluate(() => {
    const globalScope = globalThis as typeof globalThis & { __imageTrailDownloadLog?: unknown[] };
    globalScope.__imageTrailDownloadLog = [];
  });
}

export async function readDownloadRequestLog(serviceWorker: Worker): Promise<ExtensionDownloadRequest[]> {
  return serviceWorker.evaluate(() => {
    const globalScope = globalThis as typeof globalThis & { __imageTrailDownloadLog?: unknown[] };
    return (globalScope.__imageTrailDownloadLog ?? []) as ExtensionDownloadRequest[];
  });
}

export async function applyUrlInEditor(page: Page, url: string): Promise<void> {
  const editor = page.locator('.image-trail-panel__full-url-input');
  await editor.fill(url);
  await editor.press('Enter');
}

// Sets the parsed-field load-failure feedback mode (#450). The control lives in Settings → Automation
// → Preload; the default is Mute, so tests that assert a red field ring or an HTTP-error status must
// opt into Display/Alert. Self-contained: opens Settings, selects the mode, then closes Settings so
// it can be dropped into any test without disturbing the surrounding panel interactions.
export async function setLoadFailureFeedback(page: Page, mode: 'alert' | 'display' | 'mute'): Promise<void> {
  const showSettings = page.getByRole('button', { name: 'Show settings' });
  if ((await showSettings.count()) > 0) await showSettings.click();
  const group = page.getByRole('heading', { name: 'Automation' }).locator('xpath=ancestor::details[1]');
  if (!(await group.evaluate((element) => element.hasAttribute('open')))) {
    await page.getByRole('heading', { name: 'Automation' }).click();
  }
  await page.getByLabel('Failure feedback').selectOption(mode);
  const hideSettings = page.getByRole('button', { name: 'Hide settings' });
  if ((await hideSettings.count()) > 0) await hideSettings.click();
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
