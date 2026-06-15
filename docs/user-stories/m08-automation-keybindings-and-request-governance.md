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

- Restore core keyboard shortcuts for field movement, image movement, panel hide/show, selection, load, and download actions.
- Preserve normal typing behavior in inputs and editable UI fields.
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

## Acceptance Scenarios

- Keyboard shortcuts match bookmarklet routing while typing in inputs/editable fields remains unaffected.
- Global capture handlers do not double-fire with focused button handlers; Shift+Enter download path is single-dispatch.
- Slideshow has explicit idle/running/paused/stopped/error states and can be interrupted by user action.
- 404 retry/advance obeys configured delay/count and stops safely at limits.
- Preload is opt-in/bounded and uses the same throttle/cap model as manual and automated navigation.
- Hard request caps and minimum intervals apply across manual clicks, keyboard actions, preloads, slideshow, 404 traversal, and auto-download.
- UI surfaces throttled, paused, stopped, exhausted, and failed states clearly.

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
- Make automation commands cancellable and idempotent because MV3/content lifecycles can interrupt work.
- Keep keybindings configurable through settings contracts, not hardcoded in views.

## Test Notes

- Verify shortcuts in panel controls, history buttons, and text inputs.
- Start slideshow, interrupt with stop/opposite direction, and verify no pending runaway timer.
- Trigger 404 auto-advance with low limit and verify stop at count.
- Stress rapid manual plus automation actions and verify request cap status.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- The original story had placeholder acceptance scenarios, implementation notes, test notes, and open questions.
- Shift-left validation expectations were not stated at the story level.
- DRY/modularity, single-responsibility, secure-by-default, testability, observability/status, and React-ready boundaries were implicit rather than traceable.
- The story did not explicitly identify which acceptance criteria close parity or planning gaps for later implementation.

### Added In This Planning Pass

- Filled acceptance scenarios with concrete pass/fail criteria grounded in the docs, bookmarklet behavior map, and extension acceptance baseline.
- Added planning discipline notes that must be reviewed before implementation begins.
- Added implementation notes naming the software patterns, adapters, contracts, and module boundaries to preserve.
- Added test notes so manual or automated checks can be prepared before code is integrated.
- Added open questions for decisions that should be resolved before or during implementation rather than discovered late.

### Coverage Status

- All previously missing placeholder sections in this story are now filled.
- Any remaining uncertainty is captured under **Open Questions** instead of hidden in the implementation plan.

## Open Questions

- What should default request cap/minimum interval be for safe initial release?
- Which bookmarklet keyboard shortcuts are intentionally deferred or remapped?
