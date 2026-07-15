import type { PanelPosition } from '../core/types.js';

export interface PanelSize {
  readonly width: number;
  readonly height: number;
}

export interface PanelInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export function clampPanelPosition(position: PanelPosition, panelSize: PanelSize, viewportSize: PanelSize, padding = 12): PanelPosition {
  return clampPanelPositionWithinInsets(position, panelSize, viewportSize, {
    left: padding,
    right: padding,
    top: padding,
    bottom: padding,
  });
}

export function clampPanelPositionWithinInsets(
  position: PanelPosition,
  panelSize: PanelSize,
  viewportSize: PanelSize,
  insets: PanelInsets,
): PanelPosition {
  const width = Math.max(0, panelSize.width);
  const height = Math.max(0, panelSize.height);
  const viewportWidth = Math.max(0, viewportSize.width);
  const viewportHeight = Math.max(0, viewportSize.height);
  const minLeft = Math.min(insets.left, Math.max(0, viewportWidth - width - insets.right));
  const minTop = Math.min(insets.top, Math.max(0, viewportHeight - height - insets.bottom));
  const maxLeft = Math.max(minLeft, viewportWidth - width - insets.right);
  const maxTop = Math.max(minTop, viewportHeight - height - insets.bottom);

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
