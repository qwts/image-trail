import * as v from 'valibot';

/**
 * Validates a single IndexedDB row against `schema`. Returns the row unchanged
 * when valid (never a reconstructed copy — reconstruction would strip/reorder
 * nested fields such as an envelope's `key`/`authenticatedMetadata`, which are
 * fed verbatim into AES-GCM additional-authenticated-data and must round-trip
 * byte-for-byte). A missing row (`undefined`/`null`) is a not-found, not a
 * corruption. An invalid row is quarantined: dropped and logged, never returned.
 */
export function hydrateRecord<T>(storeName: string, schema: v.GenericSchema<unknown, T>, row: unknown): T | undefined {
  if (row === undefined || row === null) return undefined;
  if (v.is(schema, row)) return row as T;
  console.warn(`[image-trail] Quarantined a corrupted record in the "${storeName}" store.`);
  return undefined;
}

/** Validates a list of rows, dropping (and logging a count of) any that fail `schema`. */
export function hydrateRecords<T>(storeName: string, schema: v.GenericSchema<unknown, T>, rows: readonly unknown[]): T[] {
  const valid: T[] = [];
  let quarantined = 0;
  for (const row of rows) {
    if (v.is(schema, row)) valid.push(row as T);
    else quarantined += 1;
  }
  if (quarantined > 0) {
    console.warn(`[image-trail] Quarantined ${quarantined} corrupted record(s) in the "${storeName}" store.`);
  }
  return valid;
}
