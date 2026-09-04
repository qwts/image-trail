# Image Preview Backdrop No-Flash

Purpose: verify that selecting an image in preview does not flash or animate the backdrop, so background dimming is a neutral, instantaneous transition instead of a distracting flicker.

## Product Rules

- Darkening the selected image neutralizes its transition so the backdrop never animates or flashes.
- The backdrop dim apply is instantaneous and free of transition-driven flicker on selection or unselection.
- Styling changes to the preview backdrop must not introduce animation or flash that could trigger motion sensitivity or visual artifacts.

## Manual Scenario

1. Load the built extension and open the preview for an image.
2. Select and then deselect the image and verify the backdrop dims and undims without any flash, blink, or animated transition.
3. Repeat across several image sizes and preview states and confirm the backdrop change is always neutral and instantaneous.
4. Verify no motion or flash styling is applied to the backdrop on selection.

## Expected Result

- Selecting or deselecting an image never animates or flashes the backdrop.
- The dimming transition is stable and neutral across image sizes.

Automated evidence:

- `tests/dom/page-style.test.ts`
