import type { ImageDisplayRecord } from '../core/display-records.js';
import type { PlaintextLocalSettings } from '../data/local-settings.js';
import { galleryListStore, missingAlbumRecordCount, type GalleryAlbumSummary } from './gallery-albums.js';
import type { GalleryFilters } from './gallery-filters.js';
import { loadGallerySearchPage, type GallerySearchPage, type GallerySearchStore } from './gallery-search-loader.js';

export interface GalleryBookmarkStore extends GallerySearchStore {
  loadByIds(ids: readonly string[]): Promise<readonly ImageDisplayRecord[]>;
}

type GalleryPageSettings = Pick<PlaintextLocalSettings, 'galleryPageLimit' | 'privacyModeEnabled'>;

export async function loadGalleryPageForSelection(input: {
  readonly store: GalleryBookmarkStore;
  readonly album: GalleryAlbumSummary | null;
  readonly query: string;
  readonly filters: GalleryFilters;
  readonly offset: number;
  readonly settings: GalleryPageSettings;
}): Promise<{ readonly page: GallerySearchPage; readonly missingCount: number }> {
  if (!input.album) {
    return {
      page: await loadGallerySearchPage({
        store: input.store,
        query: input.query,
        filters: input.filters,
        offset: input.offset,
        limit: input.settings.galleryPageLimit,
        privacyMode: input.settings.privacyModeEnabled,
      }),
      missingCount: 0,
    };
  }

  const records = await input.store.loadByIds(input.album.recordIds);
  return {
    page: await loadGallerySearchPage({
      store: galleryListStore(records),
      query: input.query,
      filters: input.filters,
      offset: input.offset,
      limit: input.settings.galleryPageLimit,
      privacyMode: input.settings.privacyModeEnabled,
    }),
    missingCount: missingAlbumRecordCount(input.album, records),
  };
}
