import type { PanelState, ParsedFieldResetBaseline, ParsedFieldStateRecord } from '../../core/types.js';
import { imageResourceUrlsEqual } from '../../core/image/image-navigation.js';
import { applyFieldSplitSpecs, validFieldSplitSpecsForModel } from '../../core/url/field-splits.js';
import { applyFieldDigitWidthSpecs, fieldDigitWidthSpecsEqual } from '../../core/url/field-widths.js';
import { parseUrl } from '../../core/url/parse-url.js';
import { collectUrlFields } from '../../core/url/tokenize-fields.js';
import type { ParsedUrlModel, UrlField, UrlFieldDigitWidthSpec, UrlFieldSplitSpec } from '../../core/url/types.js';

type ParsedFieldResetSlice = Pick<
  PanelState,
  | 'activeFieldId'
  | 'failedFieldId'
  | 'successfulFieldIds'
  | 'unchangedFieldIds'
  | 'unlockedFieldIds'
  | 'manuallyExcludedFieldIds'
  | 'fieldSplitSpecs'
  | 'fieldDigitWidthSpecs'
>;

const baselineKeys = [
  'activeFieldId',
  'failedFieldId',
  'successfulFieldIds',
  'unchangedFieldIds',
  'unlockedFieldIds',
  'manuallyExcludedFieldIds',
  'fieldSplitSpecs',
  'fieldDigitWidthSpecs',
] as const;

export function parsedFieldResetBaselineFromState(state: ParsedFieldResetSlice, sourceUrl: string): ParsedFieldResetBaseline {
  return {
    sourceUrl,
    activeFieldId: state.activeFieldId,
    failedFieldId: state.failedFieldId,
    successfulFieldIds: state.successfulFieldIds,
    unchangedFieldIds: state.unchangedFieldIds,
    unlockedFieldIds: state.unlockedFieldIds,
    manuallyExcludedFieldIds: state.manuallyExcludedFieldIds,
    fieldSplitSpecs: state.fieldSplitSpecs,
    fieldDigitWidthSpecs: state.fieldDigitWidthSpecs,
  };
}

export function parsedFieldResetBaselineFromRecord(record: ParsedFieldStateRecord): ParsedFieldResetBaseline {
  return parsedFieldResetBaselineFromState({ ...record, fieldDigitWidthSpecs: record.fieldDigitWidthSpecs ?? [] }, record.sourceUrl);
}

export function parsedFieldResetAllAvailable(state: PanelState, currentUrl: string): boolean {
  const baseline = state.parsedFieldResetBaseline;
  if (!baseline) return false;
  // Resolved-URL comparison, matching the restore path (`applyRestoredParsedFieldState`): a raw
  // string compare flags relative-vs-absolute variants of the SAME image as "navigated away" and
  // shows Reset all when nothing changed.
  return !imageResourceUrlsEqual(baseline.sourceUrl, currentUrl) || !resetSlicesEqual(state, baseline);
}

export function parsedFieldStructureResetAvailable(state: PanelState, currentUrl: string): boolean {
  const baseline = state.parsedFieldResetBaseline;
  if (!baseline) return false;
  try {
    return !parsedUrlStructuresEqual(parseUrl(currentUrl), parseUrl(baseline.sourceUrl));
  } catch {
    return false;
  }
}

export function parsedUrlStructuresEqual(left: ParsedUrlModel, right: ParsedUrlModel): boolean {
  return parsedUrlStructureSignature(left) === parsedUrlStructureSignature(right);
}

function parsedUrlStructureSignature(model: ParsedUrlModel): string {
  return JSON.stringify({
    path: model.pathParts.map((part) =>
      part.type === 'sep' ? { type: part.type, raw: part.raw } : { type: part.type, tokenKinds: part.tokens.map((token) => token.kind) },
    ),
    queryPrefix: model.queryPrefix,
    query: model.queryFields.map((field) => ({
      key: field.key,
      hasEquals: field.hasEquals,
      tokenKinds: field.valueTokens.map((token) => token.kind),
    })),
  });
}

export function resettableFieldIdsForFields(fields: readonly UrlField[], state: PanelState, currentUrl: string): ReadonlySet<string> {
  const baseline = state.parsedFieldResetBaseline;
  if (!baseline) return new Set<string>();
  const baselineFields = baselineFieldsById(baseline);
  return new Set(
    fields.filter((field) => fieldResetAvailable(field, baselineFields, state, baseline, currentUrl)).map((field) => field.id),
  );
}

export function resetAllParsedFieldState(state: PanelState, baseline: ParsedFieldResetBaseline): PanelState {
  return {
    ...state,
    activeFieldId: baseline.activeFieldId,
    failedFieldId: baseline.failedFieldId,
    successfulFieldIds: baseline.successfulFieldIds,
    unchangedFieldIds: baseline.unchangedFieldIds,
    unlockedFieldIds: baseline.unlockedFieldIds,
    manuallyExcludedFieldIds: baseline.manuallyExcludedFieldIds,
    fieldSplitSpecs: baseline.fieldSplitSpecs,
    fieldDigitWidthSpecs: baseline.fieldDigitWidthSpecs,
    parsedFieldResetBaseline: null,
    status: 'ready',
    message: 'Parsed fields reset.',
    lastUpdatedAt: Date.now(),
  };
}

