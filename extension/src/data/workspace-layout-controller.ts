import type { StoredWorkspaceLayout, WorkspaceLayoutStore } from '../core/workspace-layout.js';
import { openImageTrailDb } from './db.js';
import { WorkspaceLayoutRepository } from './repositories/workspace-layout-repository.js';

export class IndexedDbWorkspaceLayoutStore implements WorkspaceLayoutStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: WorkspaceLayoutRepository;
  } | null> | null = null;

  async load(hostname: string): Promise<StoredWorkspaceLayout | null> {
    const context = await this.openContext();
    return context ? context.repository.get(hostname) : null;
  }

  async save(hostname: string, layout: StoredWorkspaceLayout): Promise<void> {
    const context = await this.openContext();
    await context?.repository.put(hostname, layout);
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
    readonly repository: WorkspaceLayoutRepository;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: WorkspaceLayoutRepository;
  } | null> {
    const result = await openImageTrailDb();
    return result.db ? { db: result.db, repository: new WorkspaceLayoutRepository(result.db) } : null;
  }
}
