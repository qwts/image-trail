import type { PanelPosition } from '../core/types.js';

export interface PanelSize {
  readonly width: number;
  readonly height: number;
}

export function clampPanelPosition(position: PanelPosition, panelSize: PanelSize, viewportSize: PanelSize, padding = 12): PanelPosition {
  const width = Math.max(0, panelSize.width);
  const height = Math.max(0, panelSize.height);
  const viewportWidth = Math.max(0, viewportSize.width);
  const viewportHeight = Math.max(0, viewportSize.height);
  const minLeft = Math.min(padding, Math.max(0, viewportWidth - width));
  const minTop = Math.min(padding, Math.max(0, viewportHeight - height));
  const maxLeft = Math.max(minLeft, viewportWidth - width - padding);
  const maxTop = Math.max(minTop, viewportHeight - height - padding);

  return {
    left: clampNumber(position.left, minLeft, maxLeft),
    top: clampNumber(position.top, minTop, maxTop),
  };
}

export function hostnameFromLocation(location: Location = window.location): string | null {
  return location.hostname.trim() || null;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