export function resetParsedFieldStructureState(state: PanelState, baseline: ParsedFieldResetBaseline): PanelState {
  const baselineModel = parseUrl(baseline.sourceUrl);
  const fieldSplitSpecs = validFieldSplitSpecsForModel(baselineModel, state.fieldSplitSpecs);
  const splitModel = applyFieldSplitSpecs(baselineModel, fieldSplitSpecs);
  const validFieldIds = new Set(collectUrlFields(splitModel).map((field) => field.id));
  const keepMarker = (fieldId: string | null): string | null => (fieldId && validFieldIds.has(fieldId) ? fieldId : null);
  const keepIds = (fieldIds: readonly string[]): readonly string[] => fieldIds.filter((fieldId) => validFieldIds.has(fieldId));

  return {
    ...state,
    activeFieldId: keepMarker(state.activeFieldId),
    failedFieldId: keepMarker(state.failedFieldId),
    successfulFieldIds: keepIds(state.successfulFieldIds),
    unchangedFieldIds: keepIds(state.unchangedFieldIds),
    unlockedFieldIds: keepIds(state.unlockedFieldIds),
    manuallyExcludedFieldIds: keepIds(state.manuallyExcludedFieldIds),
    fieldSplitSpecs,
    fieldDigitWidthSpecs: state.fieldDigitWidthSpecs.filter((spec) => validFieldIds.has(spec.fieldId)),
    status: 'ready',
    message: 'Parsed field structure reset.',
    lastUpdatedAt: Date.now(),
  };
}

export function resetOneParsedFieldState(state: PanelState, baseline: ParsedFieldResetBaseline, baseFieldId: string): PanelState {
  const affectedFieldIds = affectedFieldIdsForBase(state.fieldSplitSpecs, baseline.fieldSplitSpecs, baseFieldId);
  const affected = new Set(affectedFieldIds);
  const affectedBase = new Set([baseFieldId]);
  return {
    ...state,
    activeFieldId: resetFieldMarker(state.activeFieldId, baseline.activeFieldId, affected),
    failedFieldId: resetFieldMarker(state.failedFieldId, baseline.failedFieldId, affected),
    successfulFieldIds: resetFieldIdList(state.successfulFieldIds, baseline.successfulFieldIds, affected),
    unchangedFieldIds: resetFieldIdList(state.unchangedFieldIds, baseline.unchangedFieldIds, affected),
    unlockedFieldIds: resetFieldIdList(state.unlockedFieldIds, baseline.unlockedFieldIds, affected),
    manuallyExcludedFieldIds: resetFieldIdList(state.manuallyExcludedFieldIds, baseline.manuallyExcludedFieldIds, affected),
    fieldSplitSpecs: resetSplitSpecs(state.fieldSplitSpecs, baseline.fieldSplitSpecs, affectedBase),
    fieldDigitWidthSpecs: resetDigitWidthSpecs(state.fieldDigitWidthSpecs, baseline.fieldDigitWidthSpecs, affected),
    status: 'ready',
    message: 'Parsed field reset.',
    lastUpdatedAt: Date.now(),
  };
}

function fieldResetAvailable(
  field: UrlField,
  baselineFields: ReadonlyMap<string, UrlField>,
  state: PanelState,
  baseline: ParsedFieldResetBaseline,
  currentUrl: string,
): boolean {
  if (parsedFieldResetAllAvailable(state, currentUrl) && fieldValueDiffers(field, baselineFields)) return true;
  const baseFieldId = field.splitBaseId ?? field.id;
  const affected = new Set(affectedFieldIdsForBase(state.fieldSplitSpecs, baseline.fieldSplitSpecs, baseFieldId));
  return (
    fieldSplitSpecForBase(state.fieldSplitSpecs, baseFieldId)?.pattern !==
      fieldSplitSpecForBase(baseline.fieldSplitSpecs, baseFieldId)?.pattern ||
    fieldDigitWidthDiffers(state.fieldDigitWidthSpecs, baseline.fieldDigitWidthSpecs, affected) ||
    fieldIdsDiffer(state.unlockedFieldIds, baseline.unlockedFieldIds, affected) ||
    fieldIdsDiffer(state.manuallyExcludedFieldIds, baseline.manuallyExcludedFieldIds, affected) ||
    fieldIdsDiffer(state.successfulFieldIds, baseline.successfulFieldIds, affected) ||
    fieldIdsDiffer(state.unchangedFieldIds, baseline.unchangedFieldIds, affected) ||
    markerDiffers(state.activeFieldId, baseline.activeFieldId, affected) ||
    markerDiffers(state.failedFieldId, baseline.failedFieldId, affected)
  );
}

function fieldValueDiffers(field: UrlField, baselineFields: ReadonlyMap<string, UrlField>): boolean {
  const baseline = baselineFields.get(field.id);
  return !baseline || baseline.value !== field.value || baseline.tokenKind !== field.tokenKind;
}

