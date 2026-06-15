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

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
