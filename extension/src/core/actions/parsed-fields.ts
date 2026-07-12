import type { PanelState } from '../types.js';
import { validFieldSplitSpecsForModel } from '../url/field-splits.js';
import { updateGrabSourcePatternSettings, updateTemplateSettings } from '../url/templates.js';
import type { ParsedUrlModel, UrlFieldSplitSpec } from '../url/types.js';
import { assertNeverAction } from './routing.js';
import type { PanelActionForDomain } from './routing.js';

type ParsedFieldsAction = PanelActionForDomain<'parsed-fields'>;

function toggleItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items.filter((value) => value !== item) : [...items, item];
}

function addItem(items: readonly string[], item: string): readonly string[] {
  return items.includes(item) ? items : [...items, item];
}

function removeItem(items: readonly string[], item: string): readonly string[] {
  return items.filter((value) => value !== item);
}

function removeItems(items: readonly string[], removals: readonly string[]): readonly string[] {
  if (removals.length === 0) return items;
  const removalSet = new Set(removals);
  return items.filter((item) => !removalSet.has(item));
}

function splitFieldIds(spec: UrlFieldSplitSpec): readonly string[] {
  const prefix = spec.location === 'path' ? `p:${spec.partIndex}` : `q:${spec.queryIndex}`;
  return spec.lengths.map((_, index) => `${prefix}:${spec.tokenIndex + index}`);
}

function affectedSplitFieldIds(specs: readonly UrlFieldSplitSpec[]): readonly string[] {
  return [...new Set(specs.flatMap((spec) => [spec.baseFieldId, ...splitFieldIds(spec)]))];
}

function clearFieldMarkers(state: PanelState, fieldIds: readonly string[]): PanelState {
  if (fieldIds.length === 0) return state;
  return {
    ...state,
    failedFieldId: state.failedFieldId && fieldIds.includes(state.failedFieldId) ? null : state.failedFieldId,
    successfulFieldIds: removeItems(state.successfulFieldIds, fieldIds),
    unchangedFieldIds: removeItems(state.unchangedFieldIds, fieldIds),
    unlockedFieldIds: removeItems(state.unlockedFieldIds, fieldIds),
    manuallyExcludedFieldIds: removeItems(state.manuallyExcludedFieldIds, fieldIds),
    fieldDigitWidthSpecs: state.fieldDigitWidthSpecs.filter((spec) => !fieldIds.includes(spec.fieldId)),
    activeFieldId: state.activeFieldId && fieldIds.includes(state.activeFieldId) ? null : state.activeFieldId,
  };
}

export function applyFieldSplitSpecToState(state: PanelState, spec: UrlFieldSplitSpec): PanelState {
  const existing = state.fieldSplitSpecs.find((candidate) => candidate.baseFieldId === spec.baseFieldId);
  if (existing && fieldSplitSpecsEqual(existing, spec)) return state;
  const marked = clearFieldMarkers(state, affectedSplitFieldIds(existing ? [existing, spec] : [spec]));
  return {
    ...marked,
    fieldSplitSpecs: [...state.fieldSplitSpecs.filter((candidate) => candidate.baseFieldId !== spec.baseFieldId), spec],
    message: `Split pattern ${spec.pattern} applied.`,
    status: 'ready',
    lastUpdatedAt: Date.now(),
  };
}

export function clearFieldSplitSpecFromState(state: PanelState, baseFieldId: string): PanelState {
  const existing = state.fieldSplitSpecs.find((spec) => spec.baseFieldId === baseFieldId);
  if (!existing) return state;
  const marked = clearFieldMarkers(state, affectedSplitFieldIds([existing]));
  return {
    ...marked,
    fieldSplitSpecs: state.fieldSplitSpecs.filter((spec) => spec.baseFieldId !== baseFieldId),
    message: 'Split pattern cleared.',
    status: 'ready',
    lastUpdatedAt: Date.now(),
  };
}

function fieldSplitSpecsEqual(left: UrlFieldSplitSpec, right: UrlFieldSplitSpec): boolean {
  return (
    left.baseFieldId === right.baseFieldId &&
    left.location === right.location &&
    left.partIndex === right.partIndex &&
    left.queryIndex === right.queryIndex &&
    left.tokenIndex === right.tokenIndex &&
    left.pattern === right.pattern &&
    left.lengths.length === right.lengths.length &&
    left.lengths.every((length, index) => length === right.lengths[index])
  );
}

export function pruneInvalidFieldSplitSpecsFromState(state: PanelState, model: ParsedUrlModel): PanelState {
  const validSpecs = validFieldSplitSpecsForModel(model, state.fieldSplitSpecs);
  if (validSpecs.length === state.fieldSplitSpecs.length) return state;
  const validBaseIds = new Set(validSpecs.map((spec) => spec.baseFieldId));
  const removedSpecs = state.fieldSplitSpecs.filter((spec) => !validBaseIds.has(spec.baseFieldId));
  const marked = clearFieldMarkers(state, affectedSplitFieldIds(removedSpecs));
  return {
    ...marked,
    fieldSplitSpecs: validSpecs,
    message: removedSpecs.length === 1 ? 'Cleared stale split pattern.' : `Cleared ${removedSpecs.length} stale split patterns.`,
    status: 'ready',
    lastUpdatedAt: Date.now(),
  };
}

