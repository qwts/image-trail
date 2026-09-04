# Settings Action Hierarchy

Purpose: verify that Settings utility actions are grouped by workflow and that routine, clearing, and destructive actions are not visually mixed together.

## Product Rules

- Routine export/import actions should be grouped apart from clear or delete actions.
- Clear actions should be labeled by scope and visually separated from export/import actions.
- Destructive actions should remain in Settings, keep confirmation behavior, and not look like primary workflow actions.
- Grouping must not change dispatched actions, keyboard behavior, modifier behavior, import/export payloads, storage behavior, selections, Recents, pins, Recall, thumbnails, downloads, or originals.

## Manual Scenario

1. Open Image Trail and open Settings.
2. In `Image utilities`, verify image file import actions are grouped separately from selection/download export actions.
3. In `Import / Export`, verify record export actions are grouped separately from URL review status clear actions.
4. Verify URL review status clear buttons still show explicit scopes: current site, current page, selected URL, and all review status.
5. Verify `Import / Export` does not show retired legacy migration controls as a normal record action or advanced action.
6. In `Encrypted originals`, verify key backup actions, maintenance actions, and key removal actions are visually distinct when available.
7. Click `Clear key` once and verify it requires a second confirmation click before dispatching the destructive clear action.
8. Exercise one routine export/import action and one clear action in a test profile; verify the same status messages and data behavior as before.

## Expected Result

- Utility actions scan by workflow instead of appearing as one long mixed button list.
- Clear and destructive actions remain available but do not compete with routine import/export paths.
