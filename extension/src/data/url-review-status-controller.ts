import type { SearchableMetadataPolicy } from '../core/metadata-policy.js';
import type { UrlReviewStatusClearFilter, UrlReviewStatusRecord, UrlReviewStatusStore } from '../core/types.js';
import { openImageTrailDb } from './db.js';
import { ensureDurableMetadataKey } from './durable-metadata-key.js';
import { KeysRepository } from './repositories/keys-repository.js';
import { UrlReviewStatusRepository } from './repositories/url-review-status-repository.js';
import type { UrlMetadataPrivacyOptions } from './url-metadata-privacy.js';

export class IndexedDbUrlReviewStatusStore implements UrlReviewStatusStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlReviewStatusRepository;
  } | null> | null = null;

  constructor(private readonly privacy: UrlMetadataPrivacyOptions = {}) {}

  async list(hostname: string): Promise<readonly UrlReviewStatusRecord[]> {
    const context = await this.openContext();
    return context ? context.repository.listByHostname(hostname) : [];
  }

  async listAll(): Promise<readonly UrlReviewStatusRecord[]> {
    const context = await this.openContext();
    return context ? context.repository.listAll() : [];
  }

  async save(record: UrlReviewStatusRecord, options: { readonly maxRecordsPerHost?: number } = {}): Promise<void> {
    const context = await this.openContext();
    await context?.repository.put(record, options);
  }

  async importMany(records: readonly UrlReviewStatusRecord[], options: { readonly maxRecordsPerHost?: number } = {}): Promise<number> {
    const context = await this.openContext();
    return context ? context.repository.putMany(records, options) : 0;
  }

  async clear(filter: UrlReviewStatusClearFilter): Promise<number> {
    const context = await this.openContext();
    return context ? context.repository.clear(filter) : 0;
  }

  async close(): Promise<void> {
    const context = await this.ready;
    context?.db.close();
    this.ready = null;
  }

  async reconcileSearchableMetadataPolicy(policy: SearchableMetadataPolicy): Promise<void> {
    const context = await this.openContext();
    await context?.repository.reconcilePolicy(policy);
  }

  private openContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlReviewStatusRepository;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlReviewStatusRepository;
  } | null> {
    const result = await openImageTrailDb();
    const db = result.db;
    if (!db) return null;
    let localEncryptionKey: ReturnType<typeof ensureDurableMetadataKey> | null = null;
    const getEncryptionKey =
      this.privacy.getEncryptionKey ??
      (() => {
        localEncryptionKey ??= ensureDurableMetadataKey(new KeysRepository(db));
        return localEncryptionKey;
      });
    return {
      db,
      repository: new UrlReviewStatusRepository(db, { ...this.privacy, getEncryptionKey }),
    };
  }
}
