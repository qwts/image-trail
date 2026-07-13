import type { PanelState } from '../core/types.js';
import type { FieldTransformId } from '../core/url/field-transforms.js';
import type { UrlField } from '../core/url/types.js';
import type { ActiveUrlFields } from './active-url-fields.js';
import {
  parsedFieldResetAllAvailable,
  parsedFieldStructureResetAvailable,
  resettableFieldIdsForFields,
} from './panel/parsed-field-reset-baseline.js';

export type FieldEditorStatusKind = 'active' | 'loads' | 'included' | 'split' | 'unchanged' | 'failed';

export interface FieldEditorStatusFlags {
  readonly active: boolean;
  readonly successful: boolean;
  readonly included: boolean;
  readonly unchanged: boolean;
  readonly failed: boolean;
  readonly failureVisible: boolean;
}

export interface FieldEditorStatusChip {
  readonly kind: FieldEditorStatusKind;
  readonly label: string;
}

export interface FieldEditorSplitSummary {
  readonly baseFieldId: string;
  readonly position: number;
  readonly count: number;
}

export interface FieldEditorRowViewModel {
  readonly field: UrlField;
  readonly value: string;
  readonly digitWidth: number | null;
  readonly split: FieldEditorSplitSummary | null;
  readonly status: FieldEditorStatusFlags;
  readonly statusChips: readonly FieldEditorStatusChip[];
  readonly navigationEligible: boolean;
  readonly navigable: boolean;
  readonly canToggleNavigationInclusion: boolean;
  readonly availableTransforms: readonly FieldTransformId[];
}

export interface FieldEditorActiveFieldSummary {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly location: UrlField['location'];
  readonly tokenKind: UrlField['tokenKind'];
  readonly position: number;
  readonly count: number;
  readonly status: FieldEditorStatusFlags;
}

export interface FieldEditorCollapsedSummary {
  readonly fieldCount: number;
  readonly activeFieldId: string | null;
  readonly activeFieldLabel: string | null;
  readonly activePosition: number | null;
  readonly hasFailure: boolean;
  readonly failureVisible: boolean;
}

export interface FieldEditorViewModel {
  readonly editorUrl: string;
  readonly privacyMode: boolean;
  readonly rows: readonly FieldEditorRowViewModel[];
  readonly activeField: FieldEditorActiveFieldSummary | null;
  readonly previousFieldId: string | null;
  readonly nextFieldId: string | null;
  readonly collapsedSummary: FieldEditorCollapsedSummary;
  readonly availableTransforms: readonly FieldTransformId[];
}

export function fieldSupportsTrailNavigation(field: UrlField): boolean {
  return field.tokenKind === 'int' || field.tokenKind === 'hex';
}

export function createFieldEditorViewModel(state: PanelState, activeUrlFields: ActiveUrlFields): FieldEditorViewModel {
  const resettableFieldIds = resettableFieldIdsForFields(activeUrlFields.visibleFields, state, activeUrlFields.activeUrl);
  const rows = activeUrlFields.editableFields.map((editableField) =>
    createRowViewModel(editableField.field, editableField.value, state, resettableFieldIds),
  );
  const activeIndex = rows.findIndex((row) => row.field.id === state.activeFieldId);
  const activeRow = activeIndex === -1 ? null : (rows[activeIndex] ?? null);
  const navigation = fieldNavigation(rows, activeIndex);
  const hasFailure = rows.some((row) => row.status.failed);
  const failureVisible = rows.some((row) => row.status.failureVisible);
  const availableTransforms: FieldTransformId[] = [];
  if (parsedFieldStructureResetAvailable(state, activeUrlFields.activeUrl)) availableTransforms.push('reset-structure');
  if (parsedFieldResetAllAvailable(state, activeUrlFields.activeUrl)) availableTransforms.push('reset-all');

  return {
    editorUrl: activeUrlFields.activeUrl,
    privacyMode: state.privacyModeEnabled,
    rows,
    activeField: activeRow
      ? {
          id: activeRow.field.id,
          label: activeRow.field.label,
          value: activeRow.value,
          location: activeRow.field.location,
          tokenKind: activeRow.field.tokenKind,
          position: activeIndex + 1,
          count: rows.length,
          status: activeRow.status,
        }
      : null,
    previousFieldId: navigation.previousFieldId,
    nextFieldId: navigation.nextFieldId,
    collapsedSummary: {
      fieldCount: rows.length,
      activeFieldId: activeRow?.field.id ?? null,
      activeFieldLabel: activeRow?.field.label ?? null,
      activePosition: activeRow ? activeIndex + 1 : null,
      hasFailure,
      failureVisible,
    },
    availableTransforms,
  };
}

