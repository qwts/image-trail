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
// screen sharing. Defaults are privacy-max: no optional class sits in plaintext unless the user opts
// in. Changing the policy never requires decrypting encrypted originals — the URL class is enforced
// by hashing the (already plaintext) index value.

export type SearchableMetadataMode = 'plaintext' | 'encrypted';

export const SEARCHABLE_METADATA_CLASSES = ['urlDerived', 'albumName', 'thumbnail'] as const;
export type SearchableMetadataClass = (typeof SEARCHABLE_METADATA_CLASSES)[number];

export interface SearchableMetadataPolicy {
  // Plain-bookmark URL index (BookmarksByUrl). 'encrypted' stores a SHA-256 hash — dedup still works,
  // the real URL stays in the encrypted payload. Protected pins already hash their URL unconditionally.
  readonly urlDerived: SearchableMetadataMode;
  // User-authored album names. 'encrypted' seals the name in an envelope (see Slice 2). Fixed at
  // 'encrypted' until album-name enforcement lands.
  readonly albumName: SearchableMetadataMode;
  // Thumbnail/preview bytes. Already encrypted everywhere at rest — 'encrypted' is the only supported
  // state; there is no plaintext-thumbnail write path.
  readonly thumbnail: SearchableMetadataMode;
}

// Privacy-max: every optional class kept out of plaintext searchable metadata by default.
export const DEFAULT_SEARCHABLE_METADATA_POLICY: SearchableMetadataPolicy = {
  urlDerived: 'encrypted',
  albumName: 'encrypted',
  thumbnail: 'encrypted',
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

const SEARCHABLE_URL_HASH_PATTERN = /^[0-9a-f]{64}$/u;

// Synthetic (non-URL) index tokens already used for records that never carry a real page URL in the
// index: data-URL imports (`image-trail-import:`) and protected-pin relationship rows
// (`image-trail-private:`). These do not leak browsing URLs and are left untouched by redaction.
const SYNTHETIC_INDEX_URL_PREFIXES = ['image-trail-import:', 'image-trail-private:'] as const;

export function looksLikeSearchableUrlHash(value: string): boolean {
  return SEARCHABLE_URL_HASH_PATTERN.test(value);
}

function isSyntheticIndexUrl(value: string): boolean {
  return SYNTHETIC_INDEX_URL_PREFIXES.some((prefix) => value.startsWith(prefix));
}

// The index value written for a real bookmark URL under the active policy: the URL itself when the
// class is allowed plaintext, otherwise its hash.
export async function bookmarkSearchIndexKey(url: string, policy: SearchableMetadataPolicy): Promise<string> {
  return isSearchablePlaintext('urlDerived', policy) ? url : hashSearchableUrl(url);
}

// True when an existing index value is a real plaintext URL that must be hashed to satisfy an
// 'encrypted' urlDerived policy. Already-hashed and synthetic-token values are skipped (idempotent).
export function needsUrlRedaction(indexUrl: string): boolean {
  return !looksLikeSearchableUrlHash(indexUrl) && !isSyntheticIndexUrl(indexUrl);
}
