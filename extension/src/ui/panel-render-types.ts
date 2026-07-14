import type { DetachableSectionId, PanelAction } from '../core/types.js';
import type { DetachedWindowPosition } from './components/detachable-section.js';
import type { NumericFieldDisplayMode } from './parsed-fields-section.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly contextRoot?: HTMLElement | null;
  readonly recallRoot?: HTMLElement | null;
  readonly detachedRoot?: HTMLElement | null;
  readonly toastRoot?: HTMLElement | null;
  readonly dispatch: (action: PanelAction) => void;
  readonly layoutState: PanelLayoutState;
  readonly scrollAnchorId?: string | null;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
  /** Fired after detached-window geometry or minimized state changes. */
  readonly onWorkspaceLayoutChanged?: () => void;
}

export interface PanelRenderOptions {
  readonly renderRecall?: boolean;
}

export interface PanelLayoutState {
  fieldsPanelOpen: boolean;
  fieldsPanelBlockSize: number | null;
  historyListBlockSize: number | null;
  fieldDisplayModes: Map<string, NumericFieldDisplayMode>;
  detachedWindowPositions: Map<DetachableSectionId, DetachedWindowPosition>;
  detachedWindowMinimized: Set<DetachableSectionId>;
  /** Scroll offsets parked while collapsible record lists are absent from the DOM. */
  collapsibleListScrollTops: Map<string, number>;
}
