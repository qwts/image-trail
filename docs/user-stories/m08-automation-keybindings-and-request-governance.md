# M08: Automation, Keybindings, And Request Governance

**Order:** 8  
**Type:** Port / harden

---

## User Story

As a user, I want fast keyboard and automation workflows while keeping image requests under control.

## Source Context

This milestone restores keyboard routing, slideshow behavior, 404 retry/advance, preload controls, auto-download options, stop behavior, and hard request governance.

---

## Scope

- Maintain one canonical shortcut registry for in-page behavior, Help, Settings, and browser-command documentation.
- Preserve normal typing, native record-row behavior, and browser/OS modifier shortcuts.
- Expose extension-level keyboard commands that should appear in Chromium's extension shortcut settings.
- Add slideshow state machine.
- Add 404 retry/advance behavior.
- Add optional preload above/below current URL structure.
- Add auto-download on successful load if enabled.
- Enforce minimum request interval and hard request caps across manual and automated flows.
- Stop, pause, or throttle automation when limits are reached or user interrupts.

## Out Of Scope

- New crawling/scraping behavior unrelated to explicit image navigation.
- Automatic broad prefetching without user enablement.
- Server-side automation.

## Exit Criteria

- Keyboard shortcuts work without breaking input typing.
- Browser extension keyboard shortcut settings expose the build-info overlay toggle command.
- Settings exposes a build-info overlay visibility toggle for local/debug builds.
- Automation can be started, stopped, and interrupted reliably.
- 404 retry/advance behavior follows configured limits.
- Request caps prevent uncontrolled request bursts.
- UI clearly surfaces throttled, paused, stopped, and failed states.

## Primary Modules

- `extension/src/content/keyboard.ts`
- `extension/src/content/request-throttle.ts`
- `extension/src/core/automation/navigation-queue.ts`
- `extension/src/core/automation/slideshow.ts`
- `extension/src/core/automation/retry-404.ts`
- `extension/src/core/automation/types.ts`
- `extension/src/ui/components/controls-view.ts`
- `extension/src/ui/components/status-view.ts`

---

## Documentation Review Complete

- **Reviewed source context:** Bookmarklet behavior map automation/keybinding sections, deprecated bugs-and-fixes keyboard notes, acceptance baseline deferrals.
- **Most important build guardrails:** single-dispatch keyboard routing, shared request governor, cancellable automation state machine, stop/throttle statuses.
- **Acceptance criteria added from review:** shortcut behavior, slideshow/404 bounds, preload opt-in, request caps across all callers.
- **Still intentionally out of scope:** new scraping/crawling, broad prefetch, server automation.

## Acceptance Scenarios

- The canonical bare-key table works while typing/editable controls, native record rows, and Command/Ctrl/Alt combinations remain unaffected.
- Capture, pin, capture-and-bookmark, and download remain single-dispatch workflows; downloads use the existing download path and never open a tab.
- Slideshow has explicit idle/running/paused/stopped/error states and can be interrupted by user action.
- 404 retry/advance obeys configured delay/count and stops safely at limits.
- Preload is opt-in/bounded and uses the same throttle/cap model as manual and automated navigation.
- Hard request caps and minimum intervals apply across manual clicks, keyboard actions, preloads, slideshow, 404 traversal, and auto-download.
- UI surfaces throttled, paused, stopped, exhausted, and failed states clearly.
- Chromium extension keyboard shortcut settings list the Image Trail build-info overlay toggle; Alt/Option+Shift+B remains the suggested page shortcut and command binding when the browser accepts it.
- The panel Settings Maintenance section surfaces the build-info overlay display toggle and applies it without requiring `chrome://extensions/shortcuts`.

## Canonical Keyboard Contract

### In-page bare keys

These are handled by the content-script keyboard router. Letter matching is case-insensitive. The router ignores `INPUT`, `TEXTAREA`, `SELECT`, `contentEditable`, native record rows, and any event with Command, Ctrl, or Alt held.

| Key   | Action                                                                       |
| ----- | ---------------------------------------------------------------------------- |
| `←`   | Previous Trail step                                                          |
| `→`   | Next Trail step                                                              |
| `C`   | Capture the current original                                                 |
| `↓`   | Run the user-assigned Capture original, Download image, or Unassigned action |
| `P`   | Pin the current image                                                        |
| `B`   | Capture original and bookmark                                                |
| `G`   | Toggle Grab Mode                                                             |
| `?`   | Toggle Help                                                                  |
| `,`   | Open Settings                                                                |
| `Esc` | Leave Help or a destination, then close the panel                            |

The Down-arrow assignment is extension-owned durable settings state. It defaults to `Capture original`, is edited under **Settings → Automation → Keybindings**, and must reload in every injected panel when another source tab or the React Settings extension page changes it. `Unassigned` declines the event so native page behavior remains available.

Legacy bare Space, D, Shift+D, Shift+G, R, S, Shift+Enter, and P-as-panel-hide mappings are not part of this table. They must not be intercepted as page shortcuts.

### Browser commands

