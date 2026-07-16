import { MESSAGE_PROTOCOL_VERSION, MessageType } from './message-protocol.js';

export interface BlobKeyStatusMessage {
  readonly type: typeof MessageType.BlobKeyStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface BlobKeyStatusResultMessage {
  readonly type: typeof MessageType.BlobKeyStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly unlocked: true;
        readonly keyReference: string;
        readonly hasKey: true;
        readonly reason?: undefined;
        readonly message?: undefined;
      }
    | {
        readonly unlocked: false;
        readonly keyReference: null;
        readonly hasKey: boolean;
        readonly reason?: 'manual' | 'timeout' | 'worker-restart' | undefined;
        readonly message?: string | undefined;
      };
}

export interface SetupBlobKeyMessage {
  readonly type: typeof MessageType.SetupBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly password: string };
}

export interface UnlockBlobKeyMessage {
  readonly type: typeof MessageType.UnlockBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly password: string; readonly keyReference?: string | undefined };
}

export interface LockBlobKeyMessage {
  readonly type: typeof MessageType.LockBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface BlobKeyActivityMessage {
  readonly type: typeof MessageType.BlobKeyActivity;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ClearBlobKeyMessage {
  readonly type: typeof MessageType.ClearBlobKey;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ExportBlobKeyBackupMessage {
  readonly type: typeof MessageType.ExportBlobKeyBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly password: string; readonly keyReference?: string | undefined };
}

export interface ExportBlobKeyBackupResultMessage {
  readonly type: typeof MessageType.ExportBlobKeyBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | {
        readonly ok: true;
        readonly keyReference: string;
        readonly fileContent: string;
        readonly fileName: string;
        readonly message: string;
      }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface ImportBlobKeyBackupMessage {
  readonly type: typeof MessageType.ImportBlobKeyBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: { readonly fileContent: string; readonly password: string };
}

export interface ImportBlobKeyBackupResultMessage {
  readonly type: typeof MessageType.ImportBlobKeyBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly keyReference: string; readonly imported: boolean; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export interface BlobKeyResultMessage {
  readonly type: typeof MessageType.BlobKeyResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload:
    | { readonly ok: true; readonly keyReference: string; readonly message: string }
    | { readonly ok: false; readonly reason: string; readonly message: string };
}

export type BlobKeyRequest =
  | BlobKeyStatusMessage
  | SetupBlobKeyMessage
  | UnlockBlobKeyMessage
  | LockBlobKeyMessage
  | BlobKeyActivityMessage
  | ClearBlobKeyMessage
  | ExportBlobKeyBackupMessage
  | ImportBlobKeyBackupMessage;

export type BlobKeyResponse =
  BlobKeyStatusResultMessage | BlobKeyResultMessage | ExportBlobKeyBackupResultMessage | ImportBlobKeyBackupResultMessage;

export function createBlobKeyStatusMessage(): BlobKeyStatusMessage {
  return { type: MessageType.BlobKeyStatus, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createBlobKeyStatusResultMessage(payload: BlobKeyStatusResultMessage['payload']): BlobKeyStatusResultMessage {
  return { type: MessageType.BlobKeyStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createSetupBlobKeyMessage(password: string): SetupBlobKeyMessage {
  return { type: MessageType.SetupBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: { password } };
}

export function createUnlockBlobKeyMessage(password: string, keyReference?: string): UnlockBlobKeyMessage {
  return { type: MessageType.UnlockBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: { password, keyReference } };
}

export function createLockBlobKeyMessage(): LockBlobKeyMessage {
  return { type: MessageType.LockBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createBlobKeyActivityMessage(): BlobKeyActivityMessage {
  return { type: MessageType.BlobKeyActivity, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createClearBlobKeyMessage(): ClearBlobKeyMessage {
  return { type: MessageType.ClearBlobKey, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createExportBlobKeyBackupMessage(password: string, keyReference?: string): ExportBlobKeyBackupMessage {
  return { type: MessageType.ExportBlobKeyBackup, version: MESSAGE_PROTOCOL_VERSION, payload: { password, keyReference } };
}

export function createExportBlobKeyBackupResultMessage(
  payload: ExportBlobKeyBackupResultMessage['payload'],
): ExportBlobKeyBackupResultMessage {
  return { type: MessageType.ExportBlobKeyBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createImportBlobKeyBackupMessage(fileContent: string, password: string): ImportBlobKeyBackupMessage {
  return { type: MessageType.ImportBlobKeyBackup, version: MESSAGE_PROTOCOL_VERSION, payload: { fileContent, password } };
}

export function createImportBlobKeyBackupResultMessage(
  payload: ImportBlobKeyBackupResultMessage['payload'],
): ImportBlobKeyBackupResultMessage {
  return { type: MessageType.ImportBlobKeyBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createBlobKeyResultMessage(payload: BlobKeyResultMessage['payload']): BlobKeyResultMessage {
  return { type: MessageType.BlobKeyResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}
