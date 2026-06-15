# M02: Target Image Selection And Page Integration

**Order:** 2  
**Type:** Port / adapt

---

## User Story

As a user, I want the extension to select the only image automatically or let me manually pick one so actions affect the intended image only.

## Source Context

This milestone ports target image detection, manual picking, image application hooks, preview styling, DOM observation, and cleanup behavior.

---

## Scope

- Auto-select exactly one qualifying image when appropriate.
- Add manual target-pick mode with visible hover/selection indication.
- Track the selected target image through a page adapter.
- Apply preview styling when the single-image case allows it.
- Restore original image/page styles on close or target change.
- Observe late-loaded images during target-pick mode.
- Preserve previous target state enough to recover from failed operations.

## Out Of Scope

- Full URL field editor.
- Durable history persistence.
- Original image capture.
- Full automation.

## Exit Criteria

- On a page with exactly one qualifying image, the extension selects it automatically.
- On a page with multiple images, the user can select the intended target manually.
- Target selection is visually clear.
- Closing the panel restores extension-owned styling.
- Late-added images can be selected during pick mode.
- No extension action mutates unrelated page images.

## Primary Modules

- `extension/src/content/target-image.ts`
- `extension/src/content/page-adapter.ts`
- `extension/src/content/page-style.ts`
- `extension/src/content/dom-observer.ts`
- `extension/src/ui/components/target-picker-view.ts`
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
