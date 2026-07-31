import type { SearchableMetadataPolicy } from '../core/metadata-policy.js';
import { reconcileBookmarkUrlIndexes, shouldReconcileBookmarksForPolicyChange } from './bookmark-url-index-reconciliation.js';
import { ensureDurableBookmarkKey, type DurableBookmarkKeyContext } from './durable-bookmark-key.js';
import { ensureDurableMetadataKey, type DurableMetadataKeyContext } from './durable-metadata-key.js';
import { IndexedDbParsedFieldStateStore } from './parsed-field-state-controller.js';
import { BookmarksRepository } from './repositories/bookmarks-repository.js';
import { KeysRepository } from './repositories/keys-repository.js';
import { IndexedDbUrlReviewStatusStore } from './url-review-status-controller.js';

export async function reconcilePersistedUrlMetadataPolicy(options: {
  readonly loadPolicy: () => SearchableMetadataPolicy | Promise<SearchableMetadataPolicy>;
  readonly reconcilePolicy: (policy: SearchableMetadataPolicy) => Promise<void>;
}): Promise<void> {
  await options.reconcilePolicy(await options.loadPolicy());
}

export function createUrlMetadataStores(options: {
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly getSearchableMetadataPolicy: () => SearchableMetadataPolicy | Promise<SearchableMetadataPolicy>;
}): {
  readonly parsedFieldStateStore: IndexedDbParsedFieldStateStore;
  readonly urlReviewStatusStore: IndexedDbUrlReviewStatusStore;
  readonly reconcileSearchableMetadataPolicy: (
    policy: SearchableMetadataPolicy,
    previous?: SearchableMetadataPolicy | undefined,
  ) => Promise<void>;
} {
  let keyPromise: Promise<DurableMetadataKeyContext> | null = null;
  let bookmarkKeyPromise: Promise<DurableBookmarkKeyContext> | null = null;
  let bookmarkReconciliationPromise: Promise<void> | null = null;
  const getEncryptionKey = (): Promise<DurableMetadataKeyContext> => {
    keyPromise ??= options.getDb().then((db) => {
      if (!db) throw new Error('Image Trail metadata encryption storage is unavailable.');
      return ensureDurableMetadataKey(new KeysRepository(db));
    });
    return keyPromise;
  };
  const reconcileBookmarks = async (policy: SearchableMetadataPolicy): Promise<void> => {
    const db = await options.getDb();
    if (!db) throw new Error('Image Trail bookmark storage is unavailable for URL index reconciliation.');
    bookmarkKeyPromise ??= ensureDurableBookmarkKey(new KeysRepository(db));
    await reconcileBookmarkUrlIndexes(new BookmarksRepository(db), (await bookmarkKeyPromise).key, policy);
  };
  const privacy = {
    getSearchableMetadataPolicy: options.getSearchableMetadataPolicy,
    getEncryptionKey,
  };
  const parsedFieldStateStore = new IndexedDbParsedFieldStateStore(privacy);
  const urlReviewStatusStore = new IndexedDbUrlReviewStatusStore(privacy);
  return {
    parsedFieldStateStore,
    urlReviewStatusStore,
    reconcileSearchableMetadataPolicy: async (policy, previous) => {
      if (previous !== undefined) {
        if (shouldReconcileBookmarksForPolicyChange(previous, policy)) {
          bookmarkReconciliationPromise ??= reconcileBookmarks(policy);
          try {
            await bookmarkReconciliationPromise;
          } finally {
            bookmarkReconciliationPromise = null;
          }
        }
        return;
      }
      await Promise.all([
        parsedFieldStateStore.reconcileSearchableMetadataPolicy(policy),
        urlReviewStatusStore.reconcileSearchableMetadataPolicy(policy),
      ]);
    },
  };
}
