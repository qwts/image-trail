# M03: URL Parser, Field Model, And Navigation Core

**Order:** 3  
**Type:** Port / refactor

---

## User Story

As a user, I want the extension to understand and edit image URL fields so I can navigate image sequences like the bookmarklet does.

## Source Context

This milestone extracts and ports URL parsing, URL rebuilding, token field movement, image URL application, same-origin visible URL updates, and request throttling into framework-independent core code.

---

## Scope

- Port generic URL tokenization for protocol, host, path segments, filename tokens, query fields, hash fields, encoded slash paths, HTML entity handling, decimal fields, hex fields, and width preservation.
- Rebuild URLs by token position rather than unsafe global replacement.
- Add active field selection and increment/decrement behavior.
- Clear `srcset` and `sizes` before applying a new URL to the target image.
- Preserve same-origin `history.pushState()` behavior where safe.
- Add request-throttling scaffold that applies to rapid manual navigation.
- Add parser regression fixtures from M00.

## Out Of Scope

- Advanced domain-specific field aliases and split patterns unless required for parity tests.
- Slideshow/404 automation.
- Durable encrypted history recall.
- LLM metadata.

## Exit Criteria

- Known bookmarklet URL patterns parse and rebuild correctly.
- Incrementing/decrementing a numeric field produces the expected next URL.
- Rebuilt URLs update the selected target image only.
- Failed image loads surface status without corrupting the previous usable state.
- Same-origin visible URL updates happen only when allowed.
- Request throttling prevents uncontrolled rapid manual requests.

## Primary Modules

- `extension/src/core/url/parse-url.ts`
- `extension/src/core/url/rebuild-url.ts`
- `extension/src/core/url/tokenize-fields.ts`
- `extension/src/core/url/types.ts`
- `extension/src/core/image/image-navigation.ts`
- `extension/src/content/request-throttle.ts`
- `extension/src/ui/components/url-editor-view.ts`
- `extension/src/ui/components/fields-view.ts`
- `extension/src/ui/components/controls-view.ts`

---

## Acceptance Scenarios

- All M00 fixture URLs parse into stable model objects and rebuild without changing non-edited parts.
- HTML entities, malformed percent sequences, `+` query spaces, literal slashes, `%2f`, and `%252f` survive round-trip.
- Field collection labels path, filename, query, int, hex, and text tokens deterministically and selects the first numeric field by default.
- Increment/decrement uses BigInt, clamps below zero, preserves width/case/prefix, and widens but never narrows.
- Applying a rebuilt URL clears `srcset`/`sizes` on the selected image and related `<source>` elements before setting `src`.
- Successful image load commits pending history; failed load clears pending state and does not corrupt last successful URL.
- Same-origin `history.pushState` is attempted only when safe; cross-origin updates are skipped with status.
- Request throttle governs rapid manual controls before automation is introduced.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use pure functions for parse/rebuild/token operations with no DOM or extension APIs.
- Use Strategy-like encoding helpers for path/query contexts rather than conditionals spread across callers.
- Use Command objects/actions for `setField`, `bumpField`, and `applyUrl` so UI can dispatch the same action from DOM or React later.
- Keep image application in `core/image` plus `content/page-adapter`; core computes intent, content mutates DOM.
- Create regression fixtures before broad UI wiring.

## Test Notes

- Run parser round-trip fixtures for every known bookmarklet URL shape.
- Test bump behavior for decimal, zero-padded decimal, hex with prefix, hex without prefix, and underflow.
- Manual apply to picture/srcset page and confirm responsive attributes are cleared only for target.
- Manual 404 load confirms no history commit.

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

- Should hash fragments be tokenized for editing in the first parser pass or only preserved?
- What exact throttle defaults should apply to manual clicks?
