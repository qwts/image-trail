import type { PanelAction, PanelState } from '../../core/types.js';
import { renderReactSubtree } from './react-subtree.js';

interface PanelHeaderCallbacks {
  readonly dispatch: (action: PanelAction) => void;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
}

interface DockButtonProps {
  readonly label: string;
  readonly ariaLabel?: string;
  readonly glyph: string;
  readonly active: boolean;
  readonly onClick?: () => void;
}

function DockButton({ label, ariaLabel, glyph, active, onClick }: DockButtonProps) {
  return (
    <button
      type="button"
      className="image-trail-panel__dock-button"
      aria-label={ariaLabel ?? label}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="image-trail-panel__dock-glyph" aria-hidden="true">
        {glyph}
      </span>
      <span>{label}</span>
      <i className="image-trail-panel__dock-indicator" aria-hidden="true" />
    </button>
  );
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
  const dashboardActive = !state.settingsOpen && !state.helpOpen && !state.recall.open;
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
          className="image-trail-panel__header-state image-trail-panel__header-status image-trail-panel__status-announcer"
          role="status"
          data-tone={status.tone}
          title={state.privacyModeEnabled ? 'Image Trail status updated.' : state.message}
        >
          {status.label}
        </span>
      </div>
      <nav className="image-trail-panel__destination-dock" aria-label="Image Trail destinations">
        <DockButton label="Dashboard" glyph="◱" active={dashboardActive} />
        <DockButton label="Gallery" glyph="▦" active={false} onClick={() => callbacks.dispatch({ name: 'gallery/open' })} />
        <DockButton
          label="Recall"
          ariaLabel={state.recall.open ? 'Close Recall' : 'Open Recall'}
          glyph="⟲"
          active={state.recall.open}
          onClick={() =>
            callbacks.dispatch(state.recall.open ? { name: 'recall/close' } : { name: 'recall/open', side: state.recall.side })
          }
        />
        <DockButton
          label="Settings"
          ariaLabel={state.settingsOpen ? 'Hide settings' : 'Show settings'}
          glyph="⚙"
          active={state.settingsOpen}
          onClick={() => callbacks.dispatch({ name: 'settings/toggle' })}
        />
      </nav>
    </>
  );
}

export function createPanelHeader(state: PanelState, callbacks: PanelHeaderCallbacks): HTMLElement {
  const header = document.createElement('header');
  header.className = 'image-trail-panel__header image-trail-ds__panel-header';
  return renderReactSubtree(header, <PanelHeaderContent state={state} callbacks={callbacks} />);
}
