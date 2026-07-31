import { rebuildUrl } from './rebuild-url.js';
import { templateFieldPlaceholder, templateUrlForFields } from './template-display-url.js';
import { tokenValue } from './tokenize-fields.js';
import { normalizeGrabStrategy, type UrlTemplateGrabStrategy } from './grab-strategies.js';
import { deriveUrlTemplateIdentity } from './template-identity.js';
import type { ParsedUrlModel, UrlField } from './types.js';

export type UrlTemplateMatchMode = 'exact-page-shape' | 'same-path-query-shape' | 'broad-site';

export interface UrlTemplateField {
  readonly id: string;
  readonly label: string;
  readonly placeholder: string;
  readonly location: UrlField['location'];
  readonly tokenKind: UrlField['tokenKind'];
  readonly partIndex?: number | undefined;
  readonly queryIndex?: number | undefined;
  readonly queryKey?: string | undefined;
  readonly tokenIndex: number;
}

export interface UrlTemplateMatchRules {
  readonly mode: UrlTemplateMatchMode;
  readonly hostname: string;
  readonly exactIdentity: string;
  readonly pathShapeSignature: string;
  readonly queryShapeSignature: string;
}

export interface GrabSourcePattern {
  readonly id: string;
  readonly schemaVersion: 2;
  readonly hostname: string;
  readonly patternUrl: string;
  readonly matchRules: UrlTemplateMatchRules;
  readonly grabStrategy?: UrlTemplateGrabStrategy | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly useCount: number;
}

export interface UrlTemplateRecord {
  readonly id: string;
  readonly schemaVersion: 2;
  readonly fieldIdVersion?: 2 | undefined;
  readonly hostname: string;
  readonly templateUrl: string;
  readonly matchRules: UrlTemplateMatchRules;
  readonly fields: readonly UrlTemplateField[];
  readonly hideExcludedFields: boolean;
  readonly autoApplyEnabled: boolean;
  readonly grabStrategy?: UrlTemplateGrabStrategy | undefined;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly useCount: number;
}

export function createUrlTemplateRecord(input: {
  readonly model: ParsedUrlModel;
  readonly fields: readonly UrlField[];
  readonly includedFieldIds: readonly string[];
  readonly identityKey: string;
  readonly existing?: UrlTemplateRecord | undefined;
  readonly now?: string | undefined;
}): UrlTemplateRecord | null {
  const included = input.fields.filter((field) => input.includedFieldIds.includes(field.id));
  if (included.length === 0) return null;

  const now = input.now ?? new Date().toISOString();
  const matchRules = templateMatchRules(input.model, 'exact-page-shape', input.identityKey);
  const templateUrl = templateUrlForFields(input.model, included);

  return {
    id: input.existing?.id ?? templateId(matchRules),
    schemaVersion: 2,
    fieldIdVersion: 2,
    hostname: matchRules.hostname,
    templateUrl,
    matchRules: input.existing?.matchRules ? { ...matchRules, mode: input.existing.matchRules.mode } : matchRules,
    fields: included.map((field) => templateField(input.model, field)),
    hideExcludedFields: input.existing?.hideExcludedFields ?? false,
    autoApplyEnabled: input.existing?.autoApplyEnabled ?? true,
    grabStrategy: normalizeGrabStrategy(input.existing?.grabStrategy),
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    useCount: (input.existing?.useCount ?? 0) + 1,
  };
}

export function createGrabSourcePattern(input: {
  readonly model: ParsedUrlModel;
  readonly identityKey: string;
  readonly existing?: GrabSourcePattern | undefined;
  readonly grabStrategy?: UrlTemplateGrabStrategy | undefined;
  readonly now?: string | undefined;
}): GrabSourcePattern {
  const now = input.now ?? new Date().toISOString();
  const matchRules = templateMatchRules(input.model, 'exact-page-shape', input.identityKey);
  return {
    id: input.existing?.id ?? `grab-source:${templateId(matchRules)}`,
    schemaVersion: 2,
    hostname: matchRules.hostname,
    patternUrl: redactedPatternUrl(input.model),
    matchRules: input.existing?.matchRules ? { ...matchRules, mode: input.existing.matchRules.mode } : matchRules,
    grabStrategy: normalizeGrabStrategy(input.grabStrategy ?? input.existing?.grabStrategy),
    createdAt: input.existing?.createdAt ?? now,
    updatedAt: now,
    useCount: (input.existing?.useCount ?? 0) + 1,
  };
}

export function upsertGrabSourcePattern(
  patterns: readonly GrabSourcePattern[],
  input: { readonly model: ParsedUrlModel; readonly identityKey: string; readonly now?: string },
): GrabSourcePattern {
  const matchRules = templateMatchRules(input.model, 'exact-page-shape', input.identityKey);
  const id = `grab-source:${templateId(matchRules)}`;
  const existing = patterns.find((pattern) => pattern.id === id);
  return createGrabSourcePattern({ model: input.model, identityKey: input.identityKey, existing, now: input.now });
}

export function updateGrabSourcePatternSettings(
  pattern: GrabSourcePattern,
  changes: {
    readonly matchMode?: UrlTemplateMatchMode | undefined;
    readonly grabStrategy?: UrlTemplateGrabStrategy | null | undefined;
    readonly now?: string | undefined;
  },
): GrabSourcePattern {
  const grabStrategy =
    changes.grabStrategy === null
      ? undefined
      : changes.grabStrategy === undefined
        ? pattern.grabStrategy
        : normalizeGrabStrategy(changes.grabStrategy);
  return {
    ...pattern,
    matchRules: changes.matchMode ? { ...pattern.matchRules, mode: changes.matchMode } : pattern.matchRules,
    grabStrategy,
    updatedAt: changes.now ?? new Date().toISOString(),
  };
}

