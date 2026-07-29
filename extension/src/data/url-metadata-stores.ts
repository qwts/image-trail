import type { SearchableMetadataPolicy } from '../core/metadata-policy.js';
import { ensureDurableMetadataKey, type DurableMetadataKeyContext } from './durable-metadata-key.js';
import { IndexedDbParsedFieldStateStore } from './parsed-field-state-controller.js';
import { KeysRepository } from './repositories/keys-repository.js';
import { IndexedDbUrlReviewStatusStore } from './url-review-status-controller.js';

export function createUrlMetadataStores(options: {
  readonly getDb: () => Promise<IDBDatabase | null>;
  readonly getSearchableMetadataPolicy: () => SearchableMetadataPolicy | Promise<SearchableMetadataPolicy>;
}): {
  readonly parsedFieldStateStore: IndexedDbParsedFieldStateStore;
  readonly urlReviewStatusStore: IndexedDbUrlReviewStatusStore;
  readonly reconcileSearchableMetadataPolicy: (policy: SearchableMetadataPolicy) => Promise<void>;
} {
  let keyPromise: Promise<DurableMetadataKeyContext> | null = null;
  const getEncryptionKey = (): Promise<DurableMetadataKeyContext> => {
    keyPromise ??= options.getDb().then((db) => {
      if (!db) throw new Error('Image Trail metadata encryption storage is unavailable.');
      return ensureDurableMetadataKey(new KeysRepository(db));
    });
    return keyPromise;
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
    reconcileSearchableMetadataPolicy: async (policy) => {
      await Promise.all([
        parsedFieldStateStore.reconcileSearchableMetadataPolicy(policy),
        urlReviewStatusStore.reconcileSearchableMetadataPolicy(policy),
      ]);
    },
  };
}
