# Row And List Visual System

Purpose: verify that Recents, the visible bookmark queue, and Recall rows share the same visual system without changing row behavior or data ownership.

## Preconditions

- Storybook is running locally.
- Recent history, bookmarks queue, and Recall drawer stories are available.
- Fixture rows include normal, selected, stored-original/captured, locked/private, long-text, missing-thumbnail, and narrow-layout states.

## Steps

1. Open Recent history `Normal`, `Selected`, `PinnedAndCaptured`, `LockedPrivate`, `LongOverflow`, and `Narrow`.
2. Open Bookmarks queue `Normal`, `SelectedQueue`, `CapturedOriginalIndicator`, `LockedPrivate`, `LongOverflow`, and `Narrow`.
3. Open Recall drawer `Normal`, `Selected`, `HasMore`, `Loading`, `Error`, and `Narrow`.
4. Compare row borders, radius, background, hover, focus, selected state, thumbnails, extension labels, and stored-original indicators across all three surfaces.
5. Hover and keyboard-focus previewable rows.
6. Select and clear rows in the interactive stories.
7. Review long filenames and narrow layouts.

## Expected

- Recents, queue rows, and Recall rows read as the same row family.
- Selected state remains more prominent than stored-original/captured state, including while hovered.
- Stored original remains a small indicator and does not become a competing row background.
- Thumbnail and extension-label treatments stay stable across queue and Recall rows.
- Long names truncate without pushing action controls or changing row height unexpectedly.
- Hover and focus affordances do not erase selected state.
- Row actions, selection behavior, Recall paging, Recents transience, durable pin/bookmark semantics, queue ordering, and encrypted-original storage behavior are unchanged.
