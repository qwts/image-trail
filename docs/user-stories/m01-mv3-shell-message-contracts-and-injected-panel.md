# M01: MV3 Shell, Message Contracts, And Injected Panel

**Order:** 1  
**Type:** Extension foundation

---

## User Story

As a user, I want to click the browser action and see an in-page panel so I can start using the tool without a popup.

## Source Context

This milestone creates the minimal Manifest V3 shell, service worker, content script injection, panel lifecycle, and initial message contracts.

---

## Scope

- Add `manifest.json`, TypeScript config, package metadata, and basic compile output.
- Add MV3 service worker entry point.
- Add browser-action click behavior that injects or toggles the content script panel.
- Establish typed message contracts between service worker and content script.
- Render a plain DOM panel with status, close/toggle behavior, and a minimal action dispatch path.
- Add basic panel style isolation and cleanup.

## Out Of Scope

- URL parser port.
- IndexedDB persistence beyond smoke-test wiring.
- Full keyboard handling.
- Capture, downloads, LLM, automation, import/export.

## Exit Criteria

- Extension loads unpacked in Brave/Chromium.
- Browser action toggles the in-page panel on supported pages.
- Repeated toggles do not duplicate panels or leak obvious DOM nodes.
- Service worker and content script can exchange a typed ping/status message.
- The panel renders from explicit state and calls named actions, not inline business logic.

## Primary Modules

- `extension/manifest.json`
- `extension/src/background/service-worker.ts`
- `extension/src/background/messages.ts`
- `extension/src/content/content-script.ts`
- `extension/src/ui/panel.ts`
- `extension/src/ui/render.ts`
- `extension/src/ui/styles/panel.css`
- `extension/src/core/actions.ts`
- `extension/src/core/state.ts`
- `extension/src/core/types.ts`

---

## Acceptance Scenarios

- Unpacked MV3 extension loads in Brave/Chromium with no manifest or service-worker startup errors.
- Browser action injects the content script/panel on supported pages and toggles the same panel instance rather than creating duplicates.
- Close/toggle removes extension-owned DOM, styles, listeners, timers, observers, and message subscriptions.
- Service worker and content script exchange typed ping/status messages with validated discriminated-union payloads and safe unknown-message handling.
- Panel renders status and controls from a serializable state object and dispatches named actions only.
- Unsupported pages or injection failures surface recoverable status without throwing uncaught errors.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use a Message Bus / Command pattern for browser-action, ping, toggle, and status actions.
- Keep `ui/` as a rendering adapter: it receives state and action callbacks, making a future React root a drop-in replacement.
- Use idempotent panel lifecycle helpers: `mount`, `update`, `hide/show`, `destroy`.
- Define a single source of truth for message names and payload versions in `background/messages.ts`.
- Avoid broad permissions; start with `activeTab`, `scripting`, and `storage` only if required.

## Test Notes

- Load unpacked extension and inspect service-worker console for startup errors.
- Click browser action repeatedly and verify only one panel root exists.
- Send ping/status round-trip and verify response shape.
- Close panel and inspect DOM for removed root/style nodes.

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

- Which page schemes should show a user-facing unsupported-page status?
- Should panel state persist across page reload in M01 or wait for local settings?
