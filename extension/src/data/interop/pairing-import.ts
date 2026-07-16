import { InteropKeysRepository, type StoredInteropKeyRecord } from '../repositories/interop-keys-repository.js';
import { InteropPairingError, openInteropPairingBundle } from './pairing-bundle.js';

export interface ImportedInteropPairing {
  readonly pairingId: string;
  readonly keyId: `interop:${string}`;
  readonly createdAt: string;
}

function keyUuid(keyId: `interop:${string}`): string {
  return keyId.slice('interop:'.length);
}

export async function importInteropPairingBundle(input: {
  readonly db: IDBDatabase;
  readonly bundle: unknown;
  readonly password: string;
  readonly now?: string;
  readonly crypto?: Crypto;
}): Promise<ImportedInteropPairing> {
  const opened = await openInteropPairingBundle(input.bundle, input.password, input.crypto);
  const repository = new InteropKeysRepository(input.db);
  const records = await repository.list();
  const keyConflict = records.find((record) => record.reference === opened.keyId && record.pairingId !== opened.pairingId);
  const pairingConflict = records.find((record) => record.pairingId === opened.pairingId && record.reference !== opened.keyId);
  if (keyConflict || pairingConflict) throw new InteropPairingError('Pairing identity conflicts with stored key custody.');
  const now = input.now ?? new Date().toISOString();
  const existing = records.find((record) => record.reference === opened.keyId);
  const record: StoredInteropKeyRecord = {
    kind: 'interop',
    uuid: keyUuid(opened.keyId),
    reference: opened.keyId,
    pairingId: opened.pairingId,
    createdAt: existing?.createdAt ?? opened.createdAt,
    updatedAt: now,
    wrapping: { mode: 'indexeddb', algorithm: 'none' },
    extractable: false,
    key: opened.key,
  };
  await repository.put(record);
  return { pairingId: opened.pairingId, keyId: opened.keyId, createdAt: record.createdAt };
}
