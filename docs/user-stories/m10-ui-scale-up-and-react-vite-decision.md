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

## Documentation Review Complete

- **Reviewed source context:** Proposed extension file structure, React/Vite deferral, first-slice UI boundary rules.
- **Most important build guardrails:** decision record, UI-only migration boundary, component inventory, rollback/build reviewability.
- **Acceptance criteria added from review:** plain DOM vs React/Vite rationale and mapping of existing views to future components.
- **Still intentionally out of scope:** moving parser/storage/crypto/content/background behavior into React or adding aesthetic dependencies.

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

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove plain DOM vs React/Vite rationale and mapping of existing views to future components.
- The story did not explicitly separate moving parser/storage/crypto/content/background behavior into React or adding aesthetic dependencies from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Proposed extension file structure, React/Vite deferral, first-slice UI boundary rules.
- Added concrete acceptance scenarios for plain DOM vs React/Vite rationale and mapping of existing views to future components.
- Added implementation notes that preserve decision record, UI-only migration boundary, component inventory, rollback/build reviewability.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- What complexity threshold triggers React adoption?
- Should a UI test framework be introduced only with React or before?
