import { MESSAGE_PROTOCOL_VERSION, MessageType } from '../message-protocol.js';

export interface PCloudProviderStatusMessage {
  readonly type: typeof MessageType.PCloudProviderStatus;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface PCloudProviderStatusResultMessage {
  readonly type: typeof MessageType.PCloudProviderStatusResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudProviderStatus;
}

export interface ConnectPCloudProviderMessage {
  readonly type: typeof MessageType.ConnectPCloudProvider;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ConnectPCloudProviderResultMessage {
  readonly type: typeof MessageType.ConnectPCloudProviderResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudProviderResult;
}

export interface DisconnectPCloudProviderMessage {
  readonly type: typeof MessageType.DisconnectPCloudProvider;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface DisconnectPCloudProviderResultMessage {
  readonly type: typeof MessageType.DisconnectPCloudProviderResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudProviderResult;
}

export interface UploadPCloudBackupMessage {
  readonly type: typeof MessageType.UploadPCloudBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudBackupUploadInput;
}

export interface UploadPCloudBackupResultMessage {
  readonly type: typeof MessageType.UploadPCloudBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudBackupUploadResult;
}

export interface ListPCloudBackupsMessage {
  readonly type: typeof MessageType.ListPCloudBackups;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: Record<string, never>;
}

export interface ListPCloudBackupsResultMessage {
  readonly type: typeof MessageType.ListPCloudBackupsResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudBackupListResult;
}

export interface DownloadPCloudBackupMessage {
  readonly type: typeof MessageType.DownloadPCloudBackup;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudBackupDownloadInput;
}

export interface DownloadPCloudBackupResultMessage {
  readonly type: typeof MessageType.DownloadPCloudBackupResult;
  readonly version: typeof MESSAGE_PROTOCOL_VERSION;
  readonly payload: import('../../core/cloud/pcloud-provider.js').PCloudBackupDownloadResult;
}

export function createPCloudProviderStatusMessage(): PCloudProviderStatusMessage {
  return { type: MessageType.PCloudProviderStatus, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createPCloudProviderStatusResultMessage(
  payload: PCloudProviderStatusResultMessage['payload'],
): PCloudProviderStatusResultMessage {
  return { type: MessageType.PCloudProviderStatusResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createConnectPCloudProviderMessage(): ConnectPCloudProviderMessage {
  return { type: MessageType.ConnectPCloudProvider, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createConnectPCloudProviderResultMessage(
  payload: ConnectPCloudProviderResultMessage['payload'],
): ConnectPCloudProviderResultMessage {
  return { type: MessageType.ConnectPCloudProviderResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDisconnectPCloudProviderMessage(): DisconnectPCloudProviderMessage {
  return { type: MessageType.DisconnectPCloudProvider, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createDisconnectPCloudProviderResultMessage(
  payload: DisconnectPCloudProviderResultMessage['payload'],
): DisconnectPCloudProviderResultMessage {
  return { type: MessageType.DisconnectPCloudProviderResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createUploadPCloudBackupMessage(payload: UploadPCloudBackupMessage['payload']): UploadPCloudBackupMessage {
  return { type: MessageType.UploadPCloudBackup, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createUploadPCloudBackupResultMessage(
  payload: UploadPCloudBackupResultMessage['payload'],
): UploadPCloudBackupResultMessage {
  return { type: MessageType.UploadPCloudBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createListPCloudBackupsMessage(): ListPCloudBackupsMessage {
  return { type: MessageType.ListPCloudBackups, version: MESSAGE_PROTOCOL_VERSION, payload: {} };
}

export function createListPCloudBackupsResultMessage(payload: ListPCloudBackupsResultMessage['payload']): ListPCloudBackupsResultMessage {
  return { type: MessageType.ListPCloudBackupsResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDownloadPCloudBackupMessage(payload: DownloadPCloudBackupMessage['payload']): DownloadPCloudBackupMessage {
  return { type: MessageType.DownloadPCloudBackup, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export function createDownloadPCloudBackupResultMessage(
  payload: DownloadPCloudBackupResultMessage['payload'],
): DownloadPCloudBackupResultMessage {
  return { type: MessageType.DownloadPCloudBackupResult, version: MESSAGE_PROTOCOL_VERSION, payload };
}

export type PCloudRequest =
  | PCloudProviderStatusMessage
  | ConnectPCloudProviderMessage
  | DisconnectPCloudProviderMessage
  | UploadPCloudBackupMessage
  | ListPCloudBackupsMessage
  | DownloadPCloudBackupMessage;

export type PCloudResponse =
  | PCloudProviderStatusResultMessage
  | ConnectPCloudProviderResultMessage
  | DisconnectPCloudProviderResultMessage
  | UploadPCloudBackupResultMessage
  | ListPCloudBackupsResultMessage
  | DownloadPCloudBackupResultMessage;
