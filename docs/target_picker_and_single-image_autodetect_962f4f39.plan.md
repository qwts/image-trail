---
name: Target picker and single-image autodetect
overview: Add a top-right target button for manual host-image selection and change startup behavior to auto-select only when exactly one page image is present.
todos:
  - id: add-target-button
    content: Add top-right target button and pick-mode state
    status: pending
  - id: centralize-host-switch
    content: Create setTargetImage helper for listener/style/status rebinding
    status: pending
  - id: startup-single-image-rule
    content: Implement exact-single-image startup auto-selection
    status: pending
  - id: manual-click-select
    content: Handle pick-mode image click selection in onDocumentClick
    status: pending
  - id: host-null-guards
    content: Add safe guards when no host image is selected
    status: pending
  - id: build-and-verify
    content: Rebuild dist output and run behavior sanity checks
    status: pending
isProject: false
---

# Add Target Picker + Single Image Auto-Detect

## Goal
Implement a manual host-image picker (top-right target button) and update bookmarklet startup behavior so it only auto-selects when the page has exactly one qualifying image.

## Files to update
- [`/Users/chris/Code/image-bookmarklet/image-url-token-editor.bookmarklet.src/image-url-token-editor.bookmarklet.src.js`](/Users/chris/Code/image-bookmarklet/image-url-token-editor.bookmarklet.src/image-url-token-editor.bookmarklet.src.js)
- (After implementation) rebuild generated dist output via existing build script so minified bundle matches source.

## Implementation plan
1. **Add explicit target-pick state and UI handle**
   - Extend `app` state with fields like `isTargetPickMode`, `targetPickerButton`, and optional overlay container ref.
   - Render a fixed-position top-right button (crosshair/target style) that toggles pick mode.

2. **Introduce a centralized host-image setter**
   - Create a helper (e.g. `setTargetImage(img)`) to safely switch `app.targetImg`.
   - In this helper: rebind image load/error listeners, apply target-image styling, and update status text.
   - Reuse this helper from startup auto-detect and manual click selection so behavior stays consistent.

3. **Change startup auto-detect rule to exact-single-image only**
   - Replace current unconditional `findTargetImage()` assignment in `init()` with logic:
     - If exactly one qualifying image exists, set it as host.
     - If zero or multiple qualifying images exist, do not pick a host automatically.
   - Remove/gate the synthetic fallback host image behavior for this ambiguous/no-image path.

4. **Wire manual pick flow into document click handling**
   - In `onDocumentClick`, when target-pick mode is active:
     - detect clicked `<img>` via existing `findImageFromTarget` pattern,
     - set as host via `setTargetImage(img)`,
     - exit pick mode.
   - Preserve existing Shift+click-to-history behavior when pick mode is not active.

5. **Guard host-dependent actions when no host is selected yet**
   - Ensure actions that assume `app.targetImg` (URL apply/styling/load handling) fail safely and show guidance status until a host is chosen.
   - Keep panel behavior intact while waiting for manual selection.

6. **Rebuild and sanity-check behavior**
   - Build the bookmarklet output.
   - Validate flows: one image auto-picks; zero/multi images require target button; click selects host; existing history interactions still work.

## Behavior checks to run
- Page with **exactly 1 image**: bookmarklet auto-selects that image as host.
- Page with **0 images**: no host auto-selected; target button required.
- Page with **2+ images**: no host auto-selected; target button required.
- Target pick mode: click image sets host and exits pick mode.
- Non-pick mode: Shift+click still adds clicked image URL to history.