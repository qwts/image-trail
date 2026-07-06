import * as v from 'valibot';
import type { IndexedDbAlbumStore } from '../../data/albums-controller.js';
import { noopLibraryChangeNotifier, type LibraryChangeNotifier } from '../library-change-notifier.js';
import { defineMessage, type MessageDef } from '../message-dispatch.js';
import {
  MessageType,
  createAddAlbumRecordsResultMessage,
  createCreateAlbumResultMessage,
  createDeleteAlbumResultMessage,
  createImportAlbumBackupResultMessage,
  createLoadAlbumsResultMessage,
  createRemoveAlbumRecordResultMessage,
  createRenameAlbumResultMessage,
  type AddAlbumRecordsMessage,
  type CreateAlbumMessage,
  type DeleteAlbumMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type ImportAlbumBackupMessage,
  type LoadAlbumsMessage,
  type RemoveAlbumRecordMessage,
  type RenameAlbumMessage,
} from '../messages.js';
import { emptyPayloadSchema } from '../message-schemas.js';

type AlbumRequestType =
  | typeof MessageType.LoadAlbums
  | typeof MessageType.CreateAlbum
  | typeof MessageType.RenameAlbum
  | typeof MessageType.DeleteAlbum
  | typeof MessageType.AddAlbumRecords
  | typeof MessageType.RemoveAlbumRecord
  | typeof MessageType.ImportAlbumBackup;

export interface AlbumHandlerDeps {
  readonly albumStore: Pick<
    IndexedDbAlbumStore,
    'listSnapshot' | 'createAlbum' | 'renameAlbum' | 'deleteAlbum' | 'addRecords' | 'removeRecord' | 'importBackupEntries'
  >;
  readonly notifyLibraryChange?: LibraryChangeNotifier;
}

const albumNameSchema = v.object({ name: v.string() });
const albumIdSchema = v.object({ albumId: v.string() });
const renameAlbumSchema = v.object({ albumId: v.string(), name: v.string() });
const addAlbumRecordsSchema = v.object({ albumId: v.string(), recordIds: v.pipe(v.array(v.string()), v.readonly()) });
const removeAlbumRecordSchema = v.object({ albumId: v.string(), recordId: v.string() });
const albumBackupEntrySchema = v.object({
  id: v.string(),
  name: v.string(),
  createdAt: v.string(),
  updatedAt: v.string(),
  recordIds: v.pipe(v.array(v.string()), v.readonly()),
});
const importAlbumBackupSchema = v.object({
  albums: v.pipe(v.array(albumBackupEntrySchema), v.readonly()),
  recordIdMap: v.pipe(v.array(v.object({ sourceId: v.string(), targetId: v.string() })), v.readonly()),
});

