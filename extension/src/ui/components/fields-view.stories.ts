import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { createInitialPanelState } from '../../core/state.js';
import type { FieldTransformId } from '../../core/url/field-transforms.js';
import type { ActiveUrlFields } from '../active-url-fields.js';
import { createFieldEditorViewModel } from '../field-editor-view-model.js';
import type { EditableField, FieldsViewCallbacks, FieldsViewOptions } from './fields-view.js';
import { createFieldsView } from './fields-view.js';
import { parsedFieldDigitWidthSpecs, parsedFieldFixtures, splitParsedFieldFixtures } from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Field Editor',
  render: () => fieldsStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

export const Empty: Story = {
  render: () => fieldsStory({ fields: [] }),
};

export const ActiveField: Story = {
  render: () => fieldsStory({ activeFieldId: 'query-page' }),
};

export const ActiveNonNavigableField: Story = {
  render: () => fieldsStory({ activeFieldId: 'query-slug', successfulFieldIds: ['query-slug'] }),
};

export const IncludedNavigableAndNonNavigable: Story = {
  render: () =>
    fieldsStory({
      activeFieldId: 'query-color',
      successfulFieldIds: ['query-page', 'query-color', 'query-slug'],
      unchangedFieldIds: ['path-frame'],
      unlockedFieldIds: ['query-page', 'query-slug'],
    }),
};

export const FailedLoad: Story = {
  render: () =>
    fieldsStory({
      activeFieldId: 'query-page',
      failedFieldId: 'query-page',
      successfulFieldIds: ['query-color'],
      loadFailureFeedback: 'display',
    }),
};

export const SplitFields: Story = {
  render: () =>
    fieldsStory({
      fields: splitParsedFieldFixtures,
      activeFieldId: 'query-sequence-b',
      successfulFieldIds: ['query-sequence-a', 'query-sequence-b', 'query-sequence-c'],
      unlockedFieldIds: ['query-sequence-c'],
    }),
};

export const PrivacyMasked: Story = {
  render: () =>
    fieldsStory({
      activeFieldId: 'query-color',
      successfulFieldIds: ['query-page', 'query-color'],
      unlockedFieldIds: ['query-color'],
      privacyMode: true,
    }),
};

export const Collapsed: Story = {
  render: () => fieldsStory({ activeFieldId: 'query-page', options: { open: false } }),
};

export const Narrow: Story = {
  render: () =>
    fieldsStory(
      {
        activeFieldId: 'query-page',
        successfulFieldIds: ['query-page', 'query-color'],
        unlockedFieldIds: ['query-page'],
      },
      { width: 300 },
    ),
};

const valueChangeSpy = fn();
const stepSpy = fn();
const invalidValueSpy = fn();
const resetStructureSpy = fn();
const resetAllSpy = fn();

export const EditsField: Story = {
  render: () => fieldsStory({ callbacks: { onValueChange: valueChangeSpy, onStep: stepSpy } }),
  play: async ({ canvasElement }) => {
    valueChangeSpy.mockClear();
    stepSpy.mockClear();
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Edit page');
    await userEvent.clear(input);
    await userEvent.type(input, '18{Enter}');
    await expect(valueChangeSpy).toHaveBeenCalledWith('query-page', '18');
    await expect(valueChangeSpy).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByLabelText('Increment page'));
    await expect(stepSpy).toHaveBeenCalledWith('query-page', 1);
  },
};

export const CommitContractAndResetControls: Story = {
  render: () =>
    fieldsStory({
      callbacks: {
        onValueChange: valueChangeSpy,
        onInvalidValueCommit: invalidValueSpy,
        onResetStructure: resetStructureSpy,
        onResetAll: resetAllSpy,
      },
      availableTransforms: ['reset-structure', 'reset-all'],
    }),
  play: async ({ canvasElement }) => {
    invalidValueSpy.mockClear();
    valueChangeSpy.mockClear();
    resetStructureSpy.mockClear();
    resetAllSpy.mockClear();
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Edit page');
    await userEvent.clear(input);
    await userEvent.type(input, '{Enter}');
    await expect(valueChangeSpy).toHaveBeenCalledWith('query-page', '');
    await userEvent.type(input, '400/53{Enter}');
    await expect(valueChangeSpy).toHaveBeenCalledWith('query-page', '400/53');
    await userEvent.clear(input);
    await userEvent.type(input, 'invalid{Enter}');
    await expect(input).toHaveValue('17');
    await expect(invalidValueSpy).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByLabelText('Reset parsed field structure'));
    await expect(resetStructureSpy).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByLabelText('Reset all parsed fields'));
    await expect(resetAllSpy).toHaveBeenCalledTimes(1);
  },
};

