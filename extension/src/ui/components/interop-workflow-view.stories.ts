import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { createInteropWorkflowView } from './interop-workflow-view.js';
import { blockedInteropWorkflow, type InteropVisibleWorkflow } from '../interop/visible-workflow.js';

const onClose = fn();
const onPause = fn();
const onConflict = fn();

const meta = {
  title: 'Extension UI/Transfer and Sync',
  render: () => createInteropWorkflowView(reviewState(), handlers()),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Review: Story = {};

export const ConflictReview: Story = {
  render: () => createInteropWorkflowView(conflictState(), handlers()),
  play: async ({ canvasElement }) => {
    onConflict.mockClear();
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText('Apply to all conflicts'));
    await userEvent.click(canvas.getByRole('button', { name: 'Keep both' }));
    await expect(onConflict).toHaveBeenCalledWith('interop-conflict-1', 'keep-both', true);
  },
};

export const Transferring: Story = {
  render: () => createInteropWorkflowView(progressState('transferring'), handlers()),
  play: async ({ canvasElement }) => {
    onPause.mockClear();
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Pause' }));
    await expect(onPause).toHaveBeenCalledTimes(1);
  },
};

export const Paused: Story = { render: () => createInteropWorkflowView(progressState('paused'), handlers()) };
export const AwaitingAcknowledgement: Story = {
  render: () => createInteropWorkflowView(progressState('awaiting-acknowledgement'), handlers()),
};
export const PartialFailure: Story = {
  render: () =>
    createInteropWorkflowView(
      {
        ...progressState('failed'),
        error: { code: 'partial-failure', message: '7 completed; 1 remains resumable.', retryable: true },
      },
      handlers(),
    ),
};
export const Completed: Story = { render: () => createInteropWorkflowView(progressState('completed'), handlers()) };
export const ProviderDisconnected: Story = {
  render: () => createInteropWorkflowView(blockedInteropWorkflow('settings', 12), handlers()),
};
export const Locked: Story = {
  render: () => createInteropWorkflowView(blockedInteropWorkflow('captured-original', 1, true), handlers()),
};
export const Narrow: Story = {
  render: () => {
    const host = document.createElement('div');
    host.style.width = '300px';
    host.append(createInteropWorkflowView(conflictState(), handlers()));
    return host;
  },
};

function handlers() {
  return { onClose, onPause, onResume: fn(), onCancel: fn(), onStart: fn(), onReconnect: fn(), onConflict };
}

function reviewState(): InteropVisibleWorkflow {
  return {
    ...blockedInteropWorkflow('selection', 12),
    operation: 'move',
    provider: { id: 'google-drive', label: 'Google Drive', state: 'connected', detail: 'Encrypted interop namespace · quota verified' },
    pairing: 'paired',
    phase: 'reviewing',
    counts: {
      total: 12,
      eligible: 7,
      duplicate: 1,
      conflict: 1,
      metadataOnly: 1,
      unsupported: 1,
      skipped: 1,
      failed: 0,
      acknowledged: 0,
      finalized: 0,
    },
    error: null,
  };
}

function conflictState(): InteropVisibleWorkflow {
  return {
    ...reviewState(),
    conflicts: [{ interopId: 'interop-conflict-1', label: 'alpine-lake.raw', fields: ['title', 'albums'] }],
  };
}

function progressState(phase: InteropVisibleWorkflow['phase']): InteropVisibleWorkflow {
  return {
    ...reviewState(),
    phase,
    processed: phase === 'completed' ? 12 : 7,
    counts: { ...reviewState().counts, acknowledged: phase === 'completed' ? 12 : 7, finalized: phase === 'completed' ? 12 : 6 },
  };
}
