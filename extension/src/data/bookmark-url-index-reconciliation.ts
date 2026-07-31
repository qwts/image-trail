import { bookmarkSearchIndexKey, shouldReconcileBookmarkUrlIndexes, type SearchableMetadataPolicy } from '../core/metadata-policy.js';
import type { BookmarksRepository, EncryptedBookmarkRecord } from './repositories/bookmarks-repository.js';

export async function reconcileBookmarkUrlIndexes(
  repository: BookmarksRepository,
  key: CryptoKey,
  policy: SearchableMetadataPolicy,
): Promise<readonly EncryptedBookmarkRecord[]> {
  if (policy.urlDerived !== 'encrypted') return [];
  const updates: { uuid: string; url: string }[] = [];
  for (const record of await repository.listEncrypted()) {
    if (hasOpaqueBookmarkIndex(record.url)) continue;
    try {
      const payload = await repository.openRecord(record, key);
      if (payload.url.startsWith('data:image/')) continue;
      const url = await bookmarkSearchIndexKey(payload.url, policy);
      if (record.url !== url) updates.push({ uuid: record.uuid, url });
    } catch {
      // Unreadable records cannot be safely re-indexed; leave them untouched.
    }
  }
  return repository.updateUrlIndexes(updates);
}

export function shouldReconcileBookmarksForPolicyChange(
  previous: SearchableMetadataPolicy | undefined,
  next: SearchableMetadataPolicy,
): boolean {
  return previous !== undefined && shouldReconcileBookmarkUrlIndexes(previous, next);
}

function hasOpaqueBookmarkIndex(url: string): boolean {
  return url.startsWith('image-trail-import:') || url.startsWith('image-trail-interop:');
}
