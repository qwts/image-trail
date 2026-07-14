import type { PanelAction, PanelState } from '../../core/types.js';
import { panelHasError, panelIsWaiting } from '../components/panel-shell-view.js';
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
    </button>
  );
}

function statusSummary(state: PanelState): string {
  if (panelHasError(state)) return 'Needs attention';
  if (state.captureInProgress) return 'Capturing';
  if (state.importExportBusy) return 'Import/export';
  if (state.recall.busy) return 'Recall loading';
  if (panelIsWaiting(state)) return 'Working';
  if (state.status === 'picking') return 'Picking';
  return 'Ready';
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

function PanelHeaderContent({ state, callbacks }: { readonly state: PanelState; readonly callbacks: PanelHeaderCallbacks }) {
  const dashboardActive = !state.settingsOpen && !state.recall.open;
  const status = statusSummary(state);
  const statusClass = panelHasError(state) ? 'is-error' : panelIsWaiting(state) ? 'is-waiting' : 'is-ready';
  return (
    <>
      <div className="image-trail-panel__header-row">
        <h2
          className="image-trail-panel__title image-trail-ds__wordmark"
          onPointerDown={(event) => callbacks.onPanelDragStart?.(event.nativeEvent)}
        >
          Image Trail
        </h2>
        <span
          className={`image-trail-panel__header-state image-trail-panel__header-status ${statusClass}`}
          data-tone={panelHasError(state) ? 'error' : panelIsWaiting(state) ? 'busy' : 'ready'}
          title={state.privacyModeEnabled ? status : state.message.trim() || status}
        >
          {status}
        </span>
        <HeaderActions state={state} dispatch={callbacks.dispatch} />
      </div>
      <nav className="image-trail-panel__destination-dock" aria-label="Image Trail destinations">
        <DockButton label="Dashboard" glyph="▦" active={dashboardActive} />
        <DockButton label="Gallery" glyph="▧" active={false} onClick={() => callbacks.dispatch({ name: 'gallery/open' })} />
        <DockButton
          label="Recall"
          ariaLabel={state.recall.open ? 'Close Recall' : 'Open Recall'}
          glyph="⌕"
          active={state.recall.open}
          onClick={() =>
            callbacks.dispatch(state.recall.open ? { name: 'recall/close' } : { name: 'recall/open', side: state.recall.side })
          }
        />
        <DockButton
          label="Settings"
          ariaLabel={state.settingsOpen ? 'Hide settings' : 'Show settings'}
          glyph="⌘"
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