function baselineFieldsById(baseline: ParsedFieldResetBaseline): ReadonlyMap<string, UrlField> {
  try {
    const model = applyFieldDigitWidthSpecs(
      applyFieldSplitSpecs(parseUrl(baseline.sourceUrl), baseline.fieldSplitSpecs),
      baseline.fieldDigitWidthSpecs,
    );
    return new Map(collectUrlFields(model).map((field) => [field.id, field]));
  } catch {
    return new Map<string, UrlField>();
  }
}

function resetSlicesEqual(state: PanelState, baseline: ParsedFieldResetBaseline): boolean {
  return baselineKeys.every((key) => {
    if (key === 'activeFieldId' || key === 'failedFieldId') return state[key] === baseline[key];
    if (key === 'fieldDigitWidthSpecs') return fieldDigitWidthSpecsEqual(state.fieldDigitWidthSpecs, baseline.fieldDigitWidthSpecs);
    if (key === 'fieldSplitSpecs') return splitSpecsEqual(state.fieldSplitSpecs, baseline.fieldSplitSpecs);
    return stringArraysEqual(state[key], baseline[key]);
  });
}

function affectedFieldIdsForBase(
  currentSpecs: readonly UrlFieldSplitSpec[],
  baselineSpecs: readonly UrlFieldSplitSpec[],
  baseFieldId: string,
): readonly string[] {
  return [...new Set([baseFieldId, ...splitFieldIds(currentSpecs, baseFieldId), ...splitFieldIds(baselineSpecs, baseFieldId)])];
}

function splitFieldIds(specs: readonly UrlFieldSplitSpec[], baseFieldId: string): readonly string[] {
  const spec = fieldSplitSpecForBase(specs, baseFieldId);
  if (!spec) return [];
  const prefix = spec.location === 'path' ? `p:${spec.partIndex}` : `q:${spec.queryIndex}`;
  return spec.lengths.map((_, index) => `${prefix}:${spec.tokenIndex + index}`);
}

function resetFieldMarker(current: string | null, baseline: string | null, affected: ReadonlySet<string>): string | null {
  return current && !affected.has(current) ? current : baseline && affected.has(baseline) ? baseline : null;
}

function resetFieldIdList(current: readonly string[], baseline: readonly string[], affected: ReadonlySet<string>): readonly string[] {
  return [...current.filter((id) => !affected.has(id)), ...baseline.filter((id) => affected.has(id))];
}

function resetSplitSpecs(
  current: readonly UrlFieldSplitSpec[],
  baseline: readonly UrlFieldSplitSpec[],
  affectedBaseIds: ReadonlySet<string>,
): readonly UrlFieldSplitSpec[] {
  return [
    ...current.filter((spec) => !affectedBaseIds.has(spec.baseFieldId)),
    ...baseline.filter((spec) => affectedBaseIds.has(spec.baseFieldId)),
  ];
}

function resetDigitWidthSpecs(
  current: readonly UrlFieldDigitWidthSpec[],
  baseline: readonly UrlFieldDigitWidthSpec[],
  affected: ReadonlySet<string>,
): readonly UrlFieldDigitWidthSpec[] {
  return [...current.filter((spec) => !affected.has(spec.fieldId)), ...baseline.filter((spec) => affected.has(spec.fieldId))];
}

function fieldSplitSpecForBase(specs: readonly UrlFieldSplitSpec[], baseFieldId: string): UrlFieldSplitSpec | undefined {
  return specs.find((spec) => spec.baseFieldId === baseFieldId);
}

function fieldDigitWidthDiffers(
  current: readonly UrlFieldDigitWidthSpec[],
  baseline: readonly UrlFieldDigitWidthSpec[],
  affected: ReadonlySet<string>,
): boolean {
  return !fieldDigitWidthSpecsEqual(
    current.filter((spec) => affected.has(spec.fieldId)),
    baseline.filter((spec) => affected.has(spec.fieldId)),
  );
}

function fieldIdsDiffer(current: readonly string[], baseline: readonly string[], affected: ReadonlySet<string>): boolean {
  return !stringArraysEqual(
    current.filter((id) => affected.has(id)),
    baseline.filter((id) => affected.has(id)),
  );
}

function markerDiffers(current: string | null, baseline: string | null, affected: ReadonlySet<string>): boolean {
  return (current !== null && affected.has(current)) || (baseline !== null && affected.has(baseline)) ? current !== baseline : false;
}

function splitSpecsEqual(left: readonly UrlFieldSplitSpec[], right: readonly UrlFieldSplitSpec[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((spec) => {
    const other = fieldSplitSpecForBase(right, spec.baseFieldId);
    return (
      other !== undefined &&
      spec.location === other.location &&
      spec.partIndex === other.partIndex &&
      spec.queryIndex === other.queryIndex &&
      spec.tokenIndex === other.tokenIndex &&
      spec.pattern === other.pattern &&
      stringArraysEqual(spec.lengths.map(String), other.lengths.map(String))
    );
  });
}

function stringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
