import type { Page, Worker } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  closeSettings,
  expect,
  expectPanelOpen,
  expectPanelStatusMessage,
  fixturePaths,
  launchPersistentExtensionSession,
  openFixturePage,
  openSettingsGroup,
  test,
  togglePanelFromExtensionAction,
} from './fixtures.js';

async function stopExtensionWorker(page: Page, worker: Worker): Promise<void> {
  const session = await page.context().newCDPSession(page);
  const { targetInfos } = await session.send('Target.getTargets');
  const target = targetInfos.find((candidate) => candidate.type === 'service_worker' && candidate.url === worker.url());
  if (!target) throw new Error(`Extension service-worker target not found: ${worker.url()}`);
  const closed = await session.send('Target.closeTarget', { targetId: target.targetId });
  expect(closed.success).toBe(true);
  await session.detach();
  const observer = await page.context().newCDPSession(page);
  await expect
    .poll(async () => (await observer.send('Target.getTargets')).targetInfos.some((candidate) => candidate.targetId === target.targetId), {
      timeout: 20_000,
    })
    .toBe(false);
  await observer.detach();
}

test('retains the unlocked key across an MV3 worker restart and manual lock clears it', async ({ headless }) => {
  test.setTimeout(60_000);
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'image-trail-secure-session-'));
  const { context, serviceWorker } = await launchPersistentExtensionSession(userDataDir, headless);
  const page = await context.newPage();
  try {
    await openFixturePage(page, fixturePaths.singleImage);
    await togglePanelFromExtensionAction(page, serviceWorker);
    await expectPanelOpen(page);

    await openSettingsGroup(page, 'Encrypted originals');
    await page.getByLabel('New encrypted originals password').fill('secure-session-test-password');
    await page.getByRole('button', { name: 'Create first key' }).click();
    await expect(page.locator('.image-trail-panel__encryption-badge')).toHaveText('Unlocked');
    await closeSettings(page);

    await page.getByRole('button', { name: 'Pin current' }).click();
    const row = page.locator('.image-trail-panel__bookmark-item').first();
    await expect(row).toBeVisible();
    await stopExtensionWorker(page, serviceWorker);

    await row.getByRole('button', { name: 'Capture' }).click();
    await expectPanelStatusMessage(page, /Captured \d+(?:\.\d+)? (?:B|KB|MB) image\./u);
    await expect(row.locator('.image-trail-panel__stored-original-dot')).toHaveAttribute('title', 'Original stored');

    await openSettingsGroup(page, 'Encrypted originals');
    await expect(page.locator('.image-trail-panel__encryption-badge')).toHaveText('Unlocked');
    await page.getByRole('button', { name: 'Lock now' }).click();
    await expect(page.locator('.image-trail-panel__encryption-badge')).toHaveText('AES-GCM');
    await expect(page.getByRole('button', { name: 'Unlock', exact: true })).toBeVisible();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});
