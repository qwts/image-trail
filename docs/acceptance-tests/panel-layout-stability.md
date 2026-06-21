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

## Expected Result

- Parsed fields height is stable during open-state interactions.
- Parsed fields height changes only on close/reopen or direct user resize.
- Recent history and bookmark interactions do not cause panel jumping.
- The outer panel remains scrollable while interacting with parsed fields.
