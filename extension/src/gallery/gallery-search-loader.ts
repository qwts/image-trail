import type { ImageDisplayRecord } from '../core/display-records.js';
import {
  galleryFilterFacets,
  galleryRecordMatchesFilters,
  privacySafeGalleryFilters,
  type GalleryFilterFacets,
  type GalleryFilters,
} from './gallery-filters.js';
import { galleryRecordMatchesSearch, normalizeGallerySearchQuery } from './gallery-search.js';

const GALLERY_SCAN_PAGE_LIMIT = 100;

export interface GallerySourcePage {
  readonly items: readonly ImageDisplayRecord[];
  readonly offset: number;
  readonly limit: number;
  readonly total: number;
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
}

export interface GallerySearchPage extends GallerySourcePage {
  readonly filters: GalleryFilters;
  readonly facets: GalleryFilterFacets;
}

export interface GallerySearchStore {
  loadPage(input: {
    readonly offset: number;
    readonly limit: number;
    readonly scope?: 'global' | 'site' | undefined;
  }): Promise<GallerySourcePage>;
}

export class GallerySourceCache {
  private snapshot: Promise<readonly ImageDisplayRecord[]> | null = null;

  constructor(private readonly store: GallerySearchStore) {}

  load(): Promise<readonly ImageDisplayRecord[]> {
    if (this.snapshot) return this.snapshot;
    const pending = loadGallerySourceItems(this.store);
    this.snapshot = pending;
    void pending.catch(() => {
      if (this.snapshot === pending) this.snapshot = null;
    });
    return pending;
  }

  invalidate(): void {
    this.snapshot = null;
  }
}

export async function loadGallerySearchPage(input: {
  readonly store: GallerySearchStore;
  readonly sourceItems?: readonly ImageDisplayRecord[] | undefined;
  readonly query: string;
  readonly filters: GalleryFilters;
  readonly offset: number;
  readonly limit: number;
  readonly privacyMode: boolean;
}): Promise<GallerySearchPage> {
  const limit = normalizeGalleryLimit(input.limit);
  const requestedOffset = limit === 0 ? 0 : Math.max(0, input.offset);
  const query = normalizeGallerySearchQuery(input.query);
  const sourceItems = input.sourceItems ?? (await loadGallerySourceItems(input.store));
  const filters = privacySafeGalleryFilters(input.filters, input.privacyMode);
  const matches = sourceItems.filter(
    (record) =>
      galleryRecordMatchesSearch(record, query, { privacyMode: input.privacyMode }) &&
      galleryRecordMatchesFilters(record, filters, { privacyMode: input.privacyMode }),
  );
  const offset = clampGalleryOffset(requestedOffset, limit, matches.length);

  const items = limit === 0 ? matches : matches.slice(offset, offset + limit);
  return {
    items,
    filters,
    facets: galleryFilterFacets(sourceItems, { privacyMode: input.privacyMode }),
    offset,
    limit,
    total: matches.length,
    hasOlder: limit > 0 && offset + limit < matches.length,
    hasNewer: limit > 0 && offset > 0,
  };
}

async function loadGallerySourceItems(store: GallerySearchStore): Promise<readonly ImageDisplayRecord[]> {
  const items: ImageDisplayRecord[] = [];
  const seenIds = new Set<string>();
  let offset = 0;
  for (;;) {
    const page = await store.loadPage({ offset, limit: GALLERY_SCAN_PAGE_LIMIT, scope: 'global' });
    for (const item of page.items) {
      if (seenIds.has(item.id)) continue;
      seenIds.add(item.id);
      items.push(item);
    }
    const nextOffset = page.offset + page.items.length;
    if (!page.hasOlder || page.items.length === 0 || nextOffset <= offset) return items;
    offset = nextOffset;
  }
}

export function clampGalleryOffset(offset: number, limit: number, total: number): number {
  if (limit <= 0 || total <= 0) return 0;
  const lastPageOffset = Math.floor((total - 1) / limit) * limit;
  return Math.min(offset, lastPageOffset);
}

function normalizeGalleryLimit(limit: number): number {
  return Number.isInteger(limit) && limit >= 0 ? limit : 0;
}
