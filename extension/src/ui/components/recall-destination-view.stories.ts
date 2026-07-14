import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fireEvent, fn, userEvent } from 'storybook/test';

import { createRecallDestinationBody } from './recall-destination-view.js';
import { resetPreviewRowClickTracking } from './record-row-preview-click.js';
import { recallState } from '../stories/fixtures.js';
import { mockDispatch, panelStory } from '../stories/story-host.js';

const meta = {
  title: 'Extension UI/Recall destination',
  render: () => recallStory(),
} satisfies Meta;

export default meta;

type Story = StoryObj<typeof meta>;

export const Normal: Story = {};

export const Empty: Story = {
  render: () => recallStory({ candidates: [], total: 0, nextOffset: 0 }),
};

export const Loading: Story = {
  render: () => recallStory({ busy: true, candidates: [], total: 0, nextOffset: 0 }),
};

export const Error: Story = {
  render: () => recallStory({ message: 'Some Recall rows could not be decrypted.', messageIsError: true, failedCount: 2 }),
};

export const Selected: Story = {
  render: () => {
    const state = recallState();
    return recallStory({ selectedIds: [state.candidates[0]?.id ?? ''] });
  },
};

export const HasMore: Story = {
  render: () => recallStory({ hasMore: true, total: 18, nextOffset: 4 }),
};

export const Narrow: Story = {
  render: () => recallStory({}, undefined, 280),
};

const dispatchSpy = fn();

export const SelectsRow: Story = {
  render: () => recallStory({}, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    const row = canvasElement.querySelector('[data-image-trail-row-id="recall-queue-captured"]');
    if (!(row instanceof HTMLElement)) throw new Error('expected the recall-queue-captured row to render');
    await userEvent.click(row);
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'recall-selection/select', ids: ['recall-queue-captured'] });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
    dispatchSpy.mockClear();
    await fireEvent.click(row, { ctrlKey: true });
    await expect(dispatchSpy).toHaveBeenCalledWith({ name: 'recall-selection/toggle', id: 'recall-queue-captured' });
    await expect(dispatchSpy).toHaveBeenCalledTimes(1);
  },
};

export const PreviewsSelectedRow: Story = {
  render: () => recallStory({ selectedIds: ['recall-queue-captured'] }, dispatchSpy),
  play: async ({ canvasElement }) => {
    dispatchSpy.mockClear();
    resetPreviewRowClickTracking();
    const row = canvasElement.querySelector('[data-image-trail-row-id="recall-queue-captured"]');
    if (!(row instanceof HTMLElement)) throw new Error('expected the recall-queue-captured row to render');
    // Preview requires a real double-click (#426): the first click re-selects, the second previews.
    await userEvent.dblClick(row);
    await expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'recall-selection/select' }));
    await expect(dispatchSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'capture/preview' }));
    await expect(dispatchSpy).toHaveBeenCalledTimes(2);
  },
};

function recallStory(stateOverrides = {}, dispatch: Parameters<typeof createRecallDestinationBody>[1] = mockDispatch(), width = 420) {
  const body = createRecallDestinationBody(recallState(stateOverrides), dispatch);
  body.classList.add('image-trail-panel__destination-body');
  return panelStory(body, { width });
}
