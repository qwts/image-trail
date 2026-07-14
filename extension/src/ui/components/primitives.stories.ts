import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import {
  createBadge,
  createButton,
  createCard,
  createIconButton,
  createInput,
  createKbd,
  createSectionHeader,
  createSelect,
  createStatusPill,
  createToast,
  createToggle,
} from './primitives.js';
import { panelStory } from '../stories/story-host.js';

const buttonAction = fn();
const inputAction = fn();
const selectAction = fn();
const toggleAction = fn();
const sectionAction = fn();

const meta = {
  title: 'Design System/Core primitives',
  render: () => panelStory(showcase()),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const Overview: Story = {};

export const InteractionStates: Story = {
  render: () => panelStory(interactiveShowcase()),
  play: async ({ canvasElement }) => {
    buttonAction.mockClear();
    inputAction.mockClear();
    selectAction.mockClear();
    toggleAction.mockClear();
    sectionAction.mockClear();
    const canvas = within(canvasElement);

    const actionButton = canvas.getByRole('button', { name: 'Run action' });
    actionButton.focus();
    await expect(actionButton).toHaveFocus();
    await userEvent.click(actionButton);
    await expect(buttonAction).toHaveBeenCalledTimes(1);

    const input = canvas.getByRole('textbox', { name: 'Trail URL' });
    await userEvent.clear(input);
    await userEvent.type(input, 'https://images.example.test/new.jpg');
    await expect(inputAction).toHaveBeenCalled();

    await userEvent.selectOptions(canvas.getByRole('combobox', { name: 'Fit mode' }), 'contain');
    await expect(selectAction).toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('checkbox', { name: 'Privacy mode' }));
    await expect(toggleAction).toHaveBeenCalled();

    await userEvent.click(canvas.getByRole('button', { name: 'Show' }));
    await expect(sectionAction).toHaveBeenCalledTimes(1);
  },
};

export const DisabledAndWaiting: Story = {
  render: () => panelStory(disabledAndWaitingStory()),
};

export const FeedbackAndLayout: Story = {
  render: () => panelStory(feedbackStory()),
};

export const Narrow: Story = {
  render: () => panelStory(showcase(), { width: 280 }),
};

export const ReducedMotion: Story = {
  render: () => {
    const story = panelStory(disabledAndWaitingStory());
    story.dataset['reducedMotionPreview'] = 'true';
    return story;
  },
};

function showcase(): HTMLElement {
  const root = storyStack();
  root.append(
    createSectionHeader({ title: 'Core controls', divider: false }),
    cluster([
      createButton({ label: 'Default' }),
      createButton({ label: 'Capture', variant: 'primary' }),
      createButton({ label: 'Secondary', variant: 'secondary' }),
      createButton({ label: 'Reset', variant: 'ghost' }),
      createButton({ label: 'Delete', variant: 'danger' }),
      createIconButton({ glyph: '⚙', label: 'Settings' }),
      createIconButton({ glyph: '?', label: 'Help', pressed: true }),
    ]),
    createSectionHeader({ title: 'Forms' }),
    createInput({ ariaLabel: 'Image URL', type: 'url', value: 'https://images.example.test/gallery/0042.jpg' }),
    createInput({ ariaLabel: 'Private URL', privacyMasked: true }),
    createInput({ ariaLabel: 'Notes', multiline: true, value: 'Trail notes' }),
    createSelect({
      ariaLabel: 'Image fit',
      value: 'cover',
      items: [
        { value: 'contain', label: 'Contain' },
        { value: 'cover', label: 'Cover' },
      ],
    }),
    createToggle({ label: 'Include field in Trail', checked: true }),
    createSectionHeader({ title: 'Feedback' }),
    cluster([
      createBadge({ label: 'Selected', tone: 'selected' }),
      createBadge({ label: 'Encrypted', tone: 'encryption', uppercase: true }),
      createStatusPill({ label: 'Ready' }),
      createStatusPill({ label: 'Connected', tone: 'connected' }),
      createKbd('⌘ C'),
    ]),
    createToast({ message: 'Captured original successfully.', tone: 'success' }),
    createCard({ children: 'Grouped metadata uses the shared Card surface.', ariaLabel: 'Metadata card' }),
  );
  return root;
}

function interactiveShowcase(): HTMLElement {
  const root = storyStack();
  root.append(
    createSectionHeader({ title: 'Interactive contract', divider: false, collapsible: true, onToggle: sectionAction }),
    createButton({ label: 'Run action', variant: 'primary', onClick: buttonAction }),
    createInput({
      ariaLabel: 'Trail URL',
      type: 'url',
      value: 'https://images.example.test/current.jpg',
      onInput: inputAction,
    }),
    createSelect({
      ariaLabel: 'Fit mode',
      value: 'cover',
      items: [
        { value: 'cover', label: 'Cover' },
        { value: 'contain', label: 'Contain' },
      ],
      onChange: selectAction,
    }),
    createToggle({ label: 'Privacy mode', onChange: toggleAction }),
  );
  return root;
}

function disabledAndWaitingStory(): HTMLElement {
  const root = storyStack();
  root.append(
    createSectionHeader({ title: 'Async and unavailable states', divider: false }),
    cluster([
      createButton({ label: 'Running', waiting: true }),
      createButton({ label: 'Disabled', disabled: true }),
      createButton({ label: 'Active', pressed: true }),
      createIconButton({ glyph: '✕', label: 'Close', disabled: true }),
      createStatusPill({ label: 'Loading', waiting: true }),
    ]),
    createInput({ ariaLabel: 'Invalid value', value: 'bad value', invalid: true }),
    createSelect({ ariaLabel: 'Unavailable option', disabled: true, items: [{ value: 'none', label: 'Unavailable' }] }),
    createToggle({ label: 'Unavailable toggle', disabled: true }),
  );
  return root;
}

function feedbackStory(): HTMLElement {
  const root = storyStack();
  root.append(
    createSectionHeader({ title: 'Semantic feedback', divider: false, detachable: true }),
    cluster([
      createBadge({ label: 'Saved', tone: 'success' }),
      createBadge({ label: 'Warning', tone: 'warning' }),
      createBadge({ label: 'Failed', tone: 'error' }),
      createStatusPill({ label: 'Busy', tone: 'busy' }),
      createStatusPill({ label: 'Error', tone: 'error' }),
    ]),
    createToast({ message: 'Original capture completed.', tone: 'success' }),
    createToast({ message: 'Storage is nearly full.', tone: 'warning' }),
    createToast({ message: 'Capture failed.', tone: 'error' }),
    createToast({ privacyMasked: true, tone: 'error' }),
    createCard({ tone: 'encryption', children: 'Encrypted original storage is ready.' }),
    createCard({ tone: 'danger', children: 'Destructive actions remain visually separated.' }),
  );
  return root;
}

function storyStack(): HTMLDivElement {
  const root = document.createElement('div');
  root.style.display = 'grid';
  root.style.gap = '12px';
  return root;
}

function cluster(children: readonly HTMLElement[]): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.style.display = 'flex';
  wrapper.style.flexWrap = 'wrap';
  wrapper.style.gap = '8px';
  wrapper.append(...children);
  return wrapper;
}