Modifier-based, user-rebindable commands remain registered in `extension/manifest.json`: Previous/Next Trail step, Download image, Download with Save As, Slideshow, Stop automation, Grab Mode, and Retry navigation. The browser action opens/hides the panel. Help must state this split rather than presenting browser commands as bare keys.

### Capture and download feedback

- A keyed capture stores encrypted original bytes with its durable bookmark and reports `Captured original ✓`.
- A capture without an unlocked encryption key saves the durable link and reports `Pinned — unlock encryption to store the original`.
- `P` remains a link-only pin; `B` is the explicit capture-and-bookmark gesture.
- Feedback uses generic privacy-safe copy, never a URL, title, or filename.
- The handoff flash is fixed bottom-center, pointer-inert, reduced-motion safe, and auto-dismisses after 1400 ms. Repeated actions clear and restart the timer. Panel teardown clears the timer and DOM; ordinary renders must not erase an active flash.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use State Machine pattern for slideshow/404 automation; avoid boolean soup.
- Use a shared Request Governor service so no caller bypasses caps.
- Use a Keyboard Router with target classification (`typing`, `button`, `panel`, `page`) before action dispatch.
- Register browser-visible extension commands in `extension/manifest.json` when a shortcut needs to be discoverable or user-reassignable in Chromium settings.
- Keep the build-info overlay visible through a normal Settings control as well as the shortcut command; Settings is the discoverable in-extension surface.
- Make automation commands cancellable and idempotent because MV3/content lifecycles can interrupt work.
- Keep keybindings configurable through settings contracts, not hardcoded in views.
- Keep the plain-DOM injected panel and React extension-page Settings surface on the same settings contract and shortcut registry. React is the UI renderer boundary; controllers, storage, capture, download, and keyboard routing remain framework-independent.

### Bounded Manual Navigation Input (#373)

- Repeated MANUAL navigation input (Next/Previous clicks, ArrowLeft/ArrowRight
  repeats, parsed-field `-`/`+` steps) is **latest wins with coalescing**, not a
  queue of per-press image loads: the parsed-field navigation drain claims the
  whole queued manual delta as one net-distance jump per iteration, and the
  field editor folds queued `-`/`+` steps per field into one net transform
  (a netted-out `+`/`-` pair loads nothing). When input stops, at most the
  in-flight load plus one coalesced load ever apply.
- Slideshow and retry sources keep single-step cadence — coalescing applies to
  live manual gestures only, never scheduled automation.
- `stop-all` (Escape/Stop) clears queued manual navigation; the single
  in-flight load may still complete.
- A governor wait longer than ~3s abandons manual-only queued intent with a
  visible status message instead of applying a load long after input stopped.
  Automation sources still ride out the request window.
- Buffered prewarming responsiveness: when a seek blocks past known-failed
  neighbors, the controller probes the whole remaining skip budget
  concurrently (probe-only; GETs stay reserved for the landing index), so a
  run of failures resolves in about one round-trip and the first good frontier
  image is landed in a single step. Requests the user's navigation is parked
  on (`advanceOnResolve`) bypass the speculative window-refill queue and its
  concurrency cap — prefetch work must never delay the active step.
- `automation.navigationBusy` is the visible in-flight signal: it drives the
  panel `is-waiting` state and a "Loading the next image." waiting toast.
  Waiting toasts enter on a short (150ms) delay so near-instant buffered steps
  never flash them, and the status toast only rebuilds when its content
  changes so stale messages cannot replay their enter animation each render.

## Test Notes

- Verify the exact bare-key registry in panel/page contexts plus exclusions for text inputs, selects, contentEditable, native record rows, and Command/Ctrl/Alt combinations.
- Verify Down assignment, cross-tab settings reload, source-page reload, existing download routing, Help/Settings/Escape transitions, repeated-key timer reset, active-flash render survival, and teardown cleanup.
- Verify browser-visible extension commands through `chrome.commands.getAll()` rather than brittle `chrome://extensions/shortcuts` DOM assertions.
- Verify the build-info overlay Settings checkbox hides and restores the overlay in a Chromium extension smoke test.
- Start slideshow, interrupt with stop/opposite direction, and verify no pending runaway timer.
- Trigger 404 auto-advance with low limit and verify stop at count.
- Stress rapid manual plus automation actions and verify request cap status.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove shortcut behavior, slideshow/404 bounds, preload opt-in, request caps across all callers.
- The story did not explicitly separate new scraping/crawling, broad prefetch, server automation from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Bookmarklet behavior map automation/keybinding sections, deprecated bugs-and-fixes keyboard notes, acceptance baseline deferrals.
- Added concrete acceptance scenarios for shortcut behavior, slideshow/404 bounds, preload opt-in, request caps across all callers.
- Added implementation notes that preserve single-dispatch keyboard routing, shared request governor, cancellable automation state machine, stop/throttle statuses.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- What should default request cap/minimum interval be for safe initial release?
- Resolved in #519, superseding #391's `P` mapping: `P` pins, `Esc` leaves/closes the active panel surface, and panel open/hide remains the browser action command. Legacy `a`–`z` field jumps and `h` hide/grayscale remain intentionally unassigned.
