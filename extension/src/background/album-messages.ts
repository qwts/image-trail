import type { AlbumBackupEntry } from '../data/albums-controller.js';
import type { AlbumMembershipRecord, AlbumRecord } from '../data/types.js';
import { MESSAGE_PROTOCOL_VERSION, MessageType, hasVersionedObjectShape } from './message-protocol.js';

export interface LoadAlbumsMessage {
  readonly type: typeof MessageType.LoadAlbums;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface LoadAlbumsResultMessage {
  readonly type: typeof MessageType.LoadAlbumsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly albums: readonly AlbumRecord[]; readonly memberships: readonly AlbumMembershipRecord[] }
    | { readonly ok: false; readonly message: string };
}

export interface CreateAlbumMessage {
  readonly type: typeof MessageType.CreateAlbum;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly name: string };
}

export interface CreateAlbumResultMessage {
  readonly type: typeof MessageType.CreateAlbumResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly album: AlbumRecord } | { readonly ok: false; readonly message: string };
}

export interface RenameAlbumMessage {
  readonly type: typeof MessageType.RenameAlbum;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly albumId: string; readonly name: string };
}

export interface RenameAlbumResultMessage {
  readonly type: typeof MessageType.RenameAlbumResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: true; readonly album: AlbumRecord } | { readonly ok: false; readonly message: string };
}

export interface DeleteAlbumMessage {
  readonly type: typeof MessageType.DeleteAlbum;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly albumId: string };
}

export interface DeleteAlbumResultMessage {
  readonly type: typeof MessageType.DeleteAlbumResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface AddAlbumRecordsMessage {
  readonly type: typeof MessageType.AddAlbumRecords;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly albumId: string; readonly recordIds: readonly string[] };
}

export interface AddAlbumRecordsResultMessage {
  readonly type: typeof MessageType.AddAlbumRecordsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    { readonly ok: true; readonly memberships: readonly AlbumMembershipRecord[] } | { readonly ok: false; readonly message: string };
}

export interface RemoveAlbumRecordMessage {
  readonly type: typeof MessageType.RemoveAlbumRecord;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly albumId: string; readonly recordId: string };
}

export interface RemoveAlbumRecordResultMessage {
  readonly type: typeof MessageType.RemoveAlbumRecordResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly ok: boolean };
}

export interface ImportAlbumBackupMessage {
  readonly type: typeof MessageType.ImportAlbumBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: {
    readonly albums: readonly AlbumBackupEntry[];
    readonly recordIdMap: readonly { readonly sourceId: string; readonly targetId: string }[];
  };
}

export interface ImportAlbumBackupResultMessage {
  readonly type: typeof MessageType.ImportAlbumBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly importedAlbumCount: number;
        readonly importedMembershipCount: number;
        readonly skippedMembershipCount: number;
      }
    | { readonly ok: false; readonly message: string };
}

export type AlbumRequest =
  | LoadAlbumsMessage
  | CreateAlbumMessage
  | RenameAlbumMessage
  | DeleteAlbumMessage
  | AddAlbumRecordsMessage
  | RemoveAlbumRecordMessage
  | ImportAlbumBackupMessage;

export type AlbumResponse =
  | LoadAlbumsResultMessage
  | CreateAlbumResultMessage
  | RenameAlbumResultMessage
  | DeleteAlbumResultMessage
  | AddAlbumRecordsResultMessage
  | RemoveAlbumRecordResultMessage
  | ImportAlbumBackupResultMessage;

export function createLoadAlbumsMessage(): LoadAlbumsMessage {
  return { type: MessageType.LoadAlbums, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createLoadAlbumsResultMessage(payload: LoadAlbumsResultMessage['payload']): LoadAlbumsResultMessage {
  return { type: MessageType.LoadAlbumsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createCreateAlbumMessage(name: string): CreateAlbumMessage {
  return { type: MessageType.CreateAlbum, version: MESSAGE_PROTOCOL_VERSION, payload: { name } };
}

export function createCreateAlbumResultMessage(payload: CreateAlbumResultMessage['payload']): CreateAlbumResultMessage {
  return { type: MessageType.CreateAlbumResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRenameAlbumMessage(albumId: string, name: string): RenameAlbumMessage {
  return { type: MessageType.RenameAlbum, version: MESSAGE_PROTOCOL_VERSION, payload: { albumId, name } };
}

export function createRenameAlbumResultMessage(payload: RenameAlbumResultMessage['payload']): RenameAlbumResultMessage {
  return { type: MessageType.RenameAlbumResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDeleteAlbumMessage(albumId: string): DeleteAlbumMessage {
  return { type: MessageType.DeleteAlbum, version: MESSAGE_PROTOCOL_VERSION, payload: { albumId } };
}

export function createDeleteAlbumResultMessage(payload: DeleteAlbumResultMessage['payload']): DeleteAlbumResultMessage {
  return { type: MessageType.DeleteAlbumResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createAddAlbumRecordsMessage(albumId: string, recordIds: readonly string[]): AddAlbumRecordsMessage {
  return { type: MessageType.AddAlbumRecords, version: MESSAGE_PROTOCOL_VERSION, payload: { albumId, recordIds } };
}

export function createAddAlbumRecordsResultMessage(payload: AddAlbumRecordsResultMessage['payload']): AddAlbumRecordsResultMessage {
  return { type: MessageType.AddAlbumRecordsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createRemoveAlbumRecordMessage(albumId: string, recordId: string): RemoveAlbumRecordMessage {
  return { type: MessageType.RemoveAlbumRecord, version: MESSAGE_PROTOCOL_VERSION, payload: { albumId, recordId } };
}

export function createRemoveAlbumRecordResultMessage(payload: RemoveAlbumRecordResultMessage['payload']): RemoveAlbumRecordResultMessage {
  return { type: MessageType.RemoveAlbumRecordResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportAlbumBackupMessage(payload: ImportAlbumBackupMessage['payload']): ImportAlbumBackupMessage {
  return { type: MessageType.ImportAlbumBackup, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportAlbumBackupResultMessage(payload: ImportAlbumBackupResultMessage['payload']): ImportAlbumBackupResultMessage {
  return { type: MessageType.ImportAlbumBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function isLoadAlbumsResultMessage(value: unknown): value is LoadAlbumsResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.LoadAlbumsResult;
}

export function isCreateAlbumResultMessage(value: unknown): value is CreateAlbumResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.CreateAlbumResult;
}

export function isRenameAlbumResultMessage(value: unknown): value is RenameAlbumResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.RenameAlbumResult;
}

export function isDeleteAlbumResultMessage(value: unknown): value is DeleteAlbumResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.DeleteAlbumResult;
}

export function isAddAlbumRecordsResultMessage(value: unknown): value is AddAlbumRecordsResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.AddAlbumRecordsResult;
}

export function isRemoveAlbumRecordResultMessage(value: unknown): value is RemoveAlbumRecordResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.RemoveAlbumRecordResult;
}

export function isImportAlbumBackupResultMessage(value: unknown): value is ImportAlbumBackupResultMessage {
  return hasVersionedObjectShape(value) && value.type === MessageType.ImportAlbumBackupResult;
}
