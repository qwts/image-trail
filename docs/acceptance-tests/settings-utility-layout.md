# Settings Utility Layout

Purpose: verify that utility-heavy controls live behind Settings while the main panel remains focused on image navigation and queue work.

## Product Rules

- The main panel should not always show backup/import/export and encrypted-original utility controls.
- Settings should expose encrypted originals, key backup, image import/export, history/bookmark import/export, and URL review status import/export together.
- Moving these controls into Settings must not change the underlying storage, export, import, capture, download, or selection behavior.
- Collapsible utility sections should keep their open/closed state while unrelated settings controls rerender the panel.

## Manual Scenario

1. Open Image Trail with Settings closed.
2. Verify the main panel shows status, URL/target controls, fields, navigation/capture controls, Recents, and the bookmark queue without always showing encrypted-originals or import/export utility sections.
3. Open Settings from the title bar.
4. Verify Settings shows related controls grouped into collapsible sections rather than one section per control.
5. Verify `Encrypted originals`, `Image utilities`, and `Import / Export` remain collapsible Settings sections.
6. Expand each settings utility section, click controls inside it, and verify the section keeps its open/closed state across the resulting panel rerender.
7. Collapse `Encrypted originals`, then change a different setting such as `Privacy mode` or `Visible pins`.
8. Verify `Encrypted originals` stays collapsed after the panel rerenders.
9. Reopen `Encrypted originals` and verify key setup/unlock/backup controls are still available.
10. Verify image import/export and history/bookmark/URL review import/export controls are still available from Settings.
11. Close Settings and verify the utility sections are hidden again without changing Recents, bookmark queue, Recall, stored originals, or selections.

## Expected Result

- Utility controls are findable from Settings without cluttering the normal image workflow.
- Existing import/export, key backup, encrypted originals, and image transfer actions remain available and unchanged.
