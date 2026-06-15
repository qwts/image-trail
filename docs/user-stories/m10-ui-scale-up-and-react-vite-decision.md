# M10: UI Scale-Up And React/Vite Decision

**Order:** 10  
**Type:** Decision gate

---

## User Story

As a developer, I want to decide whether the panel has become complex enough to justify React/Vite without moving business logic into the UI.

## Source Context

This milestone evaluates UI complexity and, if adopted, limits React to panel rendering while preserving framework-independent core, data, content, and background boundaries.

---

## Scope

- Review plain DOM panel complexity.
- Evaluate nested UI state, batch selection, lock/import/export dialogs, thumbnail gallery behavior, sorting/filtering, and metadata workflows.
- Decide whether React/Vite reduces complexity enough to justify build-system overhead.
- If adopted, define migration path for `ui/` only.
- Document which plain-DOM views map to React components.

## Out Of Scope

- Rewriting parser, storage, crypto, messaging, target-image handling, automation, or LLM logic into React.
- Introducing dependencies for aesthetic reasons only.

## Exit Criteria

- A written decision exists: keep plain DOM or adopt React/Vite.
- If React/Vite is adopted, the boundary is limited to UI rendering.
- Build output remains reviewable.
- Core/data/content/background modules remain framework-independent.

## Primary Modules

- `extension/src/ui/react-ready/README.md`
- `extension/src/ui/panel.ts`
- `extension/src/ui/render.ts`
- Possible later: `extension/vite.config.js`
- Possible later: `extension/src/ui/react/`

---

## Acceptance Scenarios

- Decision record states keep plain DOM or adopt React/Vite with rationale tied to observed complexity.
- If React/Vite is adopted, only `ui/` rendering migrates; core/data/content/background contracts remain unchanged.
- Plain DOM component inventory maps to potential React components and identifies state/action props.
- Build output remains reviewable and permissions/runtime dependencies do not expand for aesthetics alone.
- A rollback path exists if React/Vite adds unacceptable complexity.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Architecture Decision Record style and evaluate real pain points: dialogs, batch selection, lock/import/export, thumbnails, sorting/filtering, metadata states.
- Preserve Container/Presenter separation so React components receive props and dispatch actions.
- Do not introduce parser/storage/crypto code into hooks/components.
- Keep Vite config extension-aware and avoid hidden network/runtime dependencies.

## Test Notes

- Review UI complexity against M01-M09 implemented views.
- Prototype or document one representative view mapping if adopting React.
- Build extension and inspect dist size/outputs if Vite is introduced.

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

- What complexity threshold triggers React adoption?
- Should a UI test framework be introduced only with React or before?
