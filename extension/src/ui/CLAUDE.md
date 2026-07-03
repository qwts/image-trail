# ui/ — Claude Code context

Presentation layer: `panel/`, `components/`, `styles/`, `stories/`. Read
`AGENTS.md` → "UI Rules" for the product invariants; this stub records the two
traps that recur. `ui/` must not import `data/` or `background/` directly —
route through `content/` controllers (ESLint-enforced).

- **Avoid full panel rerenders.** The recall drawer has its own DOM root and
  render path. Use `renderRecallOnly()`, `render({ includeRecall: false })`, or
  `renderPanelAndRefreshRecall()` (`panel.ts`) — i.e. `renderRecallDrawer` vs
  `renderPanel` (`render.ts`) — so queue/recall updates never rebuild the whole
  panel. Focus and scroll are captured/restored across renders; preserve that.
- **Selected vs stored-original must stay visually distinct.** Selection is a
  row-level highlight (`.is-selected`, `styles/panel.css`); a stored original is
  a separate indicator dot (`.image-trail-panel__stored-original-dot`, set by
  `createExtensionIndicator` in `components/bookmarks-view.ts` and
  `components/history-view.ts`). Keep them on separate visual channels — the dot
  is an indicator, not a competing selected-row background.
- **Panel files are size-capped.** `ui/panel/**` files trip an ESLint
  `max-lines` error at 800 lines; split rather than grow them.
