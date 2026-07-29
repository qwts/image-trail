import type { ParsedFieldStateRecord } from '../types.js';
import type { UrlTemplateRecord } from './templates.js';
import { applyFieldSplitSpecs } from './field-splits.js';
import { baseFieldId, baseFieldIdForSplitSpec } from './field-ids.js';
import { parseUrl } from './parse-url.js';
import { collectUrlFields } from './tokenize-fields.js';
import type { UrlField, UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from './types.js';

export const STABLE_FIELD_ID_VERSION = 2 as const;

export interface LegacyFieldIdMigration {
  readonly fieldSplitSpecs: readonly UrlFieldSplitSpec[];
  normalize(fieldId: string): string | null;
}

interface FieldIdCandidate {
  readonly stableId: string;
  readonly splitChild: boolean;
}

export function createLegacyFieldIdMigration(sourceUrl: string, fieldSplitSpecs: readonly UrlFieldSplitSpec[]): LegacyFieldIdMigration {
  const baseModel = parseUrl(sourceUrl);
  const normalizedSpecs = fieldSplitSpecs.map((spec) => ({ ...spec, baseFieldId: baseFieldIdForSplitSpec(spec) }));
  const baseFieldIds = new Set(collectUrlFields(baseModel).map((field) => field.id));
  const legacyCandidates = new Map<string, FieldIdCandidate>();
  for (const field of collectUrlFields(applyFieldSplitSpecs(baseModel, normalizedSpecs))) {
    const legacyId = positionalFieldId(field);
    if (!legacyId) continue;
    legacyCandidates.set(legacyId, {
      stableId: field.id,
      splitChild: field.splitPartIndex !== undefined,
    });
  }

  return {
    fieldSplitSpecs: normalizedSpecs,
    normalize(fieldId) {
      if (fieldId.includes(':s:')) return fieldId;
      const candidate = legacyCandidates.get(fieldId);
      if (!candidate) return baseFieldIds.has(fieldId) ? fieldId : null;
      if (candidate.stableId === fieldId || candidate.splitChild || !baseFieldIds.has(fieldId)) return candidate.stableId;
      // A retained pre-split id can collide with a different post-split position. Preserve its
      // original token identity instead of silently binding state to the shifted token (#642).
      return fieldId;
    },
  };
}

export function migrateParsedFieldStateRecord(record: ParsedFieldStateRecord, migration: LegacyFieldIdMigration): ParsedFieldStateRecord {
  if (record.fieldIdVersion === STABLE_FIELD_ID_VERSION) return record;
  return {
    ...record,
    fieldIdVersion: STABLE_FIELD_ID_VERSION,
    activeFieldId: normalizeNullableId(record.activeFieldId, migration),
    failedFieldId: normalizeNullableId(record.failedFieldId, migration),
    successfulFieldIds: normalizeIds(record.successfulFieldIds, migration),
    unchangedFieldIds: normalizeIds(record.unchangedFieldIds, migration),
    unlockedFieldIds: normalizeIds(record.unlockedFieldIds, migration),
    manuallyExcludedFieldIds: normalizeIds(record.manuallyExcludedFieldIds, migration),
    fieldSplitSpecs: migration.fieldSplitSpecs,
    fieldDigitWidthSpecs: normalizeWidthSpecs(record.fieldDigitWidthSpecs ?? [], migration),
  };
}

export function migrateUrlTemplatesForParsedFieldRecord(
  templates: readonly UrlTemplateRecord[],
  record: ParsedFieldStateRecord,
): readonly UrlTemplateRecord[] {
  const migration = createLegacyFieldIdMigration(record.sourceUrl, record.fieldSplitSpecs);
  return templates.map((template) => migrateUrlTemplateRecord(template, migration));
}

export function migrateUrlTemplateRecord(template: UrlTemplateRecord, migration: LegacyFieldIdMigration): UrlTemplateRecord {
  if (template.fieldIdVersion === STABLE_FIELD_ID_VERSION) return template;
  return {
    ...template,
    fieldIdVersion: STABLE_FIELD_ID_VERSION,
    fields: template.fields.flatMap((field) => {
      const id = migration.normalize(field.id);
      return id ? [{ ...field, id }] : [];
    }),
  };
}

function positionalFieldId(field: UrlField): string | null {
  const containerIndex = field.location === 'path' ? field.partIndex : field.queryIndex;
  return containerIndex === undefined ? null : baseFieldId(field.location, containerIndex, field.tokenIndex);
}

function normalizeNullableId(fieldId: string | null, migration: LegacyFieldIdMigration): string | null {
  return fieldId === null ? null : migration.normalize(fieldId);
}

function normalizeIds(fieldIds: readonly string[], migration: LegacyFieldIdMigration): readonly string[] {
  return [...new Set(fieldIds.map((fieldId) => migration.normalize(fieldId)).filter((fieldId): fieldId is string => fieldId !== null))];
}

function normalizeWidthSpecs(
  specs: readonly UrlFieldDigitWidthSpec[],
  migration: LegacyFieldIdMigration,
): readonly UrlFieldDigitWidthSpec[] {
  const normalized = new Map<string, UrlFieldDigitWidthSpec>();
  for (const spec of specs) {
    const fieldId = migration.normalize(spec.fieldId);
    if (fieldId) normalized.set(fieldId, { ...spec, fieldId });
  }
  return [...normalized.values()];
}
