import type { UrlReviewStatusClearFilter, UrlReviewStatusRecord, UrlReviewStatusStore } from '../core/types.js';
import { openImageTrailDb } from './db.js';
import { UrlReviewStatusRepository } from './repositories/url-review-status-repository.js';

export class IndexedDbUrlReviewStatusStore implements UrlReviewStatusStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlReviewStatusRepository;
  } | null> | null = null;

  async list(hostname: string): Promise<readonly UrlReviewStatusRecord[]> {
    const context = await this.openContext();
    return context ? context.repository.listByHostname(hostname) : [];
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
    return result.db ? { db: result.db, repository: new UrlReviewStatusRepository(result.db) } : null;
  }
}
