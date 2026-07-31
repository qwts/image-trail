import { createUrlTemplateMessageRegistry } from '../extension/src/background/handlers/url-template-handlers.js';
import type { UrlTemplateStore } from '../extension/src/core/types.js';
import type { GrabSourcePattern, UrlTemplateRecord } from '../extension/src/core/url/templates.js';

export const URL_TEMPLATE_IDENTITY_KEY = '42'.repeat(32);

export function urlTemplateRecord(hostname: string, id = 'template-1'): UrlTemplateRecord {
  return {
    id,
    schemaVersion: 2,
    hostname,
    templateUrl: 'https://example.com/gallery/{page}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname,
      exactIdentity: '11'.repeat(32),
      pathShapeSignature: '/gallery',
      queryShapeSignature: '',
    },
    fields: [],
    hideExcludedFields: false,
    autoApplyEnabled: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    useCount: 0,
  };
}

export function grabSourcePattern(hostname: string, id = 'pattern-1'): GrabSourcePattern {
  return {
    id,
    schemaVersion: 2,
    hostname,
    patternUrl: 'https://example.com/photo/{id}',
    matchRules: {
      mode: 'exact-page-shape',
      hostname,
      exactIdentity: '22'.repeat(32),
      pathShapeSignature: '/photo',
      queryShapeSignature: '',
    },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-01T00:00:00.000Z',
    useCount: 0,
  };
}

export function urlTemplateFixture() {
  const templates = new Map<string, UrlTemplateRecord[]>();
  const patterns = new Map<string, GrabSourcePattern[]>();
  const store: UrlTemplateStore = {
    load: async (hostname) => ({ templates: templates.get(hostname) ?? [], identityKey: URL_TEMPLATE_IDENTITY_KEY }),
    loadGrabSourcePatterns: async (hostname) => patterns.get(hostname) ?? [],
    save: async (template) => {
      templates.set(template.hostname, [...(templates.get(template.hostname) ?? []), template]);
    },
    saveGrabSourcePattern: async (pattern) => {
      patterns.set(pattern.hostname, [...(patterns.get(pattern.hostname) ?? []), pattern]);
    },
    remove: async (hostname, id) => {
      templates.set(
        hostname,
        (templates.get(hostname) ?? []).filter((template) => template.id !== id),
      );
    },
    removeGrabSourcePattern: async (hostname, id) => {
      patterns.set(
        hostname,
        (patterns.get(hostname) ?? []).filter((pattern) => pattern.id !== id),
      );
    },
  };
  return { templates, patterns, registry: createUrlTemplateMessageRegistry({ urlTemplateStore: store }) };
}
