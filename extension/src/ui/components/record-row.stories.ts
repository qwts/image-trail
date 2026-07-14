import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { createButton } from './primitives.js';
import { createRecordRow, type RecordRowOptions } from './record-row.js';
import { panelStory } from '../stories/story-host.js';

const selectAction = fn();
const thumbnail = `data:image/svg+xml,${encodeURIComponent(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 160">
    <defs>
      <linearGradient id="sky" x2="1" y2="1">
        <stop stop-color="#a6e8ff" />
        <stop offset="1" stop-color="#173c58" />
      </linearGradient>
    </defs>
    <rect width="240" height="160" fill="url(#sky)" />
    <path d="M0 142 74 62l40 43 31-30 95 67" fill="#142b22" />
    <path d="M0 147 82 86l35 37 34-26 89 50" fill="#2c6a4c" />
  </svg>
`)}`;

const meta = {
  title: 'Design System/RecordRow',
  render: () => panelStory(recordList(baseStates())),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const SelectedAndStoredOriginal: Story = {
  render: () => panelStory(recordList([rowOptions({ state: 'selected', storedOriginal: true })])),
};

export const LockedAndKeyUnavailable: Story = {
  render: () =>
    panelStory(
      recordList([
        rowOptions({ state: 'locked-encrypted', name: 'Encrypted image', thumbnailFallback: 'LOCKED' }),
        rowOptions({ state: 'key-unavailable', name: 'Key unavailable', thumbnailFallback: 'LOCKED' }),
      ]),
    ),
};

export const PrivacyMasked: Story = {
  render: () =>
    panelStory(
      recordList([
        rowOptions({
          privacyMasked: true,
          thumbnailFallback: 'PRIVATE',
          source: 'PRIVATE',
          name: 'Private image',
          meta: 'Private metadata',
        }),
      ]),
    ),
};

export const MissingThumbnail: Story = {
  render: () => panelStory(recordList([rowOptions({ thumbnail: undefined, thumbnailFallback: 'WEBP' })])),
};

export const Narrow: Story = {
  render: () => panelStory(recordList([rowOptions({ state: 'selected', storedOriginal: true })]), { width: 280 }),
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector<HTMLElement>('.image-trail-panel-root');
    await expect(root?.scrollWidth).toBeLessThanOrEqual(root?.clientWidth ?? 0);
  },
};

export const KeyboardAndAction: Story = {
  render: () => panelStory(interactiveRow()),
  play: async ({ canvasElement }) => {
    selectAction.mockClear();
    const canvas = within(canvasElement);
    const row = canvas.getByRole('button', { name: 'Select record' });
    row.focus();
    await expect(row).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(selectAction).toHaveBeenCalledWith('select');
    await userEvent.click(canvas.getByRole('button', { name: 'Capture' }));
    await expect(selectAction).toHaveBeenCalledWith('capture');
  },
};

function baseStates(): readonly RecordRowOptions[] {
  return [
    rowOptions(),
    rowOptions({ state: 'selected', storedOriginal: true, name: 'Selected captured image' }),
    rowOptions({ thumbnail: undefined, thumbnailFallback: 'PNG', name: 'Missing thumbnail' }),
  ];
}

function rowOptions(overrides: Partial<RecordRowOptions> = {}): RecordRowOptions {
  return {
    thumbnail,
    thumbnailFallback: 'JPG',
    source: 'JPG',
    name: 'image-0042.jpg',
    meta: '1920 x 1280 / Queue',
    ...overrides,
  };
}

function recordList(rows: readonly RecordRowOptions[]): HTMLOListElement {
  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  list.append(...rows.map((options) => createRecordRow(options).root));
  return list;
}

function interactiveRow(): HTMLElement {
  const actions = document.createElement('span');
  actions.append(createButton({ label: 'Capture', variant: 'primary', onClick: () => selectAction('capture') }));
  const row = createRecordRow({ ...rowOptions(), actions });
  row.root.setAttribute('role', 'button');
  row.root.setAttribute('aria-label', 'Select record');
  row.root.tabIndex = 0;
  row.root.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') selectAction('select');
  });
  return recordListElement(row.root);
}

function recordListElement(row: HTMLLIElement): HTMLOListElement {
  const list = document.createElement('ol');
  list.className = 'image-trail-panel__record-list';
  list.append(row);
  return list;
}
