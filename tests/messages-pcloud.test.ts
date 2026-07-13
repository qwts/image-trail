import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MessageType,
  createConnectPCloudProviderMessage,
  createConnectPCloudProviderResultMessage,
  createDisconnectPCloudProviderMessage,
  createDisconnectPCloudProviderResultMessage,
  createDownloadPCloudBackupMessage,
  createDownloadPCloudBackupResultMessage,
  createListPCloudBackupsMessage,
  createListPCloudBackupsResultMessage,
  createPCloudProviderStatusMessage,
  createPCloudProviderStatusResultMessage,
  createUploadPCloudBackupMessage,
  createUploadPCloudBackupResultMessage,
  isConnectPCloudProviderResultMessage,
  isDisconnectPCloudProviderResultMessage,
  isDownloadPCloudBackupResultMessage,
  isExtensionRequest,
  isExtensionResponse,
  isListPCloudBackupsResultMessage,
  isPCloudProviderStatusResultMessage,
  isUploadPCloudBackupResultMessage,
} from '../extension/src/background/messages.js';

test('creates pCloud provider messages without token fields', () => {
  const status = createPCloudProviderStatusMessage();
  const statusResult = createPCloudProviderStatusResultMessage({
    connected: true,
    apiHost: 'api.pcloud.com',
    connectedAt: '2026-06-27T00:00:00.000Z',
    accountPremium: true,
    quotaBytes: 1024,
    usedQuotaBytes: 128,
    message: 'pCloud is connected.',
  });
  const connect = createConnectPCloudProviderMessage();
  const connectResult = createConnectPCloudProviderResultMessage({
    ok: true,
    status: statusResult.payload,
    message: 'pCloud is connected.',
  });
  const disconnect = createDisconnectPCloudProviderMessage();
  const disconnectResult = createDisconnectPCloudProviderResultMessage({
    ok: true,
    status: { connected: false, message: 'pCloud disconnected.' },
    message: 'pCloud disconnected.',
  });
  const upload = createUploadPCloudBackupMessage({
    fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
    fileContent: '{"encrypted":true}',
  });
  const uploadResult = createUploadPCloudBackupResultMessage({
    ok: true,
    status: statusResult.payload,
    apiHost: 'api.pcloud.com',
    fileId: 42,
    fileName: upload.payload.fileName,
    folderPath: '/Image Trail/backups',
    sizeBytes: upload.payload.fileContent.length,
    sha256: 'a'.repeat(64),
    uploadedAt: '2026-06-27T00:00:00.000Z',
    verificationMethod: 'download-byte-match',
    historyRecord: {
      schemaVersion: 1,
      provider: 'pcloud',
      destination: '/Image Trail/backups',
      fileName: upload.payload.fileName,
      completedAt: '2026-06-27T00:00:00.000Z',
      sizeBytes: upload.payload.fileContent.length,
      sha256: 'a'.repeat(64),
      verificationMethod: 'download-byte-match',
    },
    historyPersisted: true,
    message: 'Uploaded and verified backup.',
  });
  const list = createListPCloudBackupsMessage();
  const listResult = createListPCloudBackupsResultMessage({
    ok: true,
    status: statusResult.payload,
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    candidates: [
      {
        fileId: 43,
        fileName: 'image-trail-pcloud-backup-2026-06-27T00-00-00Z.image-trail-encrypted.json',
        sizeBytes: 256,
        modifiedAt: 'Sat, 27 Jun 2026 00:00:00 +0000',
        sha1: 'b'.repeat(40),
      },
    ],
    message: 'Found 1 encrypted pCloud backup.',
  });
  const download = createDownloadPCloudBackupMessage({
    fileId: 43,
    fileName: listResult.payload.ok ? listResult.payload.candidates[0]!.fileName : 'backup.json',
  });
  const downloadResult = createDownloadPCloudBackupResultMessage({
    ok: true,
    status: statusResult.payload,
    apiHost: 'api.pcloud.com',
    folderPath: '/Image Trail/backups',
    fileId: download.payload.fileId,
    fileName: download.payload.fileName,
    fileContent: '{"encrypted":true}',
    sizeBytes: 18,
    sha256: 'c'.repeat(64),
    downloadedAt: '2026-06-27T00:00:01.000Z',
    message: 'Downloaded backup.',
  });

  assert.equal(status.type, MessageType.PCloudProviderStatus);
  assert.equal(isExtensionRequest(status), true);
  assert.equal(isExtensionResponse(statusResult), true);
  assert.equal(isPCloudProviderStatusResultMessage(statusResult), true);
  assert.equal(JSON.stringify(statusResult).includes('accessToken'), false);
  assert.equal(connect.type, MessageType.ConnectPCloudProvider);
  assert.equal(isExtensionRequest(connect), true);
  assert.equal(isExtensionResponse(connectResult), true);
  assert.equal(isConnectPCloudProviderResultMessage(connectResult), true);
  assert.equal(disconnect.type, MessageType.DisconnectPCloudProvider);
  assert.equal(isExtensionRequest(disconnect), true);
  assert.equal(isExtensionResponse(disconnectResult), true);
  assert.equal(isDisconnectPCloudProviderResultMessage(disconnectResult), true);
  assert.equal(upload.type, MessageType.UploadPCloudBackup);
  assert.equal(isExtensionRequest(upload), true);
  assert.equal(isExtensionResponse(uploadResult), true);
  assert.equal(isUploadPCloudBackupResultMessage(uploadResult), true);
  assert.equal(JSON.stringify(upload).includes('accessToken'), false);
  assert.equal(JSON.stringify(uploadResult).includes('accessToken'), false);
  assert.equal(list.type, MessageType.ListPCloudBackups);
  assert.equal(isExtensionRequest(list), true);
  assert.equal(isExtensionResponse(listResult), true);
  assert.equal(isListPCloudBackupsResultMessage(listResult), true);
  assert.equal(download.type, MessageType.DownloadPCloudBackup);
  assert.equal(isExtensionRequest(download), true);
  assert.equal(isExtensionResponse(downloadResult), true);
  assert.equal(isDownloadPCloudBackupResultMessage(downloadResult), true);
  assert.equal(JSON.stringify(listResult).includes('accessToken'), false);
  assert.equal(JSON.stringify(download).includes('accessToken'), false);
  assert.equal(JSON.stringify(downloadResult).includes('accessToken'), false);
});
