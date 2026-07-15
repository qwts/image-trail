import type { Locator, Page, TestInfo, Worker } from '@playwright/test';

import { expect, expectPanelOpen, fixturePaths, fixtureUrl, togglePanelFromExtensionAction } from './fixtures.js';

export const workspaceViewport = { width: 1_440, height: 900 } as const;
export const detachedHistoryName = 'Detach Recent history into a floating window (drag to place)';

export interface HostSnapshot {
  readonly htmlStyle: string | null;
  readonly bodyStyle: string | null;
  readonly appStyle: string | null;
  readonly appParent: string;
  readonly appRect: RectSnapshot;
  readonly bodySize: { readonly width: number; readonly height: number };
  readonly scroll: { readonly x: number; readonly y: number; readonly nested: number };
  readonly selection: string;
  readonly hitTarget: string;
  readonly fixedRect: RectSnapshot;
  readonly stickyRect: RectSnapshot;
  readonly direction: string;
  readonly targetMarkup: string;
}

interface RectSnapshot {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export async function openWorkspaceFixture(page: Page, scenario: string): Promise<void> {
  await page.setViewportSize(workspaceViewport);
  await page.goto(`${fixtureUrl(fixturePaths.workspaceHostMatrix)}?case=${scenario}`);
  await page.waitForLoadState('load');
}

export async function prepareHostSnapshot(page: Page): Promise<HostSnapshot> {
  await page.evaluate(() => {
    window.scrollTo(0, 240);
    const nested = document.querySelector<HTMLElement>('#host-nested-scroll');
    if (nested) nested.scrollTop = 37;
    const selectionNode = document.querySelector('#host-selection')?.firstChild;
    if (selectionNode) {
      const range = document.createRange();
      range.selectNodeContents(selectionNode);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    document.querySelector<HTMLElement>('#host-focus')?.focus({ preventScroll: true });
  });
  return hostSnapshot(page);
}

export async function hostSnapshot(page: Page): Promise<HostSnapshot> {
  return page.evaluate(() => {
    const element = (selector: string): HTMLElement | null => document.querySelector<HTMLElement>(selector);
    const rect = (selector: string) => {
      const box = element(selector)?.getBoundingClientRect();
      return {
        x: Math.round(box?.x ?? 0),
        y: Math.round(box?.y ?? 0),
        width: Math.round(box?.width ?? 0),
        height: Math.round(box?.height ?? 0),
      };
    };
    const inlineStyle = (target: HTMLElement | null): string | null => target?.getAttribute('style') ?? null;
    const parentName = (target: HTMLElement | null): string => target?.parentElement?.tagName ?? '';
    const scrollTop = (target: HTMLElement | null): number => target?.scrollTop ?? 0;
    const selectedText = (): string => document.getSelection()?.toString() ?? '';
    const outerHtml = (target: HTMLElement | null): string => target?.outerHTML ?? '';
    const hitTarget = (): string => {
      const hitBox = element('#host-hit')?.getBoundingClientRect();
      if (!hitBox) return '';
      return document.elementFromPoint(hitBox.x + hitBox.width / 2, hitBox.y + hitBox.height / 2)?.id ?? '';
    };
    const app = element('#host-app');
    const nested = element('#host-nested-scroll');
    return {
      htmlStyle: document.documentElement.getAttribute('style'),
      bodyStyle: document.body.getAttribute('style'),
      appStyle: inlineStyle(app),
      appParent: parentName(app),
      appRect: rect('#host-app'),
      bodySize: { width: document.body.scrollWidth, height: document.body.scrollHeight },
      scroll: { x: window.scrollX, y: window.scrollY, nested: scrollTop(nested) },
      selection: selectedText(),
      hitTarget: hitTarget(),
      fixedRect: rect('#host-fixed'),
      stickyRect: rect('#host-sticky'),
      direction: getComputedStyle(document.documentElement).direction,
      targetMarkup: outerHtml(element('#host-target')),
    };
  });
}

export async function openWorkspacePanel(page: Page, serviceWorker: Worker): Promise<Locator> {
  await togglePanelFromExtensionAction(page, serviceWorker);
  await expectPanelOpen(page);
  const overlay = page.locator('#image-trail-build-identity-overlay');
  if ((await overlay.count()) > 0) await overlay.evaluate((element) => element.remove());
  return page.getByRole('dialog', { name: 'Image Trail panel' });
}

export async function detachHistory(page: Page): Promise<Locator> {
  const detach = page.getByRole('button', { name: detachedHistoryName });
  await detach.scrollIntoViewIfNeeded();
  await detach.click();
  const floating = page.locator('[data-image-trail-detached-window="history"][data-workspace-mode="floating"]');
  await expect(floating).toBeVisible();
  return floating;
}

export async function keyboardSnapLeft(page: Page, floating: Locator): Promise<Locator> {
  await floating.locator('.image-trail-workspace__window-header').focus();
  await page.keyboard.press('Alt+ArrowLeft');
  const rail = page.locator('.image-trail-workspace__rail[data-edge="left"]');
  await expect(rail).toBeVisible();
  return rail;
}

export async function closeWorkspacePanel(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Close panel' }).click();
  await expect(page.locator('#image-trail-panel-root')).toHaveCount(0);
}

export async function openWorkspaceSystemSettings(page: Page): Promise<Locator> {
  const showSettings = page.getByRole('button', { name: 'Show settings' });
  if ((await showSettings.count()) > 0) await showSettings.click();
  const heading = page.getByRole('heading', { name: 'System' });
  const group = heading.locator('xpath=ancestor::details[1]');
  if ((await group.getAttribute('open')) === null) await heading.click();
  await expect(group).toHaveAttribute('open', '');
  return group;
}

export async function captureWorkspaceArtifact(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}
