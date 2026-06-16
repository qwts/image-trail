import { createKeyReference } from './key-reference.js';
import type { KeyKind, KeyReference, StoredKeyRecord } from './types.js';
import { generateAesGcmKey } from './webcrypto.js';

export interface SessionKeyRecord<K extends KeyKind = KeyKind> {
  readonly reference: KeyReference<K>;
  readonly key: CryptoKey;
  readonly metadata: StoredKeyRecord<K>;
}

export async function createSessionKey<K extends KeyKind>(
  kind: K = 'history' as K,
  uuid: string = crypto.randomUUID(),
  now = new Date().toISOString(),
): Promise<SessionKeyRecord<K>> {
  const reference = createKeyReference(kind, uuid);
  return {
    reference,
    key: await generateAesGcmKey(false),
    metadata: {
      ...reference,
      createdAt: now,
      updatedAt: now,
      wrapping: { mode: 'session', algorithm: 'none' },
      extractable: false,
    },
  };
}
