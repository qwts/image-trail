import type { ChangeEvent } from 'react';

import { OBJECT_FIT_MODES, isObjectFitMode } from '../../core/preview-style.js';
import type { PanelAction, TargetState } from '../../core/types.js';
import { PRIVACY_URL_TEXT } from '../components/record-metadata.js';
import { renderReactSubtree } from './react-subtree.js';

let targetUtilityOpen: boolean | null = null;
let targetControlsOpen = false;

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

function TargetThumbnail({ target, privacyMode }: Pick<TargetPickerProps, 'target' | 'privacyMode'>) {
  const imageUrl = privacyMode || target.selectedUrl?.startsWith('data:') ? null : target.selectedUrl;
  return (
    <span className={`image-trail-panel__target-thumbnail${privacyMode ? ' is-privacy-masked' : ''}`} aria-hidden="true">
      {imageUrl ? <img src={imageUrl} alt="" onError={(event) => (event.currentTarget.hidden = true)} /> : null}
      <span>▧</span>
    </span>
  );
}

function TargetIdentity({ target, privacyMode }: Pick<TargetPickerProps, 'target' | 'privacyMode'>) {
  const url = targetUrl(target, privacyMode);
  const countLabel = `${target.candidateCount} on page`;
  return (
    <span className="image-trail-panel__target-identity">
      <span className={`image-trail-panel__target-url${privacyMode && target.selectedUrl ? ' is-privacy-masked' : ''}`} title={url}>
        {url}
      </span>
      <span className="image-trail-panel__target-badges">
        {target.selectedUrl ? (
          <span className="image-trail-ds__badge image-trail-panel__target-badge is-selected" data-tone="selected">
            Selected
          </span>
        ) : null}
        <span className="image-trail-ds__badge image-trail-panel__target-count" data-tone="count">
          {target.candidateCount === 1 ? 'single image' : countLabel}
        </span>
      </span>
    </span>
  );
}

function TargetButton({ target, dispatch }: Omit<TargetPickerProps, 'privacyMode'>) {
  const action = target.picking
    ? { name: 'stop-target-picker' as const }
    : target.selectedUrl
      ? { name: 'target/release' as const }
      : { name: 'start-target-picker' as const };
  const label = target.picking ? 'Cancel host pick' : target.selectedUrl ? 'Release host image' : 'Set host image';
  return (
    <button
      type="button"
      className="image-trail-ds__button"
      data-variant={target.picking ? 'danger' : target.selectedUrl ? 'default' : 'primary'}
      onClick={() => dispatch(action)}
    >
      {label}
    </button>
  );
}

function TargetControls({ target, dispatch }: Omit<TargetPickerProps, 'privacyMode'>) {
  const onFitChange = (event: ChangeEvent<HTMLSelectElement>) => {
    if (isObjectFitMode(event.target.value)) dispatch({ name: 'target/set-object-fit', mode: event.target.value });
  };
  return (
    <details
      className="image-trail-panel__target-controls"
      open={targetControlsOpen}
      onToggle={(event) => {
        targetControlsOpen = event.currentTarget.open;
      }}
    >
      <summary className="image-trail-panel__target-controls-summary" aria-label="Show target controls">
        <span aria-hidden="true">•••</span>
      </summary>
      <span className="image-trail-panel__actions image-trail-ds__target-actions">
        <TargetButton target={target} dispatch={dispatch} />
        {target.selectedUrl ? (
          <>
            <button
              type="button"
              className="image-trail-ds__button"
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
          </>
        ) : null}
      </span>
    </details>
  );
}

function TargetPickerContent({ target, dispatch, privacyMode }: TargetPickerProps) {
  return (
    <>
      <summary className="image-trail-panel__target-summary image-trail-ds__section-header">
        <h3 className="image-trail-ds__section-title">Host target</h3>
      </summary>
      <div className="image-trail-panel__target-card image-trail-ds__card">
        <TargetThumbnail target={target} privacyMode={privacyMode} />
        <TargetIdentity target={target} privacyMode={privacyMode} />
        <TargetControls target={target} dispatch={dispatch} />
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
