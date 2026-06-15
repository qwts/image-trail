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

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
