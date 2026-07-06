import * as v from 'valibot';
import type { IndexedDbAlbumStore } from '../../data/albums-controller.js';
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
        return album ? { ok: true as const, album } : { ok: false as const, message: 'Album could not be created.' };
      },
      respond: (result) => createCreateAlbumResultMessage(result),
      fallback: () => createCreateAlbumResultMessage({ ok: false, message: 'Album could not be created.' }),
    }),
    [MessageType.RenameAlbum]: defineMessage({
      requestSchema: renameAlbumSchema,
      handle: async (message: RenameAlbumMessage) => {
        const album = await albumStore.renameAlbum(message.payload.albumId, message.payload.name);
        return album ? { ok: true as const, album } : { ok: false as const, message: 'Album could not be renamed.' };
      },
      respond: (result) => createRenameAlbumResultMessage(result),
      fallback: () => createRenameAlbumResultMessage({ ok: false, message: 'Album could not be renamed.' }),
    }),
    [MessageType.DeleteAlbum]: defineMessage({
      requestSchema: albumIdSchema,
      handle: async (message: DeleteAlbumMessage) => ({ ok: await albumStore.deleteAlbum(message.payload.albumId) }),
      respond: (result) => createDeleteAlbumResultMessage(result),
      fallback: () => createDeleteAlbumResultMessage({ ok: false }),
    }),
    [MessageType.AddAlbumRecords]: defineMessage({
      requestSchema: addAlbumRecordsSchema,
      handle: async (message: AddAlbumRecordsMessage) => ({
        ok: true as const,
        memberships: await albumStore.addRecords(message.payload.albumId, message.payload.recordIds),
      }),
      respond: (result) => createAddAlbumRecordsResultMessage(result),
      fallback: () => createAddAlbumRecordsResultMessage({ ok: false, message: 'Record could not be added to the album.' }),
    }),
    [MessageType.RemoveAlbumRecord]: defineMessage({
      requestSchema: removeAlbumRecordSchema,
      handle: async (message: RemoveAlbumRecordMessage) => ({
        ok: await albumStore.removeRecord(message.payload.albumId, message.payload.recordId),
      }),
      respond: (result) => createRemoveAlbumRecordResultMessage(result),
      fallback: () => createRemoveAlbumRecordResultMessage({ ok: false }),
    }),
    [MessageType.ImportAlbumBackup]: defineMessage({
      requestSchema: importAlbumBackupSchema,
      handle: async (message: ImportAlbumBackupMessage) => ({
        ok: true as const,
        ...(await albumStore.importBackupEntries(
          message.payload.albums,
          new Map(message.payload.recordIdMap.map((entry) => [entry.sourceId, entry.targetId])),
        )),
      }),
      respond: (result) => createImportAlbumBackupResultMessage(result),
      fallback: () => createImportAlbumBackupResultMessage({ ok: false, message: 'Album backup could not be imported.' }),
    }),
  };
}
