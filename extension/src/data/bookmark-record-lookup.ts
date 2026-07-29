import { bookmarkSearchIndexKey, hashSearchableUrl, type SearchableMetadataPolicy } from '../core/metadata-policy.js';
import type { BookmarksRepository, EncryptedBookmarkRecord } from './repositories/bookmarks-repository.js';

// Existing rows are never rewritten when searchable metadata policy changes, so
// lookup checks both index encodings before opening opaque interop-indexed rows.
export async function findStoredBookmarkByUrl(
  repository: BookmarksRepository,
  key: CryptoKey,
  url: string,
  policy: SearchableMetadataPolicy,
): Promise<EncryptedBookmarkRecord | undefined> {
  const primary = await repository.getEncryptedByUrl(await bookmarkSearchIndexKey(url, policy));
  if (primary) return primary;
  const fallbackKey = policy.urlDerived === 'plaintext' ? await hashSearchableUrl(url) : url;
  const fallback = await repository.getEncryptedByUrl(fallbackKey);
  if (fallback) return fallback;
  return findInteropBookmarkBySourceUrl(repository, key, url);
}

export async function findInteropBookmarkBySourceUrl(
  repository: BookmarksRepository,
  key: CryptoKey,
  url: string,
): Promise<EncryptedBookmarkRecord | undefined> {
  const knownPresence = await repository.getInteropCustodyPresence();
  if (knownPresence === false) return undefined;

  let sawInteropCustody = false;
  let sawUnreadableRecord = false;
  for (const encrypted of await repository.listEncrypted()) {
    try {
      const payload = await repository.openRecord(encrypted, key);
      if (!payload.interop) continue;
      sawInteropCustody = true;
      if (payload.interop.record.sourceUrl === url) {
        if (knownPresence !== true) await repository.setInteropCustodyPresence(true);
        return encrypted;
      }
    } catch {
      sawUnreadableRecord = true;
      // Unreadable rows cannot participate in encrypted source URL matching.
    }
  }
  const nextPresence = sawInteropCustody || sawUnreadableRecord;
  if (knownPresence === undefined) await repository.setInteropCustodyPresence(nextPresence);
  return undefined;
}
