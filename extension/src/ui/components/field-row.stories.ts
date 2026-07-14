import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import type { FieldEditorRowViewModel } from '../field-editor-view-model.js';
import { panelStory } from '../stories/story-host.js';
import { createFieldRow, type FieldRowCallbacks } from './field-row.js';

const meta = {
  title: 'Design System/FieldRow',
  render: () => stateMatrix(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const StateMatrix: Story = {};

export const PrivacyMasked: Story = {
  render: () => singleRow(baseRow(), true),
};

export const Narrow: Story = {
  render: () => singleRow(rowWithState('active'), false, 300),
};

const valueSpy = fn();
const stepSpy = fn();
const activateSpy = fn();

export const KeyboardAndActions: Story = {
  render: () =>
    singleRow(baseRow(), false, undefined, {
      onValueChange: valueSpy,
      onStep: stepSpy,
      onActivate: activateSpy,
    }),
  play: async ({ canvasElement }) => {
    valueSpy.mockClear();
    stepSpy.mockClear();
    activateSpy.mockClear();
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Edit page');
    await userEvent.click(input);
    await expect(activateSpy).toHaveBeenCalledWith('query-page');
    await userEvent.clear(input);
    await userEvent.type(input, '18{Enter}');
    await expect(valueSpy).toHaveBeenCalledWith('query-page', '18');
    await expect(valueSpy).toHaveBeenCalledTimes(1);
    await userEvent.click(canvas.getByLabelText('Increment page'));
    await expect(stepSpy).toHaveBeenCalledWith('query-page', 1);
  },
};

export const KeyboardFocusOrder: Story = {
  render: () => singleRow(rowWithState('success'), false),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText('Edit page'));
    await userEvent.tab();
    await expect(canvas.getByLabelText('Show page as Dec')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByLabelText('Show page as Hex')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByLabelText('Digit width for page')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByLabelText('Decrement page')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByLabelText('Increment page')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByLabelText('Reset page')).toHaveFocus();
    await userEvent.tab();
    await expect(canvas.getByLabelText('Include page in Previous/Next')).toHaveFocus();
  },
};

function stateMatrix(): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__field-list';
  list.append(
    createFieldRow({ row: baseRow(), privacyMode: false }, callbacks()),
    createFieldRow({ row: rowWithState('active'), privacyMode: false }, callbacks()),
    createFieldRow({ row: rowWithState('success'), privacyMode: false }, callbacks()),
    createFieldRow({ row: rowWithState('unchanged'), privacyMode: false }, callbacks()),
    createFieldRow({ row: rowWithState('error'), privacyMode: false }, callbacks()),
  );
  return panelStory(list);
}

function singleRow(
  row: FieldEditorRowViewModel,
  privacyMode: boolean,
  width?: number,
  overrides: Partial<FieldRowCallbacks> = {},
): HTMLElement {
  const list = document.createElement('ul');
  list.className = 'image-trail-panel__field-list';
  list.append(createFieldRow({ row, privacyMode }, callbacks(overrides)));
  return panelStory(list, width === undefined ? {} : { width });
}

function baseRow(): FieldEditorRowViewModel {
  return {
    field: {
      id: 'query-page',
      location: 'query',
      label: 'page',
      value: '17',
      tokenKind: 'int',
      queryIndex: 0,
      tokenIndex: 0,
      digitWidth: 2,
    },
    value: '17',
    digitWidth: 2,
    split: null,
    status: {
      active: false,
      successful: false,
      included: false,
      unchanged: false,
      failed: false,
      failureVisible: false,
    },
    statusChips: [],
    navigationEligible: true,
    navigable: false,
    canToggleNavigationInclusion: true,
    availableTransforms: ['set-value', 'step', 'digit-width', 'split-apply', 'reset-field'],
  };
}

function rowWithState(state: 'active' | 'success' | 'unchanged' | 'error'): FieldEditorRowViewModel {
  const row = baseRow();
  const status = {
    ...row.status,
    active: state === 'active',
    successful: state === 'success',
    unchanged: state === 'unchanged',
    failed: state === 'error',
    failureVisible: state === 'error',
  };
  return {
    ...row,
    status,
    statusChips: [{ kind: state === 'success' ? 'loads' : state === 'error' ? 'failed' : state, label: state }],
  };
}

function callbacks(overrides: Partial<FieldRowCallbacks> = {}): FieldRowCallbacks {
  return {
    onValueChange: fn(),
    onInvalidValueCommit: fn(),
    onStep: fn(),
    onDigitWidthChange: fn(),
    onActivate: fn(),
    onToggleUnlock: fn(),
    onNumericDisplayModeChange: fn(),
    onApplySplit: fn(),
    onClearSplit: fn(),
    onResetField: fn(),
    ...overrides,
  };
}
