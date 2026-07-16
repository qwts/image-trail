import * as v from 'valibot';
import { requestToPromise, transactionDone } from '../idb-helpers.js';
import { DataStore, SchemaIndex } from '../schema.js';
import type { AlbumMembershipRecord, AlbumRecord } from '../types.js';
import { hydrateRecord, hydrateRecords } from './hydration.js';

const albumRecordSchema = v.object({
  id: v.string(),
  schemaVersion: v.literal(1),
  name: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
}) as v.GenericSchema<unknown, AlbumRecord>;

const albumMembershipRecordSchema = v.object({
  id: v.string(),
  schemaVersion: v.literal(1),
  albumId: v.string(),
  recordId: v.string(),
  position: v.number(),
  addedAt: v.string(),
}) as v.GenericSchema<unknown, AlbumMembershipRecord>;

export class AlbumsRepository {
  constructor(private readonly db: IDBDatabase) {}

  async listAlbums(): Promise<readonly AlbumRecord[]> {
    const transaction = this.db.transaction(DataStore.Albums, 'readonly');
    const result = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.Albums).getAll());
    await transactionDone(transaction);
    return hydrateRecords(DataStore.Albums, albumRecordSchema, result).sort(compareAlbums);
  }

  async getAlbum(id: string): Promise<AlbumRecord | undefined> {
    const transaction = this.db.transaction(DataStore.Albums, 'readonly');
    const result = await requestToPromise<unknown>(transaction.objectStore(DataStore.Albums).get(id));
    await transactionDone(transaction);
    return hydrateRecord(DataStore.Albums, albumRecordSchema, result);
  }

  async listMemberships(albumId: string): Promise<readonly AlbumMembershipRecord[]> {
    const transaction = this.db.transaction(DataStore.AlbumMemberships, 'readonly');
    const index = transaction.objectStore(DataStore.AlbumMemberships).index(SchemaIndex.AlbumMembershipsByAlbumPosition);
    const result = await requestToPromise<unknown[]>(index.getAll(IDBKeyRange.bound([albumId, -Infinity], [albumId, Infinity])));
    await transactionDone(transaction);
    return hydrateRecords(DataStore.AlbumMemberships, albumMembershipRecordSchema, result).sort(compareMemberships);
  }

  async listAllMemberships(): Promise<readonly AlbumMembershipRecord[]> {
    const transaction = this.db.transaction(DataStore.AlbumMemberships, 'readonly');
    const result = await requestToPromise<unknown[]>(transaction.objectStore(DataStore.AlbumMemberships).getAll());
    await transactionDone(transaction);
    return hydrateRecords(DataStore.AlbumMemberships, albumMembershipRecordSchema, result).sort(compareMemberships);
  }

  async putAlbum(record: AlbumRecord): Promise<AlbumRecord> {
    const transaction = this.db.transaction(DataStore.Albums, 'readwrite');
    transaction.objectStore(DataStore.Albums).put(record);
    await transactionDone(transaction);
    return record;
  }

  async createAlbum(name: string, options: { readonly id?: string; readonly now?: string } = {}): Promise<AlbumRecord> {
    const now = options.now ?? new Date().toISOString();
    const record: AlbumRecord = {
      id: options.id ?? crypto.randomUUID(),
      schemaVersion: 1,
      name: normalizeAlbumName(name),
      createdAt: now,
      updatedAt: now,
    };
    return this.putAlbum(record);
  }

  async renameAlbum(id: string, name: string, now = new Date().toISOString()): Promise<AlbumRecord | null> {
    const transaction = this.db.transaction(DataStore.Albums, 'readwrite');
    const store = transaction.objectStore(DataStore.Albums);
    const existing = hydrateRecord(DataStore.Albums, albumRecordSchema, await requestToPromise<unknown>(store.get(id)));
    if (!existing) {
      await transactionDone(transaction);
      return null;
    }
    const next = { ...existing, name: normalizeAlbumName(name), updatedAt: now };
    store.put(next);
    await transactionDone(transaction);
    return next;
  }

  async deleteAlbum(id: string): Promise<boolean> {
    const transaction = this.db.transaction([DataStore.Albums, DataStore.AlbumMemberships], 'readwrite');
    const albumStore = transaction.objectStore(DataStore.Albums);
    const existing = await requestToPromise<unknown>(albumStore.get(id));
    albumStore.delete(id);
    const membershipIndex = transaction.objectStore(DataStore.AlbumMemberships).index(SchemaIndex.AlbumMembershipsByAlbumId);
    await deleteCursorRange(membershipIndex.openCursor(IDBKeyRange.only(id)));
    await transactionDone(transaction);
    return !!hydrateRecord(DataStore.Albums, albumRecordSchema, existing);
  }

  async addRecords(
    albumId: string,
    recordIds: readonly string[],
    now = new Date().toISOString(),
  ): Promise<readonly AlbumMembershipRecord[]> {
    const uniqueIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];
    if (uniqueIds.length === 0) return [];
    const transaction = this.db.transaction([DataStore.Albums, DataStore.AlbumMemberships], 'readwrite');
    const albums = transaction.objectStore(DataStore.Albums);
    const album = hydrateRecord(DataStore.Albums, albumRecordSchema, await requestToPromise<unknown>(albums.get(albumId)));
    if (!album) {
      await transactionDone(transaction);
      return [];
    }

    const memberships = transaction.objectStore(DataStore.AlbumMemberships);
    const existing = await membershipsForAlbum(memberships, albumId);
    let position = existing.reduce((max, record) => Math.max(max, record.position), -1);
    const existingRecordIds = new Set(existing.map((record) => record.recordId));
    const added: AlbumMembershipRecord[] = [];
    for (const recordId of uniqueIds) {
      if (existingRecordIds.has(recordId)) continue;
      position += 1;
      const record = albumMembershipRecord(albumId, recordId, position, now);
      memberships.put(record);
      added.push(record);
    }
    if (added.length > 0) albums.put({ ...album, updatedAt: now });
    await transactionDone(transaction);
    return added;
  }

  async replaceRecords(
    albumId: string,
    recordIds: readonly string[],
    now = new Date().toISOString(),
  ): Promise<readonly AlbumMembershipRecord[]> {
    const uniqueIds = [...new Set(recordIds.map((id) => id.trim()).filter(Boolean))];
    const transaction = this.db.transaction([DataStore.Albums, DataStore.AlbumMemberships], 'readwrite');
    const albums = transaction.objectStore(DataStore.Albums);
    const album = hydrateRecord(DataStore.Albums, albumRecordSchema, await requestToPromise<unknown>(albums.get(albumId)));
    if (!album) {
      await transactionDone(transaction);
      return [];
    }

    const memberships = transaction.objectStore(DataStore.AlbumMemberships);
    await deleteCursorRange(memberships.index(SchemaIndex.AlbumMembershipsByAlbumId).openCursor(IDBKeyRange.only(albumId)));
    const replaced = uniqueIds.map((recordId, position) => albumMembershipRecord(albumId, recordId, position, now));
    for (const membership of replaced) memberships.put(membership);
    albums.put({ ...album, updatedAt: now });
    await transactionDone(transaction);
    return replaced;
  }

  async removeRecord(albumId: string, recordId: string, now = new Date().toISOString()): Promise<boolean> {
    const transaction = this.db.transaction([DataStore.Albums, DataStore.AlbumMemberships], 'readwrite');
    const albums = transaction.objectStore(DataStore.Albums);
    const album = hydrateRecord(DataStore.Albums, albumRecordSchema, await requestToPromise<unknown>(albums.get(albumId)));
    const memberships = transaction.objectStore(DataStore.AlbumMemberships);
    const index = memberships.index(SchemaIndex.AlbumMembershipsByAlbumRecord);
    const existing = hydrateRecord(
      DataStore.AlbumMemberships,
      albumMembershipRecordSchema,
      await requestToPromise<unknown>(index.get([albumId, recordId])),
    );
    if (existing) memberships.delete(existing.id);
    if (existing && album) albums.put({ ...album, updatedAt: now });
    await transactionDone(transaction);
    return !!existing;
  }
}

