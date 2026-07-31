import type { LoadedUrlTemplates } from '../core/url/template-store.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../core/url/templates.js';
import { openImageTrailDb } from './db.js';
import { UrlTemplateRepository } from './repositories/url-template-repository.js';

export interface UrlTemplateStore {
  load(hostname: string): Promise<LoadedUrlTemplates>;
  loadGrabSourcePatterns(hostname: string): Promise<readonly GrabSourcePattern[]>;
  save(template: UrlTemplateRecord): Promise<void>;
  saveGrabSourcePattern(pattern: GrabSourcePattern): Promise<void>;
  remove(hostname: string, id: string): Promise<void>;
  removeGrabSourcePattern(hostname: string, id: string): Promise<void>;
}

export class IndexedDbUrlTemplateStore implements UrlTemplateStore {
  private ready: Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlTemplateRepository;
  } | null> | null = null;

  async load(hostname: string): Promise<LoadedUrlTemplates> {
    const context = await this.openContext();
    if (!context) return { templates: [], identityKey: null };
    const [templates, identityKey] = await Promise.all([context.repository.listByHostname(hostname), context.repository.identityKey()]);
    return { templates, identityKey };
  }

  async loadGrabSourcePatterns(hostname: string): Promise<readonly GrabSourcePattern[]> {
    const context = await this.openContext();
    return context ? context.repository.listGrabSourcePatternsByHostname(hostname) : [];
  }

  async save(template: UrlTemplateRecord): Promise<void> {
    const context = await this.openContext();
    await context?.repository.put(template);
  }

  async saveGrabSourcePattern(pattern: GrabSourcePattern): Promise<void> {
    const context = await this.openContext();
    await context?.repository.putGrabSourcePattern(pattern);
  }

  async remove(hostname: string, id: string): Promise<void> {
    const context = await this.openContext();
    await context?.repository.delete(hostname, id);
  }

  async removeGrabSourcePattern(hostname: string, id: string): Promise<void> {
    const context = await this.openContext();
    await context?.repository.deleteGrabSourcePattern(hostname, id);
  }

  async close(): Promise<void> {
    const context = await this.ready;
    context?.db.close();
    this.ready = null;
  }

  private openContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlTemplateRepository;
  } | null> {
    this.ready ??= this.createContext();
    return this.ready;
  }

  private async createContext(): Promise<{
    readonly db: IDBDatabase;
    readonly repository: UrlTemplateRepository;
  } | null> {
    const result = await openImageTrailDb();
    return result.db ? { db: result.db, repository: new UrlTemplateRepository(result.db) } : null;
  }
}
