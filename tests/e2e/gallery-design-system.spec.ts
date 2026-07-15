import type { Page } from '@playwright/test';

import { expect, test } from './fixtures.js';

interface SeedRecord {
  readonly id: string;
  readonly url: string;
  readonly label: string;
  readonly thumbnail?: string;
  readonly timestamp: string;
  readonly captureStatus?: 'captured';
  readonly blobId?: string;
  readonly storedOriginal?: {
    readonly blobId: string;
    readonly mimeType: string;
    readonly byteLength: number;
    readonly capturedAt: string;
  };
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
    captureStatus: 'captured',
    blobId: 'gallery-filter-original',
    storedOriginal: {
      blobId: 'gallery-filter-original',
      mimeType: 'image/jpeg',
      byteLength: 128,
      capturedAt: '2026-07-14T03:00:00.000Z',
    },
  },
  {
    id: 'gallery-middle',
    url: 'https://cdn.example.test/coastline.webp',
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

const galleryAlbumName = 'References';

test.afterEach(async ({ extensionId, page }) => {
  if (!page.url().startsWith(`chrome-extension://${extensionId}/`)) await openGallery(page, extensionId);
  const cleanup = await page.evaluate(
    async ({ albumName, recordUrls }) => {
      const albumSnapshot = await chrome.runtime.sendMessage({
        type: 'imageTrail.loadAlbums',
        version: 1,
        payload: {},
      });
      const albums = (albumSnapshot?.payload?.albums ?? []) as Array<{ id: string; name: string }>;
      const albumResults = await Promise.all(
        albums
          .filter((album) => album.name === albumName)
          .map((album) =>
            chrome.runtime.sendMessage({
              type: 'imageTrail.deleteAlbum',
              version: 1,
              payload: { albumId: album.id },
            }),
          ),
      );
      const bookmarkSnapshot = await chrome.runtime.sendMessage({
        type: 'imageTrail.loadBookmarks',
        version: 1,
        payload: { offset: 0, limit: 500, scope: 'global' },
      });
      const bookmarks = (bookmarkSnapshot?.payload?.items ?? []) as Array<{ id: string; url: string }>;
      const recordIds = bookmarks.filter((record) => recordUrls.includes(record.url)).map((record) => record.id);
      const bookmarkResult = await chrome.runtime.sendMessage({
        type: 'imageTrail.removeBookmarks',
        version: 1,
        payload: { ids: recordIds },
      });
      return { albumResults, bookmarkResult, recordIds };
    },
    { albumName: galleryAlbumName, recordUrls: seedRecords.map((record) => record.url) },
  );
  expect(cleanup.albumResults.every((result) => result?.payload?.ok === true)).toBe(true);
  expect(cleanup.bookmarkResult?.payload?.ok).toBe(true);
  expect(cleanup.bookmarkResult?.payload?.removedCount).toBe(cleanup.recordIds.length);
});

test('Gallery uses the shared design system without mutating durable queue order', async ({ extensionId, page }) => {
  await openGallery(page, extensionId);
  await clearDurableQueue(page);
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
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(3);

  const hostFilter = page.getByRole('combobox', { name: 'Filter by source host' });
  await hostFilter.focus();
  await hostFilter.selectOption('cdn.example.test');
  await expect(hostFilter).toBeFocused();
  await expect(page.locator('.image-trail-gallery__card-title')).toHaveText('Coastline study');
  const typeFilter = page.getByRole('combobox', { name: 'Filter by image type' });
  await typeFilter.selectOption('WEBP');
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Filter by record kind' }).selectOption('stored-original');
  await expect(page.getByRole('heading', { name: 'No matches' })).toBeVisible();
  await expect(page.locator('.image-trail-gallery__status')).toHaveText('No gallery matches.');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(3);

  await page.getByRole('combobox', { name: 'Filter by record kind' }).selectOption('stored-original');
  await expect(page.locator('.image-trail-gallery__card-title')).toHaveText('Alpine lake');
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('.image-trail-gallery__card')).toHaveCount(3);

  await page.getByRole('textbox', { name: 'New album' }).fill(galleryAlbumName);
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
  await expect(page.locator('.image-trail-gallery__card').first()).toHaveCSS('transition-duration', '0s');
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

async function clearDurableQueue(page: Page): Promise<void> {
  const result = await page.evaluate(async () => {
    const snapshot = await chrome.runtime.sendMessage({
      type: 'imageTrail.loadBookmarks',
      version: 1,
      payload: { offset: 0, limit: 500, scope: 'global' },
    });
    const ids = (snapshot?.payload?.items ?? []).map((record: { id: string }) => record.id);
    const removal = await chrome.runtime.sendMessage({
      type: 'imageTrail.removeBookmarks',
      version: 1,
      payload: { ids },
    });
    return { removal, count: ids.length };
  });
  expect(result.removal?.payload?.ok).toBe(true);
  expect(result.removal?.payload?.removedCount).toBe(result.count);
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
