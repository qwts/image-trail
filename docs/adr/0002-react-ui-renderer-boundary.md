# ADR-0002: React UI Renderer Boundary

## Status

Accepted — 2026-07-14

Tracking: [#539](https://github.com/qwts/image-trail/issues/539)

## Context

The complete workspace handoff requires one 420px injected panel with a destination dock, multiple in-panel destinations, stateful URL and target controls, detachable sections, floating windows, saved workspace geometry, focus and scroll preservation, reduced motion, and eventual independent extension pages. The supplied React prototype demonstrates the intended composition, but its CDN React/Babel runtime, globals, host-page `localStorage`, inline styles, remote placeholders, and untyped state are not production-compatible.

The existing plain-DOM renderer proved the extension boundaries, but its whole-tree factories and centralized composition make the completed workspace expensive to evolve. The spike compared a corrected plain-DOM shell/target slice with a production React slice using the same serializable `PanelState`, named actions, Shadow DOM mount, detach registry, and controllers.

## Decision

Adopt React 19 incrementally as the renderer for `extension/src/ui`.

- React receives serializable view state and dispatches existing named actions. It does not own parser, URL projection, content integration, background messaging, persistence, crypto, queue, Recall, original blobs, or request governance.
- `PanelState`, action routing, controllers, repositories, and extension message contracts remain authoritative. Do not add a React-only store or duplicate cross-context state.
- React subtrees may coexist with plain-DOM views during migration. Every subtree has an explicit mount/unmount boundary so full swaps, detached windows, and teardown do not leak roots or listeners.
- The packaged content script continues to use the existing esbuild pipeline, with React compiled locally in production mode. Vite remains the Storybook/interaction-test builder; replacing the extension build pipeline is not required for React adoption.
- No remote runtime code, browser JSX compilation, prototype globals, host-page storage, or remote placeholder imagery is allowed.
- New production files remain capped at 400 physical lines. Changed UI code is ratcheted so new or growing functions cannot reach 100 lines; legacy oversized functions may only hold or shrink.
- Migration proceeds by reviewable surface: shell/dock and Host target first, then the linked workspace surfaces under #538. Old DOM/CSS code is removed when its consumer migrates.

## Evidence

The production spike migrated the live header, four-destination dock, and Host target while retaining detach/restore and the existing action/controller path.

- Corrected plain-DOM minified content bundle: 488,245 bytes.
- React production slice under identical minified esbuild settings: 683,988 bytes.
- Cost: 195,743 bytes, or 40.1% for the initial slice.
- The side-by-side Storybook comparison shows that React expresses the complete dock/shell hierarchy without another adapter layer.
- DOM and packaged Playwright coverage verify action routing, Shadow DOM rendering, focus restoration, detached target behavior, object-fit updates, subtree cleanup, privacy-safe status, and existing drag/scroll behavior.

The bundle increase is material, but accepted because the complete workspace composition, destination state, and detachable section variants would otherwise continue growing coupled DOM factories and legacy style overlays. Bundle size remains an explicit migration metric.

## Consequences

- UI changes gain component composition and a production path from the supplied behavior reference without importing its runtime shortcuts.
- The project carries React runtime cost in the injected content-script bundle. Later slices must measure bundle growth and remove superseded DOM code; a build-splitting or minification decision requires separate evidence.
- Existing plain-DOM primitives remain valid migration seams and non-React page utilities until replaced. They must not become a second competing design system.
- Rollback remains bounded: restore the plain-DOM header/target factories, remove the React subtree imports and direct dependencies, and keep the state/action/controller contracts unchanged.
