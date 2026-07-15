import type { AlbumListSnapshot } from '../data/albums-controller.js';
import type { AlbumRecord } from '../data/types.js';
import type { ImageDisplayRecord } from '../core/display-records.js';
import type { GallerySearchStore, GallerySourcePage } from './gallery-search-loader.js';

export interface GalleryAlbumSummary {
  readonly album: AlbumRecord;
  readonly recordIds: readonly string[];
}

export function galleryAlbumSummaries(snapshot: AlbumListSnapshot): readonly GalleryAlbumSummary[] {
  return snapshot.albums.map((album) => ({
    album,
    recordIds: snapshot.memberships
      .filter((membership) => membership.albumId === album.id)
      .sort((left, right) => left.position - right.position)
      .map((membership) => membership.recordId),
  }));
}

export function selectedGalleryAlbum(albums: readonly GalleryAlbumSummary[], selectedAlbumId: string | null): GalleryAlbumSummary | null {
  return albums.find((album) => album.album.id === selectedAlbumId) ?? null;
}

export function galleryListStore(items: readonly ImageDisplayRecord[]): GallerySearchStore {
  return {
    async loadPage(input: { readonly offset: number; readonly limit: number }): Promise<GallerySourcePage> {
      const offset = Math.max(0, input.offset);
      const limit = Math.max(0, input.limit);
      const pageItems = limit === 0 ? items : items.slice(offset, offset + limit);
      return {
        items: pageItems,
        offset,
        limit,
        total: items.length,
        hasOlder: limit > 0 && offset + limit < items.length,
        hasNewer: limit > 0 && offset > 0,
      };
    },
  };
}

export function missingAlbumRecordCount(album: GalleryAlbumSummary | null, items: readonly ImageDisplayRecord[]): number {
  if (!album) return 0;
  const loaded = new Set(items.map((item) => item.id));
  return album.recordIds.filter((id) => !loaded.has(id)).length;
}
