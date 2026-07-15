import { useEffect } from 'react';

import type { PanelAction } from '../../core/types.js';
import type { WorkspaceRailEdge, WorkspaceSectionLayout } from '../../core/workspace-layout.js';
import { cancelWorkspaceGesture } from '../workspace/workspace-gesture.js';
import { renderReactSubtree } from './react-subtree.js';
import { WorkspaceRail, type WorkspaceRailEntry } from './workspace-rail.js';
import { WorkspaceWindow, type WorkspaceWindowEntry } from './workspace-window.js';

export interface WorkspaceRenderEntry {
  readonly placement: WorkspaceSectionLayout;
  readonly title: string;
  readonly body: HTMLElement;
}

function WorkspaceRenderer({
  entries,
  dispatch,
  previousIds,
}: {
  readonly entries: readonly WorkspaceRenderEntry[];
  readonly dispatch: (action: PanelAction) => void;
  readonly previousIds: ReadonlySet<string>;
}) {
  useEffect(() => () => cancelWorkspaceGesture(), []);
  const floating = entries.filter(
    (entry): entry is WorkspaceWindowEntry => entry.placement.mode === 'floating' && entry.placement.floatingRect !== null,
  );
  const rails = new Map<WorkspaceRailEdge, WorkspaceRailEntry[]>([
    ['left', []],
    ['right', []],
    ['top', []],
    ['bottom', []],
  ]);
  for (const entry of entries.filter(isWorkspaceRailEntry)) rails.get(entry.placement.edge)?.push(entry);
  for (const sections of rails.values()) sections.sort((a, b) => (a.placement.order ?? 0) - (b.placement.order ?? 0));
  const activeEdges = new Set([...rails].filter(([, sections]) => sections.length > 0).map(([edge]) => edge));
  const nextRailPositions = new Map([...rails].map(([edge, sections]) => [edge, sections.length + 1]));
  return (
    <div className="image-trail-workspace" data-image-trail-workspace="react">
      <div className="image-trail-workspace__announcement" role="status" aria-live="polite" aria-atomic="true">
        {workspaceSummary(entries)}
      </div>
      {(['left', 'right', 'top', 'bottom'] as const).map((edge) => (
        <WorkspaceRail key={edge} edge={edge} entries={rails.get(edge) ?? []} dispatch={dispatch} />
      ))}
      {floating.map((entry) => (
        <WorkspaceWindow
          key={entry.placement.sectionId}
          entry={entry}
          activeEdges={activeEdges}
          nextRailPositions={nextRailPositions}
          dispatch={dispatch}
          animate={!previousIds.has(entry.placement.sectionId)}
        />
      ))}
    </div>
  );
}

function workspaceSummary(entries: readonly WorkspaceRenderEntry[]): string {
  if (entries.length === 0) return 'All workspace sections attached.';
  return entries
    .map(({ placement, title }) => {
      const shade = placement.shaded ? ', shaded' : '';
      if (placement.mode === 'railed' && placement.edge) {
        return `${title} docked to ${placement.edge} rail, position ${(placement.order ?? 0) + 1}${shade}`;
      }
      return `${title} floating${shade}`;
    })
    .join('. ');
}

function isWorkspaceRailEntry(entry: WorkspaceRenderEntry): entry is WorkspaceRailEntry {
  return entry.placement.mode === 'railed' && entry.placement.edge !== null;
}

export function renderReactWorkspace(
  container: HTMLElement,
  entries: readonly WorkspaceRenderEntry[],
  dispatch: (action: PanelAction) => void,
  previousIds: ReadonlySet<string>,
): HTMLElement {
  return renderReactSubtree(container, <WorkspaceRenderer entries={entries} dispatch={dispatch} previousIds={previousIds} />);
}
