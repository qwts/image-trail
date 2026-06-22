import { rebuildUrl, setUrlFieldValue } from './rebuild-url.js';
import { tokenValue } from './tokenize-fields.js';
import type { ParsedUrlModel, UrlField } from './types.js';

export type UrlTemplateMatchMode = 'exact-page-shape' | 'same-path-query-shape' | 'broad-site';

export interface UrlTemplateField {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly location: UrlField['location'];
  readonly tokenKind: UrlField['tokenKind'];
  readonly partIndex?: number;
  readonly queryIndex?: number;
  readonly queryKey?: string;
  readonly tokenIndex: number;
}

export interface UrlTemplateMatchRules {
  readonly mode: UrlTemplateMatchMode;
  readonly hostname: string;
  readonly exactPathSignature: string;
  readonly pathShapeSignature: string;
  readonly querySignature: string;
}

export interface UrlTemplateRecord {
  readonly id: string;
  readonly schemaVersion: 1;
  readonly hostname: string;
  readonly templateUrl: string;
  readonly matchRules: UrlTemplateMatchRules;
  readonly fields: readonly UrlTemplateField[];
  readonly hideExcludedFields: boolean;
  readonly autoApplyEnabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly useCount: number;
}

export function createUrlTemplateRecord(input: {
  readonly model: ParsedUrlModel;
  readonly fields: readonly UrlField[];
  readonly includedFieldIds: readonly string[];
  readonly existing?: UrlTemplateRecord;
  readonly now?: string;
}): UrlTemplateRecord | null {
  const included = input.fields.filter((field) => input.includedFieldIds.includes(field.id));
  if (included.length === 0) return null;

  const now = input.now ?? new Date().toISOString();
  const matchRules = templateMatchRules(input.model, 'exact-page-shape');
  const templateUrl = templateUrlForFields(input.model, included);

  return {
    id: input.existing?.id ?? templateId(matchRules),
    schemaVersion: 1,
    hostname: matchRules.hostname,
    templateUrl,
    matchRules: input.existing?.matchRules ? { ...matchRules, mode: input.existing.matchRules.mode } : matchRules,
    fields: included.map((field) => templateField(input.model, field)),
    hideExcludedFields: input.existing?.hideExcludedFields ?? false,
    autoApplyEnabled: input.existing?.autoApplyEnabled ?? true,
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    useCount: (input.existing?.useCount ?? 0) + 1,
  };
}

export function templateMatchRules(model: ParsedUrlModel, mode: UrlTemplateMatchMode): UrlTemplateMatchRules {
  return {
    mode,
    hostname: hostnameForModel(model),
    exactPathSignature: exactPathSignature(model),
    pathShapeSignature: pathShapeSignature(model),
    querySignature: querySignature(model),
  };
}

export function findBestMatchingTemplate(
  templates: readonly UrlTemplateRecord[],
  model: ParsedUrlModel,
  options: { readonly includeDisabled?: boolean } = {},
): UrlTemplateRecord | null {
  const candidates = templates.filter((template) => templateMatchesModel(template, model, options));
  return (
    candidates.sort(
      (a, b) => matchSpecificity(b.matchRules.mode) - matchSpecificity(a.matchRules.mode) || b.updatedAt.localeCompare(a.updatedAt),
    )[0] ?? null
  );
}

export function templateMatchesModel(
  template: UrlTemplateRecord,
  model: ParsedUrlModel,
  options: { readonly includeDisabled?: boolean } = {},
): boolean {
  if (template.autoApplyEnabled === false && options.includeDisabled !== true) return false;
  const current = templateMatchRules(model, template.matchRules.mode);
  if (template.matchRules.hostname !== current.hostname) return false;
  switch (template.matchRules.mode) {
    case 'exact-page-shape':
      return (
        template.matchRules.exactPathSignature === current.exactPathSignature &&
        template.matchRules.querySignature === current.querySignature
      );
    case 'same-path-query-shape':
      return (
        template.matchRules.pathShapeSignature === current.pathShapeSignature &&
        template.matchRules.querySignature === current.querySignature
      );
    case 'broad-site':
      return true;
  }
}

