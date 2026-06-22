# Grab Mode Strategies

Purpose: verify that grabbing uses one shared strategy path from both Shift-click and the panel Grab Mode button, and that
template-specific linked-page extraction stays declarative instead of running user JavaScript.

## Default Clicked-Image Scenario

1. Open a page with multiple qualifying images.
2. Open Image Trail and verify the Host target section shows a `Grab Mode` button.
3. Click `Grab Mode`.
4. Verify the button changes to `Stop Grab Mode` and the Host target copy says Grab Mode is active.
5. Hover a qualifying page image.
6. Verify the image shows the valid Grab preview outline without changing the selected host target.
7. Click the qualifying page image.
8. Verify the image is added to the bookmark queue and recent history through the normal pin/bookmark flow.
9. Verify Grab Mode remains active after the grab.
10. Click another qualifying page image and verify it is also added to the queue.
11. Hover a non-image/invalid area and verify the preview clears or shows invalid feedback without creating a queue item.
12. Press `Shift+G`.
13. Verify Grab Mode stops and the preview outline is cleared.
14. Press `Shift+G` again and verify Grab Mode starts.
15. Click `Stop Grab Mode`.
16. Click another page image without holding Shift and verify no new queue item is added.
17. Shift-click a qualifying page image and verify it uses the same grab behavior, adding the image to the queue.

## Linked-Page Image Scenario

1. On a site with a learned URL template, open Image Trail settings.
2. In the active URL template card, change `Grab strategy` from `Clicked image` to `Linked page image`.
3. Leave the default ordered extractors, or add a site-specific line in `selector@attribute` form such as `#main-image@src`.
4. Close settings.
5. Click `Grab Mode`.
6. Hover a page link whose linked HTML contains an image matching one of the configured extractors.
7. Verify the link/source wrapper shows the valid Grab preview outline.
8. Click the link.
9. Verify Image Trail fetches the linked page, resolves relative image URLs against the linked page URL, and adds the resolved image URL to the durable queue through the normal pin/bookmark flow.
10. Shift-click the same kind of link with Grab Mode off and verify it uses the same linked-page strategy.
11. Configure an invalid selector or click a link whose page has no matching image.
12. Verify Image Trail shows a failure message and does not create a pin.

## Grab Pattern Scenario

1. On a site with images or source/detail/gallery links, open Image Trail settings.
2. Cmd-click an image URL shape or a page link shape that should use a specific grab behavior.
3. Verify settings shows the learned URL under `Grab patterns`, separate from `URL templates`.
4. Set that grab pattern's `Grab strategy` to `Linked page image` when the clicked URL is a page that must be fetched and parsed.
5. Leave the strategy as `Clicked image` when the clicked URL is already the image-like source pattern.
6. Turn on Grab Mode or Shift-click another image/link with the same learned shape.
7. Verify Image Trail uses the learned grab pattern's strategy and adds the intended image to the queue.
8. Remove the grab pattern in settings.
9. Verify the same image/link shape falls back to the normal active/default grab behavior.

## Expected Results

- Grab Mode is sticky until the user turns it off.
- `Shift+G` toggles Grab Mode except while typing in text controls.
- Shift-click remains a one-shot shortcut into the same grab strategy.
- Grab Mode does not change the selected host target image.
- Grab Mode preview uses a page-local outline and does not rerender the panel on pointer movement.
- Valid previews are visually distinct from selected/captured/bookmarked target styling.
- Invalid targets show distinct invalid feedback or clear the preview and do not silently create pins.
- Preview styling clears when Grab Mode is disabled, the pointer leaves the page target, or the panel cleans up.
- Non-qualifying images show a failure message and do not create pins.
- Without an active template strategy, grabbing uses the default clicked-image strategy.
- A template can opt into the linked-page image strategy.
- Linked-page image extraction uses extension-owned trusted code to interpret declarative selector/attribute recipes.
- Linked-page image extraction does not run uploaded JavaScript, `eval`, or user-authored privileged extension code.
- Linked-page fetches are bounded by timeout and maximum response size before parsing.
- Resolved image URLs still pass through the normal queue validation and thumbnail-loading path before becoming durable pins.
- Grab patterns are stored separately from parsed image URL fields and URL templates.
- Cmd-click learning records clicked image/link URL shapes, not increment/decrement image URL fields.
- Matching a grab pattern can activate a linked-page strategy even when the clicked link is not a direct image URL.
- Matching a grab pattern can also preserve an image-like source shape for future strategy work such as URL transforms.
