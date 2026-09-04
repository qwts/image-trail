# Row And List Visual System

Purpose: verify that Recents, the visible bookmark queue, and Recall rows share the same visual system without changing row behavior or data ownership.

## Preconditions

- Storybook is running locally.
- Recent history, bookmarks queue, and Recall drawer stories are available.
- Fixture rows include normal, selected, stored-original/captured, locked/private, long-text, missing-thumbnail, and narrow-layout states.

## Steps

1. Open Recent history `Normal`, `Selected`, `PinnedAndCaptured`, `LockedPrivate`, `LongOverflow`, and `Narrow`.
2. Open Bookmarks queue `Normal`, `SelectedQueue`, `CapturedOriginalIndicator`, `LockedPrivate`, `LongOverflow`, and `Narrow`.
3. Open Recall drawer `Normal`, `Selected`, `HasMore`, `Loading`, `Error`, and `Narrow`.
4. Compare row borders, radius, background, hover, focus, selected state, thumbnails, extension labels, and stored-original indicators across all three surfaces.
5. Hover and keyboard-focus previewable rows.
6. Select and clear rows in the interactive stories.
7. Review long filenames and narrow layouts.

## Expected

- Recents, queue rows, and Recall rows read as the same row family.
- Selected state remains more prominent than stored-original/captured state, including while hovered.
- Stored original remains a small indicator and does not become a competing row background.
- Thumbnail and extension-label treatments stay stable across queue and Recall rows.
- Long names truncate without pushing action controls or changing row height unexpectedly.
- Hover and focus affordances do not erase selected state.
- Row preview/projection requires a REAL double-click (#426): a single click only
  selects, a second click on the same row within ~500ms previews, and a later
  click on a still-selected row re-selects instead of projecting. The window is
  tracked outside the row element (module-level) because the first click's
  selection rerender swaps the row node before the second click. Applies
  identically to Recents, queue, and Recall rows; Enter/Space preview on a
  selected row is unchanged.
- Selecting a Recents row must not reset the recents list scroll position; the
  list participates in the render scroll snapshot like the queue and
  parsed-field lists (#425).
- The Recents and Queue HEADER ROWS are collapse toggles (#438/#441), matching
  summary ergonomics: the whole row — including the far-right Show/Hide hint —
  toggles on click (role=button, aria-expanded, Enter/Space), while clicks on
  the row's interactive children (toolbar buttons, queue menu, detach) pass
  through, and dragging the row still pops the section out (an engaged drag
  suppresses the click). The hint occupies the reserved right-hand column on
  the SAME row. Collapsing hides only the section content — the header row
  stays visible and usable. Collapse is session-local and applies to the
  attached panel only; detached windows always render open.
- Re-expanding a collapsed Recents or Queue section restores the list scroll
  position from before the collapse (#443), not scrollTop 0. Collapse removes
  the list element entirely, so the render scroll snapshot (which only bridges
  renders where the list exists before and after) cannot carry it; the offset
  is instead parked in the session-transient `PanelLayoutState` and reapplied
  when the list reappears. An open list still follows its live snapshot across
  ordinary re-renders, so a mid-session scroll is honored rather than reverted
  to a stale parked value. Session-local, matching the detached-window scroll
  preservation contract (not persisted across reloads).
- Row actions, selection behavior, Recall paging, Recents transience, durable pin/bookmark semantics, queue ordering, and encrypted-original storage behavior are unchanged.
