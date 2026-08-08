import type { Page } from '@playwright/test';

export async function pinCurrentImage(page: Page): Promise<void> {
  const capture = page.getByRole('button', { name: 'Capture original' });
  await capture.focus();
  await page.keyboard.down('Shift');
  try {
    await page.getByRole('button', { name: 'Pin current' }).click();
  } finally {
    await page.keyboard.up('Shift');
  }
}
