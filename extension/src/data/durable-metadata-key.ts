import { createKeyReference } from './crypto/key-reference.js';
import type { KeyReference, StoredKeyRecord } from './crypto/types.js';
import { generateAesGcmKey } from './crypto/webcrypto.js';
import type { KeysRepository } from './repositories/keys-repository.js';

interface DurableMetadataKeyRecord extends StoredKeyRecord<'metadata'> {
  readonly key: CryptoKey;
}

export interface DurableMetadataKeyContext {
  readonly reference: KeyReference<'metadata'>;
  readonly key: CryptoKey;
}

export async function ensureDurableMetadataKey(repository: KeysRepository): Promise<DurableMetadataKeyContext> {
  const existing = (await repository.listByKind('metadata')).find(isDurableMetadataKeyRecord);
  if (existing) return { reference: existing, key: existing.key };

  const uuid = crypto.randomUUID();
  const reference = createKeyReference('metadata', uuid);
  const now = new Date().toISOString();
  const record: DurableMetadataKeyRecord = {
    ...reference,
    key: await generateAesGcmKey(false),
    createdAt: now,
    updatedAt: now,
    wrapping: { mode: 'indexeddb', algorithm: 'none' },
    extractable: false,
  };
  await repository.put(record);
  return { reference, key: record.key };
}

function isDurableMetadataKeyRecord(record: StoredKeyRecord): record is DurableMetadataKeyRecord {
  return typeof CryptoKey !== 'undefined' && record.kind === 'metadata' && record.key instanceof CryptoKey;
}
