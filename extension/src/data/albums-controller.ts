import type { AlbumMembershipRecord, AlbumRecord } from './types.js';
import { openImageTrailDb } from './db.js';
import { AlbumsRepository } from './repositories/albums-repository.js';

export interface AlbumListSnapshot {
  readonly albums: readonly AlbumRecord[];
  readonly memberships: readonly AlbumMembershipRecord[];
}

export interface AlbumBackupEntry {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recordIds: readonly string[];
}

export class IndexedDbAlbumStore {
  private db: IDBDatabase | null = null;

  async listSnapshot(): Promise<AlbumListSnapshot> {
    const repository = await this.repository();
    if (!repository) return { albums: [], memberships: [] };
    return { albums: await repository.listAlbums(), memberships: await repository.listAllMemberships() };
  }

  async listBackupEntries(): Promise<readonly AlbumBackupEntry[]> {
    const { albums, memberships } = await this.listSnapshot();
    const membershipsByAlbum = new Map<string, AlbumMembershipRecord[]>();
    for (const membership of memberships) {
      const list = membershipsByAlbum.get(membership.albumId) ?? [];
      list.push(membership);
      membershipsByAlbum.set(membership.albumId, list);
    }
    return albums.map((album) => ({
      id: album.id,
      name: album.name,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      recordIds: (membershipsByAlbum.get(album.id) ?? [])
        .sort((left, right) => left.position - right.position)
        .map((item) => item.recordId),
    }));
  }

  async createAlbum(name: string): Promise<AlbumRecord | null> {
    const repository = await this.repository();
    return repository ? repository.createAlbum(name) : null;
  }

  async renameAlbum(albumId: string, name: string): Promise<AlbumRecord | null> {
    const repository = await this.repository();
    return repository ? repository.renameAlbum(albumId, name) : null;
  }

  async deleteAlbum(albumId: string): Promise<boolean> {
    const repository = await this.repository();
    return repository ? repository.deleteAlbum(albumId) : false;
  }

  async addRecords(albumId: string, recordIds: readonly string[]): Promise<readonly AlbumMembershipRecord[]> {
    const repository = await this.repository();
    return repository ? repository.addRecords(albumId, recordIds) : [];
  }

  async removeRecord(albumId: string, recordId: string): Promise<boolean> {
    const repository = await this.repository();
    return repository ? repository.removeRecord(albumId, recordId) : false;
  }

  async importBackupEntries(
    entries: readonly AlbumBackupEntry[],
    recordIdMap: ReadonlyMap<string, string>,
  ): Promise<{ readonly importedAlbumCount: number; readonly importedMembershipCount: number; readonly skippedMembershipCount: number }> {
    const repository = await this.repository();
    if (!repository) return { importedAlbumCount: 0, importedMembershipCount: 0, skippedMembershipCount: totalMembershipCount(entries) };
    let importedAlbumCount = 0;
    let importedMembershipCount = 0;
    let skippedMembershipCount = 0;
    for (const entry of entries) {
      const album = await repository.createAlbum(entry.name, { now: entry.createdAt });
      await repository.renameAlbum(album.id, entry.name, entry.updatedAt);
      importedAlbumCount += 1;
      const localIds = entry.recordIds.map((id) => recordIdMap.get(id)).filter((id): id is string => !!id);
      skippedMembershipCount += entry.recordIds.length - localIds.length;
      importedMembershipCount += (await repository.addRecords(album.id, localIds, entry.updatedAt)).length;
    }
    return { importedAlbumCount, importedMembershipCount, skippedMembershipCount };
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }

  private async repository(): Promise<AlbumsRepository | null> {
    if (!this.db) {
      const result = await openImageTrailDb();
      if (!result.db) return null;
      this.db = result.db;
    }
    return new AlbumsRepository(this.db);
  }
}

function totalMembershipCount(entries: readonly AlbumBackupEntry[]): number {
  return entries.reduce((total, entry) => total + entry.recordIds.length, 0);
}
