import type { Meta, StoryObj } from '@storybook/html-vite';

import type { FieldsViewCallbacks, FieldsViewOptions } from './fields-view.js';
import { createFieldsView } from './fields-view.js';
import { parsedFieldDigitWidthSpecs, parsedFieldFixtures, splitParsedFieldFixtures } from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Parsed fields',
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

export const IncludedAndExcluded: Story = {
  render: () =>
    fieldsStory({
      activeFieldId: 'query-color',
      successfulFieldIds: ['query-page', 'query-color'],
      unchangedFieldIds: ['path-frame'],
      unlockedFieldIds: ['query-page'],
    }),
};

export const FailedLoad: Story = {
  render: () =>
    fieldsStory({
      activeFieldId: 'query-page',
      failedFieldId: 'query-page',
      successfulFieldIds: ['query-color'],
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
      options: { privacyMode: true },
    }),
};

export const Collapsed: Story = {
  render: () => fieldsStory({ options: { open: false } }),
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
    readonly fields?: Parameters<typeof createFieldsView>[0];
    readonly activeFieldId?: string | null;
    readonly failedFieldId?: string | null;
    readonly successfulFieldIds?: readonly string[];
    readonly unchangedFieldIds?: readonly string[];
    readonly unlockedFieldIds?: readonly string[];
    readonly options?: Partial<FieldsViewOptions>;
  } = {},
  storyOptions: { readonly width?: number } = {},
) {
  const callbacks = mockFieldsCallbacks();
  return panelStory(
    createFieldsView(
      overrides.fields ?? parsedFieldFixtures,
      overrides.activeFieldId ?? null,
      overrides.failedFieldId ?? null,
      overrides.successfulFieldIds ?? ['query-page'],
      overrides.unchangedFieldIds ?? [],
      overrides.unlockedFieldIds ?? [],
      parsedFieldDigitWidthSpecs,
      callbacks,
      {
        open: true,
        blockSize: null,
        ...overrides.options,
      },
    ),
    storyOptions,
  );
}

function mockFieldsCallbacks(): FieldsViewCallbacks {
  const dispatch = mockDispatch('fields story action');
  return {
    onValueChange: (fieldId, value) => dispatch({ type: 'value-change', fieldId, value }),
    onStep: (fieldId, delta) => dispatch({ type: 'step', fieldId, delta }),
    onDigitWidthChange: (fieldId, value) => dispatch({ type: 'digit-width-change', fieldId, value }),
    onActivate: (fieldId) => dispatch({ type: 'activate', fieldId }),
    onToggleUnlock: (fieldId) => dispatch({ type: 'toggle-unlock', fieldId }),
    onApplySplit: (fieldId, pattern) => dispatch({ type: 'apply-split', fieldId, pattern }),
    onClearSplit: (baseFieldId) => dispatch({ type: 'clear-split', baseFieldId }),
    onOpenChange: (open, blockSize) => dispatch({ type: 'open-change', open, blockSize }),
    onResize: (blockSize) => dispatch({ type: 'resize', blockSize }),
  };
}
