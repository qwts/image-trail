import {
  createAddAlbumRecordsMessage,
  createCreateAlbumMessage,
  createDeleteAlbumMessage,
  createImportAlbumBackupMessage,
  createLoadAlbumsMessage,
  createRemoveAlbumRecordMessage,
  createRenameAlbumMessage,
  isAddAlbumRecordsResultMessage,
  isCreateAlbumResultMessage,
  isDeleteAlbumResultMessage,
  isImportAlbumBackupResultMessage,
  isLoadAlbumsResultMessage,
  isRemoveAlbumRecordResultMessage,
  isRenameAlbumResultMessage,
} from '../background/messages.js';
import type { AlbumBackupEntry, AlbumListSnapshot } from '../data/albums-controller.js';
import type { AlbumMembershipRecord, AlbumRecord } from '../data/types.js';
import { sendRuntimeMessage } from './runtime-message.js';

export class ExtensionAlbumStore {
  async listSnapshot(): Promise<AlbumListSnapshot> {
    const response = await sendRuntimeMessage(createLoadAlbumsMessage());
    if (isLoadAlbumsResultMessage(response) && response.payload.ok) {
      return { albums: response.payload.albums, memberships: response.payload.memberships };
    }
    return { albums: [], memberships: [] };
  }

  async listBackupEntries(): Promise<readonly AlbumBackupEntry[]> {
    const { albums, memberships } = await this.listSnapshot();
    const byAlbum = new Map<string, AlbumMembershipRecord[]>();
    for (const membership of memberships) {
      const list = byAlbum.get(membership.albumId) ?? [];
      list.push(membership);
      byAlbum.set(membership.albumId, list);
    }
    return albums.map((album) => ({
      id: album.id,
      name: album.name,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
      recordIds: (byAlbum.get(album.id) ?? [])
        .sort((left, right) => left.position - right.position)
        .map((membership) => membership.recordId),
    }));
  }

  async createAlbum(name: string): Promise<AlbumRecord | null> {
    const response = await sendRuntimeMessage(createCreateAlbumMessage(name));
    return isCreateAlbumResultMessage(response) && response.payload.ok ? response.payload.album : null;
  }

  async renameAlbum(albumId: string, name: string): Promise<AlbumRecord | null> {
    const response = await sendRuntimeMessage(createRenameAlbumMessage(albumId, name));
    return isRenameAlbumResultMessage(response) && response.payload.ok ? response.payload.album : null;
  }

  async deleteAlbum(albumId: string): Promise<boolean> {
    const response = await sendRuntimeMessage(createDeleteAlbumMessage(albumId));
    return isDeleteAlbumResultMessage(response) && response.payload.ok;
  }

  async addRecords(albumId: string, recordIds: readonly string[]): Promise<readonly AlbumMembershipRecord[]> {
    const response = await sendRuntimeMessage(createAddAlbumRecordsMessage(albumId, recordIds));
    return isAddAlbumRecordsResultMessage(response) && response.payload.ok ? response.payload.memberships : [];
  }

  async removeRecord(albumId: string, recordId: string): Promise<boolean> {
    const response = await sendRuntimeMessage(createRemoveAlbumRecordMessage(albumId, recordId));
    return isRemoveAlbumRecordResultMessage(response) && response.payload.ok;
  }

  async importBackupEntries(
    albums: readonly AlbumBackupEntry[],
    recordIdMap: ReadonlyMap<string, string>,
  ): Promise<{ readonly importedAlbumCount: number; readonly importedMembershipCount: number; readonly skippedMembershipCount: number }> {
    const response = await sendRuntimeMessage(
      createImportAlbumBackupMessage({
        albums,
        recordIdMap: [...recordIdMap].map(([sourceId, targetId]) => ({ sourceId, targetId })),
      }),
    );
    if (isImportAlbumBackupResultMessage(response) && response.payload.ok) return response.payload;
    return {
      importedAlbumCount: 0,
      importedMembershipCount: 0,
      skippedMembershipCount: albums.reduce((sum, album) => sum + album.recordIds.length, 0),
    };
  }
}
