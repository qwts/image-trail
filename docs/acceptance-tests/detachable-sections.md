# Detachable Sections

Purpose: verify the detachable-section pattern (issue #215, epic #393) — eligible panel subsections can move into a floating extension-owned window and back, without changing what the section does.

## Behavior Rules

- Detached state lives in `PanelState.detachedSections`; window geometry is session-transient, extension-owned (`PanelLayoutState`). Nothing is written to host-page `localStorage`.
- A detached section keeps dispatching its existing actions through the panel reducer — the window is chrome only; no parallel state channel.
- The panel keeps a stable placeholder in the section's slot so the surrounding layout does not jump.
- Detach and restore are keyboard accessible; the floating window is `role="dialog"` with a descriptive label; Escape restores.
- The window header carries standard chrome (#397): a minimize toggle (collapses to the title bar, `aria-expanded`, session-transient) and a close (X) whose action restores the section into the panel.
- Settings is detachable (#217): the header gear keeps toggling `settingsOpen` wherever Settings lives (open ⇒ window + placeholder, closed ⇒ neither; duplicates impossible), the Settings window uses the wider 420px default, and privacy masking / advanced-migration affordances are unchanged because the same component renders in both hosts.
- Escape originating inside an editable control (input/textarea/select) belongs to that control — it never restores the window mid-edit. Text committed on change/blur behaves the same detached as attached.
- Eligible sections (#408): ALL major sections — URL editor, Host target, Parsed fields, Manual controls, Recent history, Queue, Settings. Eligibility is registry-driven (`SECTIONS` in `ui/render.ts`): one declarative entry per section drives the attached composition, detach control injection, surface drag, placeholder, and window; views know nothing about detachment.
- Drag-out (#215/#408): press-and-drag the ⧉ control — or grab the section itself by its heading/any non-interactive surface — past a small threshold to show the dashed drop ghost; releasing detaches with the window at the drop point. Presses that start on buttons, form controls, summaries, or list rows never start a drag; sub-threshold presses stay inert. A plain click on ⧉ (or Enter/Space) detaches at the default position — the keyboard path never requires the gesture.
- Escape cancels an in-progress drag: a section drag-out dissolves the ghost and detaches nothing; a detached-window title drag reverts the window to where it started.
- Detached geometry is session-transient by default. When **Restore workspace layout per site** is enabled, the v2 workspace record persists floating position, shade, rail edge, and stack order under an opaque per-install derived key.
- Detached Recent history and Queue windows start in automatic-size mode: their height grows with newly visible rows up to the viewport cap. The first pointer or keyboard resize switches that window to user-size mode; later rows do not change its chosen size, and the resize handle remains usable. Restoring either section to the panel resets it so the next detach starts in automatic-size mode. Other detached sections retain their fixed user-size behavior.

## Manual Script (Recent History Pilot)

1. Load images so Recent history has rows. Click the `⧉` control beside the "Recent history" heading (or focus it and press Enter).
   - The section leaves the panel; a placeholder ("Recent history is open in a floating window." with **Restore to panel**) holds its slot; a floating "Recent history (detached)" window opens beside the panel and receives focus on its Restore control.
2. In the window: select rows, pin, remove, preview — behavior identical to the attached section; new loads appear in the window's list.
3. Drag the window by its title: it moves, clamps to the viewport, and keeps its position across later panel re-renders (e.g. loading more images). Scroll the list, trigger a re-render — scroll position survives.
4. Click the window's minimize (`-`) control (or press Enter on it).
   - The window collapses to its title bar, stays draggable, and the control toggles back; the collapsed state survives panel re-renders (new loads, privacy toggle).
5. Press Escape inside the window (works even while minimized or with focus on a row action), or click the window's close (`X`), or the placeholder's **Restore to panel**.
   - The section returns to its original slot; focus lands on the section's detach control.
6. Minimize the main panel — the window disappears; expand — it returns at its last position.
7. Privacy mode on: detached rows mask exactly like attached rows.

## Manual Script (Automatic Growth And Resize)

1. With at least one visible Recent history row and Queue row, detach both sections.
   - Each window reports automatic-size mode and fits its current content.
2. Load another image, then pin it.
   - Recent history and Queue grow vertically to fit their new visible rows, stopping at the viewport cap instead of extending off-screen.
3. Resize each window with the visible resize handle, then repeat with the keyboard resize commands.
   - The window reports user-size mode, keeps the chosen dimensions, and remains resizable by pointer and keyboard.
4. Load and pin another image.
   - Rows appear, but neither user-sized window grows automatically.
5. Restore Recent history to the panel and detach it again.
   - It returns to automatic-size mode and once again follows visible content growth.

## Manual Script (Settings)

1. Open Settings with the header gear, then click the detach control beside the "Settings" heading.
   - Settings moves into a wider floating window; a placeholder holds its panel slot.
2. Change a harmless setting in the window (e.g. privacy mode) — the change routes through the normal settings path and the panel reflects it.
3. Click the header gear: the window (and placeholder) disappear; click again: they return. `aria-pressed` on the gear tracks open state throughout; no duplicate Settings surface can appear.
4. With privacy masking active, inspect masked values in the window — masking is identical to attached Settings; advanced/migration actions stay behind the advanced surface.
5. Focus a text input in the window and press Escape — the window stays; press Escape from a button or the window itself — Settings restores to the panel.
6. Restore Settings (X, Escape, or placeholder) and confirm changed settings persist.

## Manual Script (Drag-Out)

1. Grab any section by its heading (or press its ⧉ control) and drag ~10px.
   - A dashed drop ghost sized like the section's window follows the pointer, clamped to the viewport.
2. Release over empty page space.
   - The section detaches; its window opens at the drop point; exactly one detach occurs.
3. Repeat, but press Escape before releasing.
   - The ghost disappears; nothing detaches; a later release does nothing.
4. Start a drag from a button, input, select, summary, or a list row — no drag engages; the control behaves normally.
5. Press and release without moving — inert on section surfaces; on ⧉ it detaches at the default position.
6. Drag a detached window by its title, press Escape mid-move — the window snaps back to where it started.

## Manual Script (Per-Site Workspace Layout)

1. Open Settings → Maintenance → Panel layout. Confirm **Restore workspace layout per site** is off by default, and detached arrangements do NOT survive a reload while it stays off.
2. Turn the setting on. Detach two sections (e.g. Recent history and Queue), drag their windows to distinct spots, and minimize one.
3. Reload the page and reopen the panel.
   - Both sections open detached, at their saved positions, with the minimized one still collapsed. The saved layout contains section names and geometry only — no image data, URLs, or record content.
4. Visit a page with a different normalized URL structure: the arrangement is independent. Storage keeps only an HMAC-derived opaque key, never the raw URL, hostname, query value, or page label.
5. Shrink the browser window well below the saved positions and reload — restored windows clamp fully into view instead of opening off-screen.
6. Rearrange windows: changes save automatically (debounced) while the setting is on. Turn the setting off — the panel behaves exactly as before (session-transient geometry), and the stored layout stays put until reset.
7. Click **Reset workspace layout**: the saved layout for this site clears, every detached section reattaches, and the panel reports "Workspace layout reset for this site."

## Automated Coverage

- Reducer: `tests/detachable-sections.test.ts` (detach/restore idempotence).
- DOM: `tests/dom/detachable-section.test.ts` (control/placeholder/window rendering for Recent history, Queue, and Settings; dispatches; Escape incl. the editable-control guard; drag-out threshold/ghost/drop position/click suppression; window drag; scroll preservation; minimize; minimized clearing) and `tests/dom/settings-section.test.ts`.
- E2E: `tests/e2e/detachable-sections.spec.ts` (browser-level detach/restore, minimize, drag-out placement, Escape, detached Settings following the gear toggle without duplication).
- #572 E2E: `tests/e2e/detached-auto-grow.spec.ts` (Recent history and Queue auto-growth, viewport-bounded content sizing, pointer/keyboard user resizing, fixed user size after later rows, and automatic-mode reset after restore/re-detach).
- Storybook: `Extension UI/Detachable sections` (window, narrow, minimized, placeholder, control; play tests) and `Extension UI/Panel layout` (HistoryDetachedPlaceholder, SettingsDetached, SettingsDetachedPrivacyMasked); `Extension UI/Panel layout settings` (#398 workspace restore off/on states with a toggle/reset dispatch play test).
- #398 unit/DOM: `tests/workspace-layout.test.ts` (sanitize/capture/equality helpers), `tests/workspace-layout-controller.test.ts` (restore gated on the opt-in flag, hydration, debounced change-only saves, immediate capture on opt-in, reset, teardown-invalidated restores), `tests/dom/panel-layout-settings-view.test.ts` (toggle + reset dispatch).
- #398 E2E: the reload round-trip in `tests/e2e/detachable-sections.spec.ts` (opt in, detach + drag + minimize, reload restores at the saved position, reset reattaches).
- #520–#522: `tests/workspace-rails-feasibility.test.ts`, `tests/e2e/workspace-rails-spike.spec.ts`, and the focused workspace E2E specs cover rail geometry/input thresholds, host-layout safety, overlay fallback, exact cleanup, private URL-structure keys, extension-restart restore/reset, accessibility, and visual states. See [ADR-0003](../adr/0003-workspace-rails-and-host-reflow-boundary.md) and [Workspace Rails Cross-Site Safety](workspace-rails-cross-site-safety.md).
