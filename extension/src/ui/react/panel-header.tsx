import type { PanelAction, PanelState } from '../../core/types.js';
import { DestinationDock } from './destination-dock.js';
import { renderReactSubtree } from './react-subtree.js';

interface PanelHeaderCallbacks {
  readonly dispatch: (action: PanelAction) => void;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
}

function HeaderActions({ state, dispatch }: { readonly state: PanelState; readonly dispatch: (action: PanelAction) => void }) {
  const action = (label: string, glyph: string, onClick: () => void, pressed?: boolean) => (
    <button
      type="button"
      className="image-trail-ds__icon-button image-trail-panel__icon-button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
    >
      {glyph}
    </button>
  );
  return (
    <div className="image-trail-panel__header-actions image-trail-ds__panel-header-actions">
      {state.blobKeyAvailable && state.blobKeyUnlocked ? action('Lock workspace', 'Lock', () => dispatch({ name: 'blob-key/lock' })) : null}
      {action(state.helpOpen ? 'Hide help' : 'Show help', '?', () => dispatch({ name: 'help/toggle' }), state.helpOpen)}
      {action('Minimize panel', '−', () => dispatch({ name: 'panel/minimize' }))}
      {action('Close panel', '×', () => dispatch({ name: 'close-panel' }))}
    </div>
  );
}

function statusLabel(state: PanelState): { readonly label: string; readonly tone: 'ready' | 'busy' | 'error' } {
  if (state.status === 'error') return { label: 'Needs attention', tone: 'error' };
  if (state.status === 'picking') return { label: 'Working', tone: 'busy' };
  return { label: 'Ready', tone: 'ready' };
}

function PanelHeaderContent({ state, callbacks }: { readonly state: PanelState; readonly callbacks: PanelHeaderCallbacks }) {
  const status = statusLabel(state);
  return (
    <>
      <div className="image-trail-panel__header-row">
        <h2
          className="image-trail-panel__title image-trail-ds__wordmark"
          onPointerDown={(event) => callbacks.onPanelDragStart?.(event.nativeEvent)}
        >
          Image Trail
        </h2>
        <HeaderActions state={state} dispatch={callbacks.dispatch} />
        <span
          className={`image-trail-panel__header-state image-trail-panel__header-status image-trail-panel__status-announcer ${
            status.tone === 'error' ? 'is-error' : status.tone === 'busy' ? 'is-waiting' : 'is-ready'
          }`}
          role="status"
          data-tone={status.tone}
          title={state.privacyModeEnabled ? 'Image Trail status updated.' : state.message}
        >
          {status.label}
        </span>
      </div>
      <DestinationDock state={state} dispatch={callbacks.dispatch} />
    </>
  );
}

export function createPanelHeader(state: PanelState, callbacks: PanelHeaderCallbacks): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-panel__header image-trail-ds__panel-header';
  return renderReactSubtree(header, <PanelHeaderContent state={state} callbacks={callbacks} />);
}