export function updateTemplateSettings(
  template: UrlTemplateRecord,
  changes: {
    readonly matchMode?: UrlTemplateMatchMode;
    readonly hideExcludedFields?: boolean;
    readonly autoApplyEnabled?: boolean;
    readonly now?: string;
  },
): UrlTemplateRecord {
  return {
    ...template,
    matchRules: changes.matchMode ? { ...template.matchRules, mode: changes.matchMode } : template.matchRules,
    hideExcludedFields: changes.hideExcludedFields ?? template.hideExcludedFields,
    autoApplyEnabled: changes.autoApplyEnabled ?? template.autoApplyEnabled ?? true,
    updatedAt: changes.now ?? new Date().toISOString(),
  };
}

export function updateTemplateFields(input: {
  readonly template: UrlTemplateRecord;
  readonly model: ParsedUrlModel;
  readonly fields: readonly UrlField[];
  readonly includedFieldIds: readonly string[];
  readonly now?: string;
}): UrlTemplateRecord | null {
  const included = input.fields.filter((field) => input.includedFieldIds.includes(field.id));
  if (included.length === 0) return null;
  const matchRules = templateMatchRules(input.model, input.template.matchRules.mode);
  return {
    ...input.template,
    hostname: matchRules.hostname,
    templateUrl: templateUrlForFields(input.model, included),
    matchRules,
    fields: included.map((field) => templateField(input.model, field)),
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

function templateUrlForFields(model: ParsedUrlModel, fields: readonly UrlField[]): string {
  const templated = fields.reduce<ParsedUrlModel>(
    (nextModel, field) => setUrlFieldValue(nextModel, field, templateFieldPlaceholder(field)),
    model,
  );
  return rebuildUrl(templated).replace(/%7B([^%]+)%7D/giu, '{$1}');
}

function templateField(model: ParsedUrlModel, field: UrlField): UrlTemplateField {
  return {
    id: field.id,
    label: field.label,
    placeholder: templateFieldPlaceholder(field),
    location: field.location,
    tokenKind: field.tokenKind,
    partIndex: field.partIndex,
    queryIndex: field.queryIndex,
    queryKey: field.queryIndex === undefined ? undefined : model.queryFields[field.queryIndex]?.key,
    tokenIndex: field.tokenIndex,
  };
}

function templateFieldPlaceholder(field: UrlField): string {
  const key = field.label
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '');
  return `{${key || field.id}}`;
}

function hostnameForModel(model: ParsedUrlModel): string {
  try {
    return new URL(rebuildUrl(model)).hostname.toLowerCase();
  } catch {
    return model.host.toLowerCase();
  }
}

function exactPathSignature(model: ParsedUrlModel): string {
  return model.pathParts
    .map((part) => {
      if (part.type === 'sep') return `/${part.raw}`;
      return `s:${part.tokens.map((token) => (token.kind === 'text' ? `text:${tokenValue(token)}` : `field:${token.kind}`)).join(',')}`;
    })
    .join('|');
}

function pathShapeSignature(model: ParsedUrlModel): string {
  return model.pathParts
    .map((part) => {
      if (part.type === 'sep') return `/${part.raw}`;
      return `s:${part.tokens.map((token) => token.kind).join(',')}`;
    })
    .join('|');
}

function querySignature(model: ParsedUrlModel): string {
  return model.queryFields.map((field) => `${field.key}:${field.valueTokens.map((token) => token.kind).join(',')}`).join('&');
}

function templateId(rules: UrlTemplateMatchRules): string {
  return `${rules.hostname}:${fnv1a(`${rules.exactPathSignature}?${rules.querySignature}`)}`;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function matchSpecificity(mode: UrlTemplateMatchMode): number {
  switch (mode) {
    case 'exact-page-shape':
      return 3;
    case 'same-path-query-shape':
      return 2;
    case 'broad-site':
      return 1;
  }
}
