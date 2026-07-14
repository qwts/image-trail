import type { MouseEvent } from 'react';

import type { PanelAction, PanelDestinationId, PanelState } from '../../core/types.js';
import { availablePanelDestinations, type PanelDestinationDefinition } from '../destination-registry.js';

interface DestinationDockProps {
  readonly state: PanelState;
  readonly dispatch: (action: PanelAction) => void;
}

function accessibleLabel(destination: PanelDestinationDefinition, active: boolean): string | undefined {
  if (destination.id === 'settings') return active ? 'Hide settings' : 'Show settings';
  if (destination.id === 'recall') return active ? 'Close Recall' : 'Open Recall';
  return undefined;
}

function destinationTitle(destination: PanelDestinationDefinition): string {
  return destination.openInTabAction
    ? `${destination.label} · click for the panel view · modifier-click opens the full Gallery tab`
    : `${destination.label} · click for the panel view`;
}

function activateDestination(
  event: MouseEvent<HTMLButtonElement>,
  destination: PanelDestinationDefinition,
  dispatch: (action: PanelAction) => void,
): void {
  const openInTab = event.metaKey || event.ctrlKey || event.shiftKey;
  if (openInTab && destination.openInTabAction) {
    dispatch(destination.openInTabAction());
    return;
  }
  dispatch(destination.activationAction());
}

function DockButton({
  destination,
  active,
  dispatch,
}: {
  readonly destination: PanelDestinationDefinition;
  readonly active: boolean;
  readonly dispatch: (action: PanelAction) => void;
}) {
  const descriptionId = `image-trail-destination-${destination.id}-description`;
  return (
    <button
      type="button"
      className="image-trail-panel__dock-button"
      data-image-trail-destination={destination.id}
      aria-label={accessibleLabel(destination, active)}
      aria-describedby={descriptionId}
      aria-pressed={active}
      title={destinationTitle(destination)}
      onClick={(event) => activateDestination(event, destination, dispatch)}
    >
      <span className="image-trail-panel__dock-glyph" aria-hidden="true">
        {destination.glyph}
      </span>
      <span>{destination.label}</span>
      <span id={descriptionId} className="image-trail-panel__sr-only">
        {destination.description}
      </span>
      <i className="image-trail-panel__dock-indicator" aria-hidden="true" />
    </button>
  );
}

export function DestinationDock({ state, dispatch }: DestinationDockProps) {
  return (
    <nav className="image-trail-panel__destination-dock" aria-label="Image Trail destinations">
      {availablePanelDestinations(state).map((destination) => (
        <DockButton
          key={destination.id}
          destination={destination}
          active={state.activeDestination === destination.id}
          dispatch={dispatch}
        />
      ))}
    </nav>
  );
}

export function destinationDockSelector(destination: PanelDestinationId): string {
  return `[data-image-trail-destination="${destination}"]`;
}
