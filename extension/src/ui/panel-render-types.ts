import type { DetachableSectionId, PanelAction, PanelDestinationId, WorkspaceSectionLayout } from '../core/types.js';
import type { WorkspaceRailEdge } from '../core/workspace-layout.js';
import type { NumericFieldDisplayMode } from './parsed-fields-section.js';

export interface PanelRenderTarget {
  readonly root: HTMLElement;
  readonly contextRoot?: HTMLElement | null;
  readonly detachedRoot?: HTMLElement | null;
  readonly toastRoot?: HTMLElement | null;
  readonly dispatch: (action: PanelAction) => void;
  readonly layoutState: PanelLayoutState;
  readonly scrollAnchorId?: string | null;
  readonly onPanelDragStart?: (event: PointerEvent) => void;
  /** Fired after detached-window geometry or minimized state changes. */
  readonly onWorkspaceLayoutChanged?: () => void;
  /** Keeps the main panel inside the extension-owned corridor without moving host content. */
  readonly onWorkspaceEdgesChanged?: (edges: ReadonlySet<WorkspaceRailEdge>, observeViewport: boolean) => void;
}

export interface PanelLayoutState {
  fieldsPanelOpen: boolean;
  fieldsPanelBlockSize: number | null;
  historyListBlockSize: number | null;
  fieldDisplayModes: Map<string, NumericFieldDisplayMode>;
  /** Single session registry for attached, floating, and railed workspace placement. */
  workspaceSections: Map<DetachableSectionId, WorkspaceSectionLayout>;
  /** Scroll offsets parked while collapsible record lists are absent from the DOM. */
  collapsibleListScrollTops: Map<string, number>;
  /** Primary workflow offset parked while a destination owns the panel scrollport. */
  primaryPanelScrollTop: number | null;
  /** Per-destination offsets survive route switches without becoming durable product state. */
  destinationScrollTops: Map<PanelDestinationId, number>;
}