function createRowViewModel(
  field: UrlField,
  value: string,
  state: PanelState,
  resettableFieldIds: ReadonlySet<string>,
): FieldEditorRowViewModel {
  const successful = state.successfulFieldIds.includes(field.id);
  const included = state.unlockedFieldIds.includes(field.id);
  const failed = state.failedFieldId === field.id;
  const failureVisible = failed && state.loadFailureFeedback !== 'mute';
  const split =
    field.splitBaseId !== undefined && field.splitPartIndex !== undefined && field.splitPartCount !== undefined
      ? { baseFieldId: field.splitBaseId, position: field.splitPartIndex + 1, count: field.splitPartCount }
      : null;
  const status: FieldEditorStatusFlags = {
    active: state.activeFieldId === field.id,
    successful,
    included,
    unchanged: state.unchangedFieldIds.includes(field.id),
    failed,
    failureVisible,
  };
  const navigationEligible = fieldSupportsTrailNavigation(field);

  return {
    field,
    value,
    digitWidth: state.fieldDigitWidthSpecs.find((spec) => spec.fieldId === field.id)?.width ?? null,
    split,
    status,
    statusChips: statusChips(status, split),
    navigationEligible,
    navigable: included && navigationEligible,
    canToggleNavigationInclusion: (successful || included) && navigationEligible,
    availableTransforms: availableTransforms(field, value, resettableFieldIds.has(field.id)),
  };
}

function statusChips(status: FieldEditorStatusFlags, split: FieldEditorSplitSummary | null): readonly FieldEditorStatusChip[] {
  const chips: FieldEditorStatusChip[] = [];
  if (status.active) chips.push({ kind: 'active', label: 'active' });
  if (status.successful) chips.push({ kind: 'loads', label: 'loads' });
  if (status.included) chips.push({ kind: 'included', label: 'included' });
  if (split) chips.push({ kind: 'split', label: `split ${split.position}/${split.count}` });
  if (status.unchanged) chips.push({ kind: 'unchanged', label: 'unchanged' });
  if (status.failureVisible) chips.push({ kind: 'failed', label: 'failed load' });
  return chips;
}

function availableTransforms(field: UrlField, value: string, resettable: boolean): readonly FieldTransformId[] {
  const transforms: FieldTransformId[] = ['set-value'];
  if (field.tokenKind === 'int' || field.tokenKind === 'hex') transforms.push('step', 'digit-width');
  if (field.splitBaseId) transforms.push('split-clear');
  else if (value.length > 1) transforms.push('split-apply');
  if (resettable) transforms.push('reset-field');
  return transforms;
}

function fieldNavigation(
  rows: readonly FieldEditorRowViewModel[],
  activeIndex: number,
): { readonly previousFieldId: string | null; readonly nextFieldId: string | null } {
  if (rows.length === 0) return { previousFieldId: null, nextFieldId: null };
  if (activeIndex === -1) {
    return {
      previousFieldId: rows.at(-1)?.field.id ?? null,
      nextFieldId: rows[0]?.field.id ?? null,
    };
  }
  return {
    previousFieldId: rows[Math.max(0, activeIndex - 1)]?.field.id ?? null,
    nextFieldId: rows[Math.min(rows.length - 1, activeIndex + 1)]?.field.id ?? null,
  };
}