export function findBestMatchingGrabSourcePattern(
  patterns: readonly GrabSourcePattern[],
  model: ParsedUrlModel,
  identityKey: string,
): GrabSourcePattern | null {
  const matches = patterns.filter((pattern) => grabSourcePatternMatches(pattern, model, identityKey));
  return (
    matches.sort(
      (a, b) => matchSpecificity(b.matchRules.mode) - matchSpecificity(a.matchRules.mode) || b.updatedAt.localeCompare(a.updatedAt),
    )[0] ?? null
  );
}

export function grabSourcePatternMatches(pattern: GrabSourcePattern, model: ParsedUrlModel, identityKey: string): boolean {
  const current = templateMatchRules(model, pattern.matchRules.mode, identityKey);
  if (pattern.matchRules.hostname !== current.hostname) return false;
  switch (pattern.matchRules.mode) {
    case 'exact-page-shape':
      return pattern.matchRules.exactIdentity === current.exactIdentity;
    case 'same-path-query-shape':
      return (
        pattern.matchRules.pathShapeSignature === current.pathShapeSignature &&
        pattern.matchRules.queryShapeSignature === current.queryShapeSignature
      );
    case 'broad-site':
      return true;
  }
}

export function templateMatchRules(model: ParsedUrlModel, mode: UrlTemplateMatchMode, identityKey: string): UrlTemplateMatchRules {
  return {
    mode,
    hostname: hostnameForModel(model),
    exactIdentity: deriveUrlTemplateIdentity(identityKey, literalExactSignature(model)),
    pathShapeSignature: pathShapeSignature(model),
    queryShapeSignature: queryShapeSignature(model),
  };
}

export function findBestMatchingTemplate(
  templates: readonly UrlTemplateRecord[],
  model: ParsedUrlModel,
  options: { readonly identityKey: string; readonly includeDisabled?: boolean },
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
  options: { readonly identityKey: string; readonly includeDisabled?: boolean },
): boolean {
  if (template.autoApplyEnabled === false && options.includeDisabled !== true) return false;
  const current = templateMatchRules(model, template.matchRules.mode, options.identityKey);
  if (template.matchRules.hostname !== current.hostname) return false;
  switch (template.matchRules.mode) {
    case 'exact-page-shape':
      return template.matchRules.exactIdentity === current.exactIdentity;
    case 'same-path-query-shape':
      return (
        template.matchRules.pathShapeSignature === current.pathShapeSignature &&
        template.matchRules.queryShapeSignature === current.queryShapeSignature
      );
    case 'broad-site':
      return true;
  }
}

export function updateTemplateSettings(
  template: UrlTemplateRecord,
  changes: {
    readonly matchMode?: UrlTemplateMatchMode | undefined;
    readonly hideExcludedFields?: boolean | undefined;
    readonly autoApplyEnabled?: boolean | undefined;
    readonly grabStrategy?: UrlTemplateGrabStrategy | null | undefined;
    readonly now?: string | undefined;
  },
): UrlTemplateRecord {
  const grabStrategy =
    changes.grabStrategy === null
      ? undefined
      : changes.grabStrategy === undefined
        ? template.grabStrategy
        : normalizeGrabStrategy(changes.grabStrategy);
  return {
    ...template,
    matchRules: changes.matchMode ? { ...template.matchRules, mode: changes.matchMode } : template.matchRules,
    hideExcludedFields: changes.hideExcludedFields ?? template.hideExcludedFields,
    autoApplyEnabled: changes.autoApplyEnabled ?? template.autoApplyEnabled ?? true,
    grabStrategy,
    updatedAt: changes.now ?? new Date().toISOString(),
  };
}

export function updateTemplateFields(input: {
  readonly template: UrlTemplateRecord;
  readonly model: ParsedUrlModel;
  readonly fields: readonly UrlField[];
  readonly includedFieldIds: readonly string[];
  readonly identityKey: string;
  readonly now?: string;
}): UrlTemplateRecord | null {
  const included = input.fields.filter((field) => input.includedFieldIds.includes(field.id));
  if (included.length === 0) return null;
  const matchRules = templateMatchRules(input.model, input.template.matchRules.mode, input.identityKey);
  return {
    ...input.template,
    fieldIdVersion: 2,
    hostname: matchRules.hostname,
    templateUrl: templateUrlForFields(input.model, included),
    matchRules,
    fields: included.map((field) => templateField(input.model, field)),
    updatedAt: input.now ?? new Date().toISOString(),
  };
}

function redactedPatternUrl(model: ParsedUrlModel): string {
  const path = model.pathParts.map((part) => (part.type === 'sep' ? part.raw : '{path-segment}')).join('') || '/';
  return `${model.protocol}//${model.host}${path}`;
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

function queryShapeSignature(model: ParsedUrlModel): string {
  return model.queryFields.map((field, index) => `${index}:${field.valueTokens.map((token) => token.kind).join(',')}`).join('&');
}

function literalExactSignature(model: ParsedUrlModel): string {
  return `${exactPathSignature(model)}?${querySignature(model)}`;
}

function templateId(rules: UrlTemplateMatchRules): string {
  return `${rules.hostname}:${rules.exactIdentity}`;
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
