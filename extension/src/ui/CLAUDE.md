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
  row-level highlight (`RecordRow` `selected` state in
  `components/record-row.ts` / `styles/record-row.css`); a stored original is a
  separate indicator dot from the same visual contract. Keep them on separate
  visual channels — the dot is an indicator, not a competing selected-row
  background.
- **Pointer capture kills native clicks.** `setPointerCapture` on pointerdown retargets the
  pointerup and suppresses click synthesis — it silently breaks `<details>` summary toggles and
  any click-driven control under the pointer. For drag gestures on large surfaces, observe
  pre-threshold moves at the window level and capture only once the drag engages
  (`beginDragOut`'s `deferCaptureUntilEngaged` in `components/detachable-section.ts`). When
  touching shared input plumbing, e2e-test the neighboring click behaviors first.
- **Panel files are size-capped.** `ui/panel/**` files trip an ESLint
  `max-lines` error at 800 lines; split rather than grow them.