function albumMembershipRecord(albumId: string, recordId: string, position: number, addedAt: string): AlbumMembershipRecord {
  return {
    id: `${albumId}:${recordId}`,
    schemaVersion: 1,
    albumId,
    recordId,
    position,
    addedAt,
  };
}

async function membershipsForAlbum(store: IDBObjectStore, albumId: string): Promise<readonly AlbumMembershipRecord[]> {
  const index = store.index(SchemaIndex.AlbumMembershipsByAlbumPosition);
  const raw = await requestToPromise<unknown[]>(index.getAll(IDBKeyRange.bound([albumId, -Infinity], [albumId, Infinity])));
  return hydrateRecords(DataStore.AlbumMemberships, albumMembershipRecordSchema, raw).sort(compareMemberships);
}

function deleteCursorRange(request: IDBRequest<IDBCursorWithValue | null>): Promise<void> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

function normalizeAlbumName(name: string): string {
  const trimmed = name.trim().replace(/\s+/gu, ' ');
  return trimmed || 'Untitled album';
}

function compareAlbums(left: AlbumRecord, right: AlbumRecord): number {
  const updated = right.updatedAt.localeCompare(left.updatedAt);
  return updated === 0 ? left.name.localeCompare(right.name) : updated;
}

function compareMemberships(left: AlbumMembershipRecord, right: AlbumMembershipRecord): number {
  const album = left.albumId.localeCompare(right.albumId);
  return album === 0 ? left.position - right.position : album;
}
