import { computeSha256 } from './image/fingerprints.js';

// #451 — user-controlled searchable-metadata privacy policy.
//
// Image Trail stores durable records as encrypted envelopes with a small amount of PLAINTEXT
// bookkeeping alongside each one (uuid, queue timestamps, key references). A few OPTIONAL fields
// have historically lived in that plaintext layer purely to be searchable/dedupable without
// decryption. This policy is the single source of truth for whether each optional class may remain
// in plaintext searchable metadata ('plaintext') or must be kept out of it ('encrypted' — hashed
// for URLs, sealed in the envelope for album names).
//
// This governs AT-REST metadata and is distinct from Privacy mode, which only masks the DISPLAY for
// screen sharing. It affects only what NEW records write; it never migrates or rewrites existing
// records. The default preserves today's behaviour exactly (plaintext), so enabling the feature is
// entirely opt-in and changes nothing about data already on disk.

export type SearchableMetadataMode = 'plaintext' | 'encrypted';

export const SEARCHABLE_METADATA_CLASSES = ['urlDerived', 'albumName', 'thumbnail'] as const;
export type SearchableMetadataClass = (typeof SEARCHABLE_METADATA_CLASSES)[number];

export interface SearchableMetadataPolicy {
  // Plain-bookmark URL index (BookmarksByUrl). 'encrypted' writes a SHA-256 hash for NEW records —
  // dedup still works, the real URL stays in the encrypted payload. Protected pins already hash their
  // URL unconditionally.
  readonly urlDerived: SearchableMetadataMode;
  // User-authored album names ('encrypted' seals the name in an envelope — Slice 2).
  readonly albumName: SearchableMetadataMode;
  // Thumbnail/preview bytes. Already encrypted everywhere at rest — 'encrypted' is the only supported
  // state; there is no plaintext-thumbnail write path.
  readonly thumbnail: SearchableMetadataMode;
}

// Conservative and compatible with existing records: the default preserves today's plaintext
// behaviour, so nothing on disk changes unless the user opts a class into 'encrypted'.
export const DEFAULT_SEARCHABLE_METADATA_POLICY: SearchableMetadataPolicy = {
  urlDerived: 'plaintext',
  albumName: 'plaintext',
  thumbnail: 'plaintext',
};

export function isSearchableMetadataMode(value: unknown): value is SearchableMetadataMode {
  return value === 'plaintext' || value === 'encrypted';
}

export function isSearchableMetadataPolicy(value: unknown): value is SearchableMetadataPolicy {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isSearchableMetadataMode(record['urlDerived']) &&
    isSearchableMetadataMode(record['albumName']) &&
    isSearchableMetadataMode(record['thumbnail'])
  );
}

export function sanitizeSearchableMetadataPolicy(value: unknown): SearchableMetadataPolicy {
  if (typeof value !== 'object' || value === null) return DEFAULT_SEARCHABLE_METADATA_POLICY;
  const record = value as Record<string, unknown>;
  return {
    urlDerived: isSearchableMetadataMode(record['urlDerived']) ? record['urlDerived'] : DEFAULT_SEARCHABLE_METADATA_POLICY.urlDerived,
    albumName: isSearchableMetadataMode(record['albumName']) ? record['albumName'] : DEFAULT_SEARCHABLE_METADATA_POLICY.albumName,
    thumbnail: isSearchableMetadataMode(record['thumbnail']) ? record['thumbnail'] : DEFAULT_SEARCHABLE_METADATA_POLICY.thumbnail,
  };
}

export function isSearchablePlaintext(cls: SearchableMetadataClass, policy: SearchableMetadataPolicy): boolean {
  return policy[cls] === 'plaintext';
}

// SHA-256 hex used for the URL index value. Identical to the hash protected pins already use, so plain
// and protected records stay consistent.
export function hashSearchableUrl(url: string): Promise<string> {
  return computeSha256(new TextEncoder().encode(url).buffer);
}

// The index value written for a NEW bookmark URL under the active policy: the URL itself when the
// class is allowed plaintext, otherwise its hash. Existing records are never rewritten.
export async function bookmarkSearchIndexKey(url: string, policy: SearchableMetadataPolicy): Promise<string> {
  return isSearchablePlaintext('urlDerived', policy) ? url : hashSearchableUrl(url);
}
