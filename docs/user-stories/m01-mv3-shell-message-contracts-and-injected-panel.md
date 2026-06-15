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

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
