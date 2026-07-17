import { defineMessage, type MessageDef } from '../message-dispatch.js';
import * as requestSchemas from '../message-schemas.js';
import {
  MessageType,
  createConnectPCloudProviderResultMessage,
  createDisconnectPCloudProviderResultMessage,
  createDownloadPCloudBackupResultMessage,
  createListPCloudBackupsResultMessage,
  createPCloudProviderStatusResultMessage,
  createUploadPCloudBackupResultMessage,
  type ConnectPCloudProviderMessage,
  type DisconnectPCloudProviderMessage,
  type DownloadPCloudBackupMessage,
  type ExtensionRequest,
  type ExtensionResponse,
  type ListPCloudBackupsMessage,
  type PCloudProviderStatusMessage,
  type UploadPCloudBackupMessage,
} from '../messages.js';
import {
  connectPCloudProvider,
  disconnectPCloudProvider,
  downloadPCloudBackup,
  listPCloudBackups,
  loadPCloudProviderStatus,
  uploadPCloudBackup,
} from '../pcloud-provider.js';
import { PCLOUD_HOST_PERMISSION, requestHostPermission } from '../permissions.js';
import { createChromeInteropRuntime, createInteropRuntimeMessageRegistry } from './interop-runtime-handlers.js';

async function connectPCloudWithPermission(): ReturnType<typeof connectPCloudProvider> {
  const granted = await requestHostPermission(PCLOUD_HOST_PERMISSION);
  if (granted) return connectPCloudProvider();
  const message = 'pCloud access was not granted. Connect again to approve access only to pCloud hosts.';
  return { ok: false, status: { connected: false, message, messageIsError: true }, message };
}

type PCloudRequestType =
  | typeof MessageType.PCloudProviderStatus
  | typeof MessageType.ConnectPCloudProvider
  | typeof MessageType.DisconnectPCloudProvider
  | typeof MessageType.UploadPCloudBackup
  | typeof MessageType.ListPCloudBackups
  | typeof MessageType.DownloadPCloudBackup;

export function createPCloudMessageRegistry(): Record<PCloudRequestType, MessageDef<ExtensionRequest, ExtensionResponse>> {
  return {
    [MessageType.PCloudProviderStatus]: defineMessage({
      requestSchema: requestSchemas.emptyPayloadSchema,
      handle: (_message: PCloudProviderStatusMessage) => loadPCloudProviderStatus(),
      respond: (result) => createPCloudProviderStatusResultMessage(result),
      fallback: () => createPCloudProviderStatusResultMessage({ connected: false, message: 'pCloud status could not be loaded.' }),
    }),
    [MessageType.ConnectPCloudProvider]: defineMessage({
      requestSchema: requestSchemas.emptyPayloadSchema,
      handle: (_message: ConnectPCloudProviderMessage) => connectPCloudWithPermission(),
      respond: (result) => createConnectPCloudProviderResultMessage(result),
      fallback: () =>
        createConnectPCloudProviderResultMessage({
          ok: false,
          status: { connected: false, message: 'pCloud connection failed.' },
          message: 'pCloud connection failed.',
        }),
    }),
    [MessageType.DisconnectPCloudProvider]: defineMessage({
      requestSchema: requestSchemas.emptyPayloadSchema,
      handle: (_message: DisconnectPCloudProviderMessage) => disconnectPCloudProvider(),
      respond: (result) => createDisconnectPCloudProviderResultMessage(result),
      fallback: () =>
        createDisconnectPCloudProviderResultMessage({
          ok: false,
          status: { connected: false, message: 'pCloud disconnect failed.' },
          message: 'pCloud disconnect failed.',
        }),
    }),
    [MessageType.UploadPCloudBackup]: defineMessage({
      requestSchema: requestSchemas.uploadPCloudBackupRequestSchema,
      handle: (message: UploadPCloudBackupMessage) => uploadPCloudBackup(message.payload),
      respond: (result) => createUploadPCloudBackupResultMessage(result),
      fallback: () =>
        createUploadPCloudBackupResultMessage({
          ok: false,
          status: { connected: false, message: 'pCloud backup upload failed.', messageIsError: true },
          reason: 'upload-failed',
          message: 'pCloud backup upload failed.',
        }),
    }),
    [MessageType.ListPCloudBackups]: defineMessage({
      requestSchema: requestSchemas.emptyPayloadSchema,
      handle: (_message: ListPCloudBackupsMessage) => listPCloudBackups(),
      respond: (result) => createListPCloudBackupsResultMessage(result),
      fallback: () =>
        createListPCloudBackupsResultMessage({
          ok: false,
          status: { connected: false, message: 'pCloud backups could not be listed.', messageIsError: true },
          reason: 'list-failed',
          message: 'pCloud backups could not be listed.',
        }),
    }),
    [MessageType.DownloadPCloudBackup]: defineMessage({
      requestSchema: requestSchemas.downloadPCloudBackupRequestSchema,
      handle: (message: DownloadPCloudBackupMessage) => downloadPCloudBackup(message.payload),
      respond: (result) => createDownloadPCloudBackupResultMessage(result),
      fallback: () =>
        createDownloadPCloudBackupResultMessage({
          ok: false,
          status: { connected: false, message: 'pCloud backup could not be downloaded.', messageIsError: true },
          reason: 'download-failed',
          message: 'pCloud backup could not be downloaded.',
        }),
    }),
  };
}

export function createCloudMessageRegistry(
  getDb: () => Promise<IDBDatabase | null>,
): Record<PCloudRequestType | typeof MessageType.InteropRuntime, MessageDef<ExtensionRequest, ExtensionResponse>> {
  return { ...createPCloudMessageRegistry(), ...createInteropRuntimeMessageRegistry(createChromeInteropRuntime(getDb)) };
}
