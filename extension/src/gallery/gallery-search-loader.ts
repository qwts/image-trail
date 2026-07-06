import type { ImageDisplayRecord } from '../core/display-records.js';
import { galleryRecordMatchesSearch, normalizeGallerySearchQuery } from './gallery-search.js';

const ALL_GALLERY_RECORDS_LIMIT = Number.MAX_SAFE_INTEGER;

export interface GallerySearchPage {
  readonly items: readonly ImageDisplayRecord[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
}

export interface GallerySearchStore {
  loadPage(input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
  }): Promise<GallerySearchPage>;
}

export async function loadGallerySearchPage(input: {
  readonly store: GallerySearchStore;
  readonly query: string;
  readonly offset: number;
  readonly limit: number;
  readonly privacyMode: boolean;
}): Promise<GallerySearchPage> {
  const limit = normalizeGalleryLimit(input.limit);
  const offset = limit === 0 ? 0 : Math.max(0, input.offset);
  const query = normalizeGallerySearchQuery(input.query);
  if (!query && limit > 0) return input.store.loadPage({ offset, limit, scope: 'global' });

  const source = await input.store.loadPage({ offset: 0, limit: ALL_GALLERY_RECORDS_LIMIT, scope: 'global' });
  const matches = source.items.filter((record) => galleryRecordMatchesSearch(record, query, { privacyMode: input.privacyMode }));

  const items = limit === 0 ? matches : matches.slice(offset, offset + limit);
  return {
    items,
    offset,
    limit,
    total: matches.length,
    hasOlder: limit > 0 && offset + limit < matches.length,
    hasNewer: limit > 0 && offset > 0,
  };
}

function normalizeGalleryLimit(limit: number): number {
  return Number.isInteger(limit) && limit >= 0 ? limit : 0;
}
