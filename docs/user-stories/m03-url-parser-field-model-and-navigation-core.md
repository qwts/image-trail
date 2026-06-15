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

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
