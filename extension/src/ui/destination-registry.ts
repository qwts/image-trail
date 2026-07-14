import type { PanelAction, PanelDestinationId, PanelState } from '../core/types.js';

export interface PanelDestinationDefinition {
  readonly id: PanelDestinationId;
  readonly label: string;
  readonly glyph: string;
  readonly description: string;
  readonly available: (state: PanelState) => boolean;
  readonly activationAction: () => PanelAction;
  readonly openInTabAction?: (() => PanelAction) | undefined;
}

const alwaysAvailable = (): boolean => true;

export const PANEL_DESTINATIONS: readonly PanelDestinationDefinition[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    glyph: '◱',
    description: 'Current target, trail status, durable queue totals, and safe navigation actions.',
    available: alwaysAvailable,
    activationAction: () => ({ name: 'destination/select', destination: 'dashboard' }),
  },
  {
    id: 'gallery',
    label: 'Gallery',
    glyph: '▦',
    description: 'Compact view of durable pins and captured originals.',
    available: alwaysAvailable,
    activationAction: () => ({ name: 'destination/select', destination: 'gallery' }),
    openInTabAction: () => ({ name: 'gallery/open' }),
  },
  {
    id: 'recall',
    label: 'Recall',
    glyph: '⟲',
    description: 'Browse offscreen durable queue records and move selected records to the front.',
    available: alwaysAvailable,
    activationAction: () => ({ name: 'destination/select', destination: 'recall' }),
  },
  {
    id: 'settings',
    label: 'Settings',
    glyph: '⚙',
    description: 'Display, privacy, automation, utility, and system settings.',
    available: alwaysAvailable,
    activationAction: () => ({ name: 'destination/select', destination: 'settings' }),
  },
];

export function isPanelDestinationId(value: string | undefined): value is PanelDestinationId {
  return PANEL_DESTINATIONS.some((destination) => destination.id === value);
}

export function panelDestination(id: PanelDestinationId): PanelDestinationDefinition {
  const destination = PANEL_DESTINATIONS.find((candidate) => candidate.id === id);
  if (!destination) throw new Error(`Unknown panel destination: ${id}`);
  return destination;
}

export function availablePanelDestinations(state: PanelState): readonly PanelDestinationDefinition[] {
  return PANEL_DESTINATIONS.filter((destination) => destination.available(state));
}
