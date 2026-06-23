# Panel Layout Stability

Purpose: verify that panel sections keep predictable sizing while the user interacts with parsed fields, recent history, and bookmarks.

## Behavior Rules

- The whole Image Trail panel remains scrollable.
- Parsed fields is collapsed by default.
- Parsed fields calculates its open height only when the user opens it.
- Parsed fields open height is determined from the current parsed-field row count plus its surrounding section chrome.
- Parsed fields does not recalculate, grow, or shrink while it remains open.
- Clicking recent history rows, bookmark rows, or other images while parsed fields is open must not change the parsed fields height.
- Closing parsed fields clears the stored height.
- Reopening parsed fields recalculates the height from the current parsed-field rows.
- The user may manually resize parsed fields after opening it.
- Hovering or scrolling over parsed fields must not prevent the outer panel from scrolling.
- Recent history defaults to a three-row visible height and may be resized by the user.
- Bookmarks remain uncapped unless a later requirement explicitly changes that rule.
- The panel can be minimized to a compact Image Trail button docked on the viewport edge without closing the extension session.
- Minimizing the panel does not stop Grab Mode, target picking, or page-level shift-click capture behavior.
- Clicking the compact Image Trail button expands the full panel again.
- Opening the panel on a page with exactly one qualifying image auto-selects that image without immediately rewriting the page backdrop or image box.
- Full-page selected-image preview styling is applied only when the user turns on the host image `Fill screen` control.

## Steps

1. Open the extension panel on a page with multiple images whose URLs produce different parsed-field counts.
2. Verify `Parsed fields` is collapsed by default.
3. Open `Parsed fields`.
4. Verify its height fits the current parsed-field rows and then remains fixed.
5. Click several recent history rows with different parsed-field counts.
6. Verify parsed fields does not grow or shrink while it is open.
7. Click several bookmark rows with different parsed-field counts.
8. Verify parsed fields still does not grow or shrink while it is open.
9. Scroll the mouse wheel while the pointer is over parsed fields.
10. Verify the outer panel can continue scrolling when the parsed-fields content reaches its scroll boundary.
11. Close parsed fields.
12. Select an image with a different parsed-field count.
13. Reopen parsed fields.
14. Verify the height is recalculated for the current parsed-field rows.
15. Resize parsed fields manually.
16. Verify subsequent image, recent history, and bookmark clicks do not override the manually resized height while parsed fields remains open.
17. Click the panel minimize button.
18. Verify the panel collapses to one compact `Image Trail` button docked on the viewport edge.
19. If Grab Mode is active, verify the minimized button remains visibly marked as active.
20. Verify Grab Mode and shift-click image capture still work while the panel is minimized.
21. Click the compact `Image Trail` button.
22. Verify the full panel expands again.
23. Open the extension on a page with exactly one qualifying image.
24. Verify the image is auto-selected with a lightweight selected outline and the host page does not flash to a black backdrop or resize the image box on open.
25. Close and reopen the panel.
26. Verify repeated open/close cycles do not visibly flicker the page backdrop or image dimensions.
27. Click the host image `Fill screen` control.
28. Verify the selected image enters intentional full-page preview styling.
29. Click `Fit in page`.
30. Verify the selected image returns to its page layout while remaining selected.
31. Apply a different URL through a parsed field or bookmark preview.
32. Verify the selected image stays in page layout unless `Fill screen` is turned on.

## Expected Result

- Parsed fields height is stable during open-state interactions.
- Parsed fields height changes only on close/reopen or direct user resize.
- Recent history and bookmark interactions do not cause panel jumping.
- The outer panel remains scrollable while interacting with parsed fields.
- Minimized mode reduces the panel to one compact viewport-edge button and preserves active page workflows.
- First-open auto-selection avoids page-level visual jank; heavy preview styling is reserved for the explicit `Fill screen` control.
