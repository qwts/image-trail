import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

interface SeedRecord {
  readonly id: string;
  readonly url: string;
  readonly label: string;
  readonly thumbnail?: string;
  readonly timestamp: string;
}

const thumbnail = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
    <rect width="240" height="160" fill="#163a52"/><path d="M0 145 76 58l42 52 32-34 90 69" fill="#1d4c35"/>
  </svg>
`)}`;

const seedRecords: readonly SeedRecord[] = [
  {
    id: 'gallery-newest',
    url: 'https://images.example.test/alpine-lake.jpg',
    label: 'Alpine lake',
    thumbnail,
    timestamp: '2026-07-14T03:00:00.000Z',
  },
  {
    id: 'gallery-middle',
    url: 'https://images.example.test/coastline.webp',
    label: 'Coastline study',
    thumbnail,
    timestamp: '2026-07-14T02:00:00.000Z',
  },
  {
    id: 'gallery-oldest',
    url: 'https://images.example.test/field-notes.png',
    label: 'Field notes',
    timestamp: '2026-07-14T01:00:00.000Z',
  },
];

test('Gallery uses the shared design system without mutating durable queue order', async ({ extensionId, page }) => {
  await openGallery(page, extensionId);
  await seedGallery(page, seedRecords);
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(3);

  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
  await expect(page.locator('.image-trail-gallery')).toHaveClass(/image-trail-panel-root/u);
  await expect(page.locator('.image-trail-ds__button').first()).toBeVisible();
  await expect(page.locator('.image-trail-ds__input').first()).toBeVisible();
  await expect(page.locator('.image-trail-ds__card').first()).toBeVisible();
  await expect(page.locator('.image-trail-ds__status-pill')).toBeVisible();
  await expect(cardLabels(page)).resolves.toEqual(['Alpine lake', 'Coastline study', 'Field notes']);
  const queueBefore = await durableQueueLabels(page);

  const search = page.getByRole('searchbox', { name: 'Search gallery' });
  await search.fill('coast');
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: /Coastline study/u })).toBeVisible();
  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(3);

  await page.getByRole('textbox', { name: 'New album' }).fill('References');
  await page.getByRole('button', { name: 'Create album' }).click();
  await expect(page.getByRole('button', { name: 'References (0)' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'All Images' }).click();
  const firstCard = page.locator('.image-trail-gallery__card').first();
  await firstCard.getByRole('button', { name: /Add Alpine lake to album/u }).click();
  await firstCard.getByRole('button', { name: 'References (0)' }).click();
  await firstCard.getByRole('button', { name: 'Apply' }).click();
  await expect(page.locator('.image-trail-gallery__status')).toHaveText('Added record to album.');
  await page.getByRole('button', { name: 'References (1)' }).click();
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(1);
  await expect(page.locator('.image-trail-gallery__card-title')).toHaveText('Alpine lake');

  expect(await durableQueueLabels(page)).toEqual(queueBefore);

  await page.setViewportSize({ width: 360, height: 740 });
  await expect(page.locator('.image-trail-gallery')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await search.focus();
  await expect(search).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('spinbutton', { name: 'Page limit' })).toBeFocused();

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const transitionDuration = await page
    .locator('.image-trail-gallery__card')
    .first()
    .evaluate((element) => getComputedStyle(element).transitionDuration);
  expect(transitionDuration).toBe('0s');
});

async function openGallery(page: Page, extensionId: string): Promise<void> {
  await page.goto(`chrome-extension://${extensionId}/src/gallery/gallery.html`);
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
}

async function seedGallery(page: Page, records: readonly SeedRecord[]): Promise<void> {
  const results = await page.evaluate(async (items) => {
    return Promise.all(
      items.map((record) =>
        chrome.runtime.sendMessage({
          type: 'imageTrail.saveBookmark',
          version: 1,
          payload: { record },
        }),
      ),
    );
  }, records);
  expect(results.every((result) => result?.payload?.ok === true)).toBe(true);
}

async function durableQueueLabels(page: Page): Promise<readonly string[]> {
  const response = await page.evaluate(async () => {
    return chrome.runtime.sendMessage({
      type: 'imageTrail.loadBookmarks',
      version: 1,
      payload: { offset: 0, limit: 20, scope: 'global' },
    });
  });
  return (response.payload.items as Array<{ label?: string }>).map((record) => record.label ?? '');
}

async function cardLabels(page: Page): Promise<readonly string[]> {
  return page.locator('.image-trail-gallery__card-title').allTextContents();
}
