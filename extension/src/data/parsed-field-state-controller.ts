import type { ParsedFieldStateRecord, ParsedFieldStateStore } from '../core/types.js';
import { openImageTrailDb } from './db.js';
import { ensureDurableMetadataKey } from './durable-metadata-key.js';
import { ParsedFieldStateRepository } from './repositories/parsed-field-state-repository.js';
import { KeysRepository } from './repositories/keys-repository.js';
import type { SearchableMetadataPolicy } from '../core/metadata-policy.js';
import type { UrlMetadataPrivacyOptions } from './url-metadata-privacy.js';

export class IndexedDbParsedFieldStateStore implements ParsedFieldStateStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: ParsedFieldStateRepository;
  } | null> | null = null;

  constructor(private readonly privacy: UrlMetadataPrivacyOptions = {}) {}

  async load(hostname: string, pageUrl: string): Promise<ParsedFieldStateRecord | null> {
    const context = await this.openContext();
    return context ? context.repository.get(hostname, pageUrl) : null;
  }

  async loadForSource(hostname: string, sourceUrl: string): Promise<ParsedFieldStateRecord | null> {
    const context = await this.openContext();
    return context ? context.repository.getForSource(hostname, sourceUrl) : null;
  }

  async save(record: ParsedFieldStateRecord): Promise<void> {
    const context = await this.openContext();
    await context?.repository.put(record);
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
    readonly repository: ParsedFieldStateRepository;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: ParsedFieldStateRepository;
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
      repository: new ParsedFieldStateRepository(db, { ...this.privacy, getEncryptionKey }),
    };
  }
}
