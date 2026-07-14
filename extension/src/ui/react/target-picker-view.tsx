import type { ChangeEvent } from 'react';

import { OBJECT_FIT_MODES, isObjectFitMode } from '../../core/preview-style.js';
import type { PanelAction, TargetState } from '../../core/types.js';
import { PRIVACY_URL_TEXT } from '../components/record-metadata.js';
import { renderReactSubtree } from './react-subtree.js';

let targetUtilityOpen: boolean | null = null;

interface TargetPickerProps {
  readonly target: TargetState;
  readonly dispatch: (action: PanelAction) => void;
  readonly privacyMode: boolean;
}

function targetUrl(target: TargetState, privacyMode: boolean): string {
  if (privacyMode && target.selectedUrl) return PRIVACY_URL_TEXT;
  if (target.selectedUrl?.startsWith('data:')) return 'data URL';
  return target.selectedUrl ?? 'No host image selected yet.';
}

function TargetButton({ target, dispatch }: Omit<TargetPickerProps, 'privacyMode'>) {
  if (target.picking) {
    return (
      <button
        type="button"
        className="image-trail-ds__button is-active"
        data-variant="danger"
        onClick={() => dispatch({ name: 'stop-target-picker' })}
      >
        Cancel host pick
      </button>
    );
  }
  if (target.selectedUrl) {
    return (
      <button type="button" className="image-trail-ds__button" data-variant="default" onClick={() => dispatch({ name: 'target/release' })}>
        Release host image
      </button>
    );
  }
  return (
    <button
      type="button"
      className="image-trail-ds__button"
      data-variant="primary"
      onClick={() => dispatch({ name: 'start-target-picker' })}
    >
      Set host image
    </button>
  );
}

function SelectedTargetActions({ target, dispatch }: Omit<TargetPickerProps, 'privacyMode'>) {
  if (!target.selectedUrl) return null;
  const onFitChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (isObjectFitMode(event.target.value)) dispatch({ name: 'target/set-object-fit', mode: event.target.value });
  };
  return (
    <>
      <button
        type="button"
        className="image-trail-ds__button"
        data-variant="default"
        aria-pressed={target.fillScreen}
        onClick={() => dispatch({ name: 'target/fill-screen', enabled: !target.fillScreen })}
      >
        {target.fillScreen ? 'Fit in page' : 'Fill screen'}
      </button>
      <label className="image-trail-panel__target-fit">
        <span>Fit</span>
        <select
          className="image-trail-ds__select image-trail-panel__target-fit-select"
          aria-label="Preview object fit"
          value={target.objectFit}
          onChange={onFitChange}
        >
          {OBJECT_FIT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
      {target.selectedDimensions ? (
        <span className="image-trail-ds__badge image-trail-panel__target-badge is-selected" data-tone="selected">
          {target.selectedDimensions}
        </span>
      ) : null}
    </>
  );
}

function TargetPickerContent({ target, dispatch, privacyMode }: TargetPickerProps) {
  const description = target.grabModeActive
    ? 'Grab Mode is active. Click page images to add them to the queue.'
    : target.selectedUrl
      ? 'Rows and URL edits project into this host image.'
      : `Choose which page image receives the current edited URL. ${target.candidateCount} candidate${target.candidateCount === 1 ? '' : 's'} detected.`;
  const url = targetUrl(target, privacyMode);
  return (
    <>
      <summary className="image-trail-panel__target-summary image-trail-ds__section-header">
        <h3 className="image-trail-ds__section-title">Host target</h3>
        <span className="image-trail-ds__badge image-trail-panel__target-count" data-tone="count">
          {target.candidateCount} candidate{target.candidateCount === 1 ? '' : 's'}
        </span>
      </summary>
      <div className="image-trail-panel__target-body">
        <p className="image-trail-panel__meta">{description}</p>
        <p
          className={`image-trail-panel__target-url${privacyMode && target.selectedUrl ? ' is-privacy-masked' : ''}`}
          title={privacyMode && target.selectedUrl ? 'Privacy mode is hiding this URL for screen sharing.' : (target.selectedUrl ?? url)}
        >
          {url}
        </p>
        <div className="image-trail-panel__actions image-trail-ds__target-actions">
          <TargetButton target={target} dispatch={dispatch} />
          <SelectedTargetActions target={target} dispatch={dispatch} />
        </div>
      </div>
    </>
  );
}

export function createTargetPickerView(
  target: TargetState,
  dispatch: (action: PanelAction) => void,
  options: { readonly privacyMode?: boolean } = {},
): HTMLElement {
  const targetNeedsAttention = target.picking || target.grabModeActive || target.mode !== 'auto' || target.candidateCount !== 1;
  const wrapper = document.createElement('details');
  wrapper.className = 'image-trail-panel__section image-trail-panel__target-utility image-trail-ds__target';
  wrapper.open = targetNeedsAttention || (targetUtilityOpen ?? true);
  wrapper.addEventListener('toggle', () => {
    if (targetNeedsAttention && !wrapper.open) wrapper.open = true;
    else targetUtilityOpen = wrapper.open;
  });
  return renderReactSubtree(
    wrapper,
    <TargetPickerContent target={target} dispatch={dispatch} privacyMode={options.privacyMode === true} />,
  );
}
