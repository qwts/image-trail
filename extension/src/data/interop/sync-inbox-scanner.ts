import { analyzeSyncRecords } from '../../core/interop/sync-resolution.js';
import { EncryptedInteropTransport, sha256, type InteropObjectStore } from '../../core/interop/transport.js';
import type { ActiveBlobKey } from '../crypto/blob-keyring.js';
import type { StoredInteropKeyRecord } from '../repositories/interop-keys-repository.js';
import { InteropRecordExportStore } from './record-export.js';
import { SecureSyncInboxRepository } from './secure-sync-inbox-repository.js';
import { SecureSyncOutboxRepository, type SecureSyncProgress } from './secure-sync-outbox-repository.js';
import { openInteropMessage } from './sealed-message.js';
import { parseSyncMessagePath, SYNC_MESSAGE_PREFIX } from './sync-paths.js';

export class SyncInboxScanError extends Error {
  override readonly name = 'SyncInboxScanError';

  constructor(
    message: string,
    readonly code: 'corrupt' | 'replay' | 'unsupported-record' = 'corrupt',
  ) {
    super(message);
  }
}

function sameBytes(left: Uint8Array, right: ArrayBuffer): boolean {
  const rightBytes = new Uint8Array(right);
  return left.byteLength === rightBytes.byteLength && left.every((byte, index) => byte === rightBytes[index]);
}

export class SyncInboxScanner {
  constructor(
    private readonly db: IDBDatabase,
    private readonly store: InteropObjectStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async refresh(sessionId: string, pairing: StoredInteropKeyRecord, activeBlobKey: ActiveBlobKey | null): Promise<SecureSyncProgress> {
    const outbox = new SecureSyncOutboxRepository(this.db);
    const progress = await outbox.progress(sessionId);
    if (!progress || progress.session.pairingId !== pairing.pairingId) {
      throw new SyncInboxScanError('Sync inbox does not match local session custody.');
    }
    const items = await outbox.items(sessionId);
    const reviewed = await new InteropRecordExportStore(this.db).review(
      items.map((item) => item.sourceLocalId),
      activeBlobKey,
      { includeOriginalBytes: false },
    );
    const localByInteropId = new Map(reviewed.records.map((record) => [record.record.identity.interopId, record.record]));
    const ownMessages = new Map((await outbox.messages(sessionId)).map((message) => [message.messageId, message]));
    const transport = new EncryptedInteropTransport(this.store);
    const scope = { pairingId: pairing.pairingId, transferId: sessionId };
    for (const path of await transport.listPaths(scope, SYNC_MESSAGE_PREFIX)) {
      let pathIdentity: ReturnType<typeof parseSyncMessagePath>;
      try {
        pathIdentity = parseSyncMessagePath(path);
      } catch {
        throw new SyncInboxScanError('Sync provider path is invalid.');
      }
      const ownMessage = ownMessages.get(pathIdentity.messageId);
      if (ownMessage) {
        if (ownMessage.path !== path) throw new SyncInboxScanError('Sync source message appeared at an unreviewed provider path.');
        const providerCopy = await transport.download(scope, path);
        try {
          if (!sameBytes(providerCopy, ownMessage.ciphertext)) {
            throw new SyncInboxScanError('Sync source message ciphertext changed after publication.', 'replay');
          }
        } finally {
          providerCopy.fill(0);
        }
        continue;
      }
      const ciphertext = await transport.download(scope, path);
      try {
        let envelope: Awaited<ReturnType<typeof openInteropMessage>>;
        try {
          envelope = await openInteropMessage(ciphertext, pairing);
        } catch {
          throw new SyncInboxScanError('Sync inbox message could not be opened with the reviewed pairing key.');
        }
        if (
          envelope.header.operation !== 'sync' ||
          envelope.payload.kind !== 'record' ||
          envelope.header.transferId !== sessionId ||
          envelope.header.pairingId !== pairing.pairingId ||
          envelope.header.sourceProduct !== 'overlook' ||
          envelope.header.targetProduct !== 'image-trail' ||
          envelope.header.messageId !== pathIdentity.messageId ||
          envelope.header.sequence !== pathIdentity.sequence
        ) {
          throw new SyncInboxScanError('Sync inbox message does not match its reviewed provider path and participants.');
        }
        const remote = envelope.payload.record;
        const local = localByInteropId.get(remote.identity.interopId);
        if (!local) throw new SyncInboxScanError('Sync inbox record is outside the exact reviewed selection.', 'unsupported-record');
        const analysis = analyzeSyncRecords(local, remote);
        const conflictFields = analysis.conflicts.map((conflict) => conflict.field);
        if (analysis.category === 'delete-review' && !conflictFields.includes('deleted')) conflictFields.push('deleted');
        try {
          await new SecureSyncInboxRepository(this.db).record({
            messageId: envelope.header.messageId,
            sessionId,
            interopId: remote.identity.interopId,
            sequence: envelope.header.sequence,
            path,
            ciphertextHash: await sha256(ciphertext),
            ciphertext,
            category: analysis.category,
            conflictFields,
            receivedAt: this.now(),
          });
        } catch (error) {
          throw new SyncInboxScanError(error instanceof Error ? error.message : 'Sync inbox replay failed.', 'replay');
        }
      } finally {
        ciphertext.fill(0);
      }
    }
    const inbound = await new SecureSyncInboxRepository(this.db).review(sessionId, progress.counts, items);
    return { ...progress, inbound };
  }
}
