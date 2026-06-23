import type { ParsedFieldStateRecord, ParsedFieldStateStore } from '../core/types.js';
import { openImageTrailDb } from './db.js';
import { ParsedFieldStateRepository } from './repositories/parsed-field-state-repository.js';

export class IndexedDbParsedFieldStateStore implements ParsedFieldStateStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: ParsedFieldStateRepository;
  } | null> | null = null;

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
    return result.db ? { db: result.db, repository: new ParsedFieldStateRepository(result.db) } : null;
  }
}
