# Grab Mode Strategies

Purpose: verify that page-image grabbing uses one shared strategy path from both Shift-click and the panel Grab Mode button.

## Scenario

1. Open a page with multiple qualifying images.
2. Open Image Trail and verify the Host target section shows a `Grab Mode` button.
3. Click `Grab Mode`.
4. Verify the button changes to `Stop Grab Mode` and the Host target copy says Grab Mode is active.
5. Click a qualifying page image.
6. Verify the image is added to the bookmark queue and recent history through the normal pin/bookmark flow.
7. Verify Grab Mode remains active after the grab.
8. Click another qualifying page image and verify it is also added to the queue.
9. Press `Shift+G`.
10. Verify Grab Mode stops.
11. Press `Shift+G` again and verify Grab Mode starts.
12. Click `Stop Grab Mode`.
13. Click another page image without holding Shift and verify no new queue item is added.
14. Shift-click a qualifying page image and verify it uses the same grab behavior, adding the image to the queue.

## Expected Results

- Grab Mode is sticky until the user turns it off.
- `Shift+G` toggles Grab Mode except while typing in text controls.
- Shift-click remains a one-shot shortcut into the same grab strategy.
- Grab Mode does not change the selected host target image.
- Non-qualifying images show a failure message and do not create pins.
- The first strategy is the page-image bookmark strategy; future template-specific strategies should plug into the same strategy path.
