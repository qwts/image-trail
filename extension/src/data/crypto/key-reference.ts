import type { KeyKind, KeyReference, KeyReferenceString } from './types.js';

export function deriveKeyReference<K extends KeyKind>(kind: K, uuid: string): KeyReferenceString<K> {
  if (!uuid.trim()) throw new Error('Key UUID must be a non-empty string.');
  return `${kind}:${uuid}` as KeyReferenceString<K>;
}

export function createKeyReference<K extends KeyKind>(kind: K, uuid: string): KeyReference<K> {
  return { kind, uuid, reference: deriveKeyReference(kind, uuid) };
}

export function assertKeyReference(reference: KeyReference): void {
  const expected = deriveKeyReference(reference.kind, reference.uuid);
  if (reference.reference !== expected) {
    throw new Error(`Key reference must be derived from kind and uuid: expected ${expected}.`);
  }
}
