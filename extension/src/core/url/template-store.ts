import type { GrabSourcePattern, UrlTemplateRecord } from './templates.js';

export interface LoadedUrlTemplates {
  readonly templates: readonly UrlTemplateRecord[];
  readonly identityKey: string | null;
}

export interface UrlTemplateStore {
  load(hostname: string): Promise<LoadedUrlTemplates>;
  loadGrabSourcePatterns(hostname: string): Promise<readonly GrabSourcePattern[]>;
  save(template: UrlTemplateRecord): Promise<void>;
  saveGrabSourcePattern(pattern: GrabSourcePattern): Promise<void>;
  remove(hostname: string, id: string): Promise<void>;
  removeGrabSourcePattern(hostname: string, id: string): Promise<void>;
}
