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
- Parsed query field feedback distinguishes failed, useful, and unchanged image
  loads before fields participate in global navigation.

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

## Documentation Review Complete

- **Reviewed source context:** Bookmarklet behavior map URL/parser sections, bookmarklet plan normalization examples, acceptance baseline parser parity checklist.
- **Most important build guardrails:** pure parser functions, token identity, encoded slash preservation, BigInt bumping, same-origin location updates.
- **Acceptance criteria added from review:** round-trip fixtures, field-model behavior, image apply/load/error semantics, throttle scaffold.
- **Still intentionally out of scope:** slideshow, durable recall, domain-specific aliases, and LLM metadata.

## Acceptance Scenarios

- All M00 fixture URLs parse into stable model objects and rebuild without changing non-edited parts.
- HTML entities, malformed percent sequences, `+` query spaces, literal slashes, `%2f`, and `%252f` survive round-trip.
- Field collection labels path, filename, query, int, hex, and text tokens deterministically and selects the first numeric field by default.
- Increment/decrement uses BigInt, clamps below zero, preserves width/case/prefix, and widens but never narrows.
- Applying a rebuilt URL clears `srcset`/`sizes` on the selected image and related `<source>` elements before setting `src`.
- Successful image load commits pending history; failed load clears pending state and does not corrupt last successful URL.
- Same-origin `history.pushState` is attempted only when safe; cross-origin updates are skipped with status.
- Request throttle governs rapid manual controls before automation is introduced.
- Failed query-field edits turn that field red, keep the previous image applied,
  leave the draft URL editable for another attempt, and do not clear existing
  Previous/Next include/exclude choices.
- Query-field edits that load the same image stay neutral/unchanged and do not
  include the field in Previous/Next navigation.
- Query-field edits that load a different image turn green; successful numeric
  or hex query fields are automatically included in Previous/Next navigation.
- If a user manually excludes an automatically included field, later successful
  loads for that field do not automatically include it again during the current
  target session. Manual Include can opt it back in.
- Global Previous/Next changes all included numeric/hex query fields together
  and falls back to the default numeric/hex field when nothing is included.
- Hex fields show their decimal value nearby so users can reason about both
  representations while editing.
- A single URL token can be split with a target-scoped length pattern such as
  `2-2-4`, edited as separate metafields, and rebuilt as the same contiguous URL
  value.
- Clearing a split pattern collapses all of its metafields back into the
  original single parsed field.

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
- Treat image identity as a first-class part of query-field feedback. A URL that
  fetches successfully but has the same image bytes is not a useful green field.
- Keep Previous/Next field inclusion state session-only and target-scoped.
  Changing the host target clears failed/successful/unchanged/included field
  state.
- Keep split patterns session-only and target-scoped. Persisted pattern
  libraries, domain/path-structure matching, partial collapse, grouping syntax,
  and calendar-aware date stepping remain out of scope until there is a separate
  design.
- Create regression fixtures before broad UI wiring.

## Test Notes

- Run parser round-trip fixtures for every known bookmarklet URL shape.
- Test bump behavior for decimal, zero-padded decimal, hex with prefix, hex without prefix, and underflow.
- Manual apply to picture/srcset page and confirm responsive attributes are cleared only for target.
- Manual 404 load confirms no history commit.
- Test query field feedback for failed load, different-image success, same-image
  unchanged, one-time automatic Previous/Next inclusion, manual exclude/include,
  global Previous/Next over all included fields, and failed global navigation
  preserving include/exclude state.
- Test split patterns for parse/rebuild round-trip, split part bumping,
  reparse persistence, invalid pattern handling, target-change reset, and clear
  split collapse.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- Placeholder sections made the story impossible to execute or verify without rediscovering requirements from the broader docs.
- The story did not explicitly state the reviewed source documents, the module boundaries that must not be crossed, or the framework-adoption constraints.
- The story did not call out the concrete pass/fail acceptance criteria needed to prove round-trip fixtures, field-model behavior, image apply/load/error semantics, throttle scaffold.
- The story did not explicitly separate slideshow, durable recall, domain-specific aliases, and LLM metadata from the work that should be implemented in this milestone.

### Added In This Planning Pass

- Added a documentation-review completion block tying this story to: Bookmarklet behavior map URL/parser sections, bookmarklet plan normalization examples, acceptance baseline parser parity checklist.
- Added concrete acceptance scenarios for round-trip fixtures, field-model behavior, image apply/load/error semantics, throttle scaffold.
- Added implementation notes that preserve pure parser functions, token identity, encoded slash preservation, BigInt bumping, same-origin location updates.
- Added test notes that can be converted into manual regression checks or automated fixtures before integration.
- Added open questions for decisions that remain unresolved but should not block documenting the intended architecture.

### Coverage Status

- All placeholder planning sections for this story are filled.
- The milestone is now traceable from docs to acceptance criteria to implementation patterns and test notes.
- Remaining uncertainty is isolated under **Open Questions** rather than hidden as missing acceptance criteria.

## Open Questions

- Should hash fragments be tokenized for editing in the first parser pass or only preserved?
- What exact throttle defaults should apply to manual clicks?