export const AutoDigitWidthNarrow: Story = {
  render: () =>
    fieldsStory(
      {
        fields: splitParsedFieldFixtures,
        activeFieldId: 'query-sequence-a',
        successfulFieldIds: ['query-sequence-a'],
        unlockedFieldIds: ['query-sequence-a'],
      },
      { width: 300 },
    ),
};

function fieldsStory(
  overrides: {
    readonly fields?: readonly EditableField[];
    readonly activeFieldId?: string | null;
    readonly failedFieldId?: string | null;
    readonly successfulFieldIds?: readonly string[];
    readonly unchangedFieldIds?: readonly string[];
    readonly unlockedFieldIds?: readonly string[];
    readonly loadFailureFeedback?: 'alert' | 'display' | 'mute';
    readonly privacyMode?: boolean;
    readonly availableTransforms?: readonly FieldTransformId[];
    readonly options?: Partial<FieldsViewOptions>;
    readonly callbacks?: Partial<FieldsViewCallbacks>;
  } = {},
  storyOptions: { readonly width?: number } = {},
) {
  const callbacks = { ...mockFieldsCallbacks(), ...overrides.callbacks };
  const fields = overrides.fields ?? parsedFieldFixtures;
  const state = {
    ...createInitialPanelState(),
    activeFieldId: overrides.activeFieldId ?? null,
    failedFieldId: overrides.failedFieldId ?? null,
    successfulFieldIds: overrides.successfulFieldIds ?? ['query-page'],
    unchangedFieldIds: overrides.unchangedFieldIds ?? [],
    unlockedFieldIds: overrides.unlockedFieldIds ?? [],
    fieldDigitWidthSpecs: parsedFieldDigitWidthSpecs,
    privacyModeEnabled: overrides.privacyMode ?? false,
    loadFailureFeedback: overrides.loadFailureFeedback ?? 'mute',
  };
  const activeUrlFields: ActiveUrlFields = {
    activeUrl: 'https://images.example.test/gallery/frame-17.jpg?page=17&color=ff',
    fields: fields.map((field) => field.field),
    visibleFields: fields.map((field) => field.field),
    editableFields: fields,
    activeTemplate: null,
  };
  const derivedModel = createFieldEditorViewModel(state, activeUrlFields);
  const model = overrides.availableTransforms ? { ...derivedModel, availableTransforms: overrides.availableTransforms } : derivedModel;
  return panelStory(
    createFieldsView(model, callbacks, {
      open: true,
      blockSize: null,
      ...overrides.options,
    }),
    storyOptions,
  );
}

function mockFieldsCallbacks(): FieldsViewCallbacks {
  const dispatch = mockDispatch('fields story action');
  return {
    onValueChange: (fieldId, value) => dispatch({ type: 'value-change', fieldId, value }),
    onInvalidValueCommit: () => dispatch({ type: 'invalid-value-commit' }),
    onStep: (fieldId, delta) => dispatch({ type: 'step', fieldId, delta }),
    onDigitWidthChange: (fieldId, value) => dispatch({ type: 'digit-width-change', fieldId, value }),
    onActivate: (fieldId) => dispatch({ type: 'activate', fieldId }),
    onToggleUnlock: (fieldId) => dispatch({ type: 'toggle-unlock', fieldId }),
    onNumericDisplayModeChange: (fieldId, mode) => dispatch({ type: 'numeric-display-mode-change', fieldId, mode }),
    onApplySplit: (fieldId, pattern) => dispatch({ type: 'apply-split', fieldId, pattern }),
    onClearSplit: (baseFieldId) => dispatch({ type: 'clear-split', baseFieldId }),
    onResetField: (fieldId) => dispatch({ type: 'reset-field', fieldId }),
    onResetStructure: () => dispatch({ type: 'reset-structure' }),
    onResetAll: () => dispatch({ type: 'reset-all' }),
    onOpenChange: (open, blockSize) => dispatch({ type: 'open-change', open, blockSize }),
    onResize: (blockSize) => dispatch({ type: 'resize', blockSize }),
  };
}
