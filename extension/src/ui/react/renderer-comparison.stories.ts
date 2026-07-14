import type { Meta, StoryObj } from '@storybook/html-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { createInitialPanelState } from '../../core/state.js';
import type { PanelAction, PanelState } from '../../core/types.js';
import { createDomPanelHeader } from '../components/panel-shell-view.js';
import { createDomTargetPickerView } from '../components/target-picker-view.js';
import { createPanelHeader } from './panel-header.js';
import { createTargetPickerView } from './target-picker-view.js';

const reactDispatch = fn<(action: PanelAction) => void>();

const meta = {
  title: 'Architecture/Renderer comparison',
  render: () => comparisonStory(),
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SideBySide: Story = {};

export const ReactProductionSlice: Story = {
  render: () => rendererPanel('React production slice', 'react', reactDispatch),
  play: async ({ canvasElement }) => {
    reactDispatch.mockClear();
    const canvas = within(canvasElement);
    const gallery = canvasElement.querySelector<HTMLButtonElement>('[data-image-trail-destination="gallery"]');
    await expect(gallery).not.toBeNull();
    await expect(gallery).toHaveTextContent('Gallery');
    await userEvent.click(gallery!);
    await expect(reactDispatch).toHaveBeenCalledWith({ name: 'destination/select', destination: 'gallery' });

    const targetControls = canvasElement.querySelector<HTMLElement>('.image-trail-panel__target-controls-summary');
    await expect(targetControls).not.toBeNull();
    await userEvent.click(targetControls!);
    const release = canvas.getByRole('button', { name: 'Release host image' });
    release.focus();
    await expect(release).toHaveFocus();
    await userEvent.click(release);
    await expect(reactDispatch).toHaveBeenCalledWith({ name: 'target/release' });
  },
};

export const PlainDomReference: Story = {
  render: () => rendererPanel('Corrected plain DOM reference', 'dom', () => undefined),
};

function comparisonStory(): HTMLElement {
  const layout = document.createElement('main');
  layout.style.display = 'flex';
  layout.style.flexWrap = 'wrap';
  layout.style.gap = '20px';
  layout.style.padding = '16px';
  layout.append(
    rendererPanel('Corrected plain DOM reference', 'dom', () => undefined),
    rendererPanel('React production slice', 'react', () => undefined),
  );
  return layout;
}

function rendererPanel(label: string, renderer: 'dom' | 'react', dispatch: (action: PanelAction) => void): HTMLElement {
  const frame = document.createElement('section');
  const heading = document.createElement('h1');
  heading.textContent = label;
  heading.style.color = '#ddd';
  heading.style.font = '600 12px system-ui';

  const panel = document.createElement('div');
  panel.className = 'image-trail-panel-root image-trail-panel';
  panel.style.position = 'relative';
  panel.style.inset = 'auto';
  panel.style.width = '420px';
  panel.style.inlineSize = '420px';
  const state = comparisonState();
  const header = renderer === 'react' ? createPanelHeader(state, { dispatch }) : createDomPanelHeader(state, { dispatch });
  const target = renderer === 'react' ? createTargetPickerView(state.target, dispatch) : createDomTargetPickerView(state.target, dispatch);
  if (target instanceof HTMLDetailsElement) target.open = true;
  panel.append(header, target);
  frame.append(heading, panel);
  return frame;
}

function comparisonState(): PanelState {
  const initial = createInitialPanelState(Date.parse('2026-07-14T12:00:00.000Z'));
  return {
    ...initial,
    visible: true,
    status: 'ready',
    target: {
      ...initial.target,
      mode: 'auto',
      candidateCount: 1,
      selectedUrl: 'https://images.example.test/gallery/2028-03-14/img-842.jpg',
      selectedHandleId: 'target-current',
      selectedDimensions: '1280 × 854',
      fillScreen: false,
    },
  };
}
