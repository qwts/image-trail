import type { PanelPosition, PanelPositionStore } from '../core/types.js';
import { openImageTrailDb } from './db.js';
import { PanelPositionRepository } from './repositories/panel-position-repository.js';

export class IndexedDbPanelPositionStore implements PanelPositionStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: PanelPositionRepository;
  } | null> | null = null;

  async load(hostname: string): Promise<PanelPosition | null> {
    const context = await this.openContext();
    return context ? context.repository.get(hostname) : null;
  }

  async save(hostname: string, position: PanelPosition): Promise<void> {
    const context = await this.openContext();
    await context?.repository.put(hostname, position);
  }

  async remove(hostname: string): Promise<void> {
    const context = await this.openContext();
    await context?.repository.delete(hostname);
  }

  async close(): Promise<void> {
    const context = await this.ready;
    context?.db.close();
    this.ready = null;
  }

  private openContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: PanelPositionRepository;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: PanelPositionRepository;
  } | null> {
    const result = await openImageTrailDb();
    return result.db ? { db: result.db, repository: new PanelPositionRepository(result.db) } : null;
  }
}