export function applyFieldLoadFailureToState(
  state: PanelState,
  input: { readonly draftUrl: string; readonly attemptedFieldIds: readonly string[]; readonly message: string },
): PanelState {
  return {
    ...state,
    draftUrl: input.draftUrl,
    failedFieldId: input.attemptedFieldIds[0] ?? null,
    unchangedFieldIds: removeItems(state.unchangedFieldIds, input.attemptedFieldIds),
    message: input.message,
    status: 'error',
    lastUpdatedAt: Date.now(),
  };
}

export function reduceParsedFieldsAction(state: PanelState, action: ParsedFieldsAction): PanelState {
  switch (action.name) {
    case 'active-field/set': {
      const failedFieldId = action.id === state.failedFieldId ? state.failedFieldId : null;
      if (state.activeFieldId === action.id && state.failedFieldId === failedFieldId) return state;
      return { ...state, activeFieldId: action.id, failedFieldId, lastUpdatedAt: Date.now() };
    }
    case 'field-unlock/toggle':
      if (!state.successfulFieldIds.includes(action.id) && !state.unlockedFieldIds.includes(action.id)) return state;
      return {
        ...state,
        unlockedFieldIds: toggleItem(state.unlockedFieldIds, action.id),
        manuallyExcludedFieldIds: state.unlockedFieldIds.includes(action.id)
          ? addItem(state.manuallyExcludedFieldIds, action.id)
          : removeItem(state.manuallyExcludedFieldIds, action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'field/transform':
      return action.transformId === 'split-clear' && 'fieldId' in action ? clearFieldSplitSpecFromState(state, action.fieldId) : state;
    case 'url-templates/load': {
      const previousActiveTemplate = state.urlTemplates.find((template) => template.id === state.activeUrlTemplateId);
      const preservedFailedDraftTemplate =
        state.status === 'error' && state.draftUrl && previousActiveTemplate
          ? action.templates.find((template) => template.id === previousActiveTemplate.id)
          : undefined;
      const activeTemplate = action.templates.find((template) => template.id === action.activeTemplateId) ?? preservedFailedDraftTemplate;
      const previousActiveFieldIds =
        !activeTemplate && previousActiveTemplate ? previousActiveTemplate.fields.map((field) => field.id) : [];
      return {
        ...state,
        urlTemplates: action.templates,
        activeUrlTemplateId: activeTemplate?.id ?? null,
        unlockedFieldIds: activeTemplate
          ? activeTemplate.fields.map((field) => field.id)
          : removeItems(state.unlockedFieldIds, previousActiveFieldIds),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'url-template/remove': {
      const removedTemplate = state.urlTemplates.find((template) => template.id === action.id);
      const removedFieldIds =
        removedTemplate && state.activeUrlTemplateId === action.id ? removedTemplate.fields.map((field) => field.id) : [];
      return {
        ...state,
        urlTemplates: state.urlTemplates.filter((template) => template.id !== action.id),
        activeUrlTemplateId: state.activeUrlTemplateId === action.id ? null : state.activeUrlTemplateId,
        unlockedFieldIds: removeItems(state.unlockedFieldIds, removedFieldIds),
        manuallyExcludedFieldIds: removeItems(state.manuallyExcludedFieldIds, removedFieldIds),
        lastUpdatedAt: Date.now(),
      };
    }
    case 'url-template/update-settings':
      return {
        ...state,
        urlTemplates: state.urlTemplates.map((template) =>
          template.id === action.id
            ? updateTemplateSettings(template, {
                matchMode: action.matchMode,
                hideExcludedFields: action.hideExcludedFields,
                autoApplyEnabled: action.autoApplyEnabled,
                grabStrategy: action.grabStrategy,
              })
            : template,
        ),
        lastUpdatedAt: Date.now(),
      };
    case 'url-template/update-fields':
      return {
        ...state,
        unlockedFieldIds: state.activeUrlTemplateId === action.id ? action.includedFieldIds : state.unlockedFieldIds,
        lastUpdatedAt: Date.now(),
      };
    case 'grab-source-patterns/load':
      return { ...state, grabSourcePatterns: action.patterns, lastUpdatedAt: Date.now() };
    case 'grab-source-pattern/remove':
      return {
        ...state,
        grabSourcePatterns: state.grabSourcePatterns.filter((pattern) => pattern.id !== action.id),
        lastUpdatedAt: Date.now(),
      };
    case 'grab-source-pattern/update-settings':
      return {
        ...state,
        grabSourcePatterns: state.grabSourcePatterns.map((pattern) =>
          pattern.id === action.id
            ? updateGrabSourcePatternSettings(pattern, { matchMode: action.matchMode, grabStrategy: action.grabStrategy })
            : pattern,
        ),
        lastUpdatedAt: Date.now(),
      };
    case 'parsed-field-state/restore':
      return {
        ...state,
        activeFieldId: action.record.activeFieldId,
        failedFieldId: action.record.failedFieldId,
        successfulFieldIds: action.record.successfulFieldIds,
        unchangedFieldIds: action.record.unchangedFieldIds,
        unlockedFieldIds: action.record.unlockedFieldIds,
        manuallyExcludedFieldIds: action.record.manuallyExcludedFieldIds,
        fieldSplitSpecs: action.record.fieldSplitSpecs,
        fieldDigitWidthSpecs: action.record.fieldDigitWidthSpecs ?? [],
        activeUrlTemplateId: action.record.activeUrlTemplateId,
        draftUrl: action.record.sourceUrl === action.record.selectedUrl ? null : action.record.sourceUrl,
        lastUpdatedAt: Date.now(),
      };
    case 'field/commit-rejected':
    case 'selected-url/apply':
    case 'selected-url/reject-unsupported-input':
      return state;
    default:
      return assertNeverAction(action);
  }
}