export function createAlbumMessageRegistry({
  albumStore,
  notifyLibraryChange = noopLibraryChangeNotifier,
}: AlbumHandlerDeps): Record<AlbumRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  return {
    [MessageType.LoadAlbums]: defineMessage({
      requestSchema: emptyPayloadSchema,
      handle: async (_message: LoadAlbumsMessage) => ({ ok: true as const, ...(await albumStore.listSnapshot()) }),
      respond: (result) => createLoadAlbumsResultMessage(result),
      fallback: () => createLoadAlbumsResultMessage({ ok: false, message: 'Albums could not be loaded.' }),
    }),
    [MessageType.CreateAlbum]: defineMessage({
      requestSchema: albumNameSchema,
      handle: async (message: CreateAlbumMessage) => {
        const album = await albumStore.createAlbum(message.payload.name);
        if (album) notifyLibraryChange({ topic: 'albums', reason: 'album-created', albumIds: [album.id] });
        return album ? { ok: true as const, album } : { ok: false as const, message: 'Album could not be created.' };
      },
      respond: (result) => createCreateAlbumResultMessage(result),
      fallback: () => createCreateAlbumResultMessage({ ok: false, message: 'Album could not be created.' }),
    }),
    [MessageType.RenameAlbum]: defineMessage({
      requestSchema: renameAlbumSchema,
      handle: async (message: RenameAlbumMessage) => {
        const album = await albumStore.renameAlbum(message.payload.albumId, message.payload.name);
        if (album) notifyLibraryChange({ topic: 'albums', reason: 'album-renamed', albumIds: [album.id] });
        return album ? { ok: true as const, album } : { ok: false as const, message: 'Album could not be renamed.' };
      },
      respond: (result) => createRenameAlbumResultMessage(result),
      fallback: () => createRenameAlbumResultMessage({ ok: false, message: 'Album could not be renamed.' }),
    }),
    [MessageType.DeleteAlbum]: defineMessage({
      requestSchema: albumIdSchema,
      handle: async (message: DeleteAlbumMessage) => {
        const ok = await albumStore.deleteAlbum(message.payload.albumId);
        if (ok) notifyLibraryChange({ topic: 'albums', reason: 'album-deleted', albumIds: [message.payload.albumId] });
        return { ok };
      },
      respond: (result) => createDeleteAlbumResultMessage(result),
      fallback: () => createDeleteAlbumResultMessage({ ok: false }),
    }),
    [MessageType.AddAlbumRecords]: defineMessage({
      requestSchema: addAlbumRecordsSchema,
      handle: (message: AddAlbumRecordsMessage) => handleAddAlbumRecords(albumStore, notifyLibraryChange, message),
      respond: (result) => createAddAlbumRecordsResultMessage(result),
      fallback: () => createAddAlbumRecordsResultMessage({ ok: false, message: 'Record could not be added to the album.' }),
    }),
    [MessageType.RemoveAlbumRecord]: defineMessage({
      requestSchema: removeAlbumRecordSchema,
      handle: (message: RemoveAlbumRecordMessage) => handleRemoveAlbumRecord(albumStore, notifyLibraryChange, message),
      respond: (result) => createRemoveAlbumRecordResultMessage(result),
      fallback: () => createRemoveAlbumRecordResultMessage({ ok: false }),
    }),
    [MessageType.ImportAlbumBackup]: defineMessage({
      requestSchema: importAlbumBackupSchema,
      handle: (message: ImportAlbumBackupMessage) => handleImportAlbumBackup(albumStore, notifyLibraryChange, message),
      respond: (result) => createImportAlbumBackupResultMessage(result),
      fallback: () => createImportAlbumBackupResultMessage({ ok: false, message: 'Album backup could not be imported.' }),
    }),
  };
}

async function handleAddAlbumRecords(
  albumStore: AlbumHandlerDeps['albumStore'],
  notifyLibraryChange: LibraryChangeNotifier,
  message: AddAlbumRecordsMessage,
) {
  const memberships = await albumStore.addRecords(message.payload.albumId, message.payload.recordIds);
  if (memberships.length > 0) {
    notifyLibraryChange({
      topic: 'albums',
      reason: 'album-records-added',
      albumIds: [message.payload.albumId],
      recordIds: memberships.map((membership) => membership.recordId),
    });
  }
  return { ok: true as const, memberships };
}

async function handleRemoveAlbumRecord(
  albumStore: AlbumHandlerDeps['albumStore'],
  notifyLibraryChange: LibraryChangeNotifier,
  message: RemoveAlbumRecordMessage,
) {
  const ok = await albumStore.removeRecord(message.payload.albumId, message.payload.recordId);
  if (ok) {
    notifyLibraryChange({
      topic: 'albums',
      reason: 'album-record-removed',
      albumIds: [message.payload.albumId],
      recordIds: [message.payload.recordId],
    });
  }
  return { ok };
}

async function handleImportAlbumBackup(
  albumStore: AlbumHandlerDeps['albumStore'],
  notifyLibraryChange: LibraryChangeNotifier,
  message: ImportAlbumBackupMessage,
) {
  const result = await albumStore.importBackupEntries(
    message.payload.albums,
    new Map(message.payload.recordIdMap.map((entry) => [entry.sourceId, entry.targetId])),
  );
  if (result.importedAlbumCount > 0 || result.importedMembershipCount > 0) {
    notifyLibraryChange({ topic: 'albums', reason: 'album-backup-imported' });
  }
  return { ok: true as const, ...result };
}
