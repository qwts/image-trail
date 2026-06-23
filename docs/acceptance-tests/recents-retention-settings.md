# Recents Retention Settings

Purpose: verify that recent history stays transient while the extension-owned settings control how many recent rows are shown and how overflow is handled.

## Product Rules

- Recents are transient session state, not durable memory.
- The visible recent-row limit is stored in extension-owned settings.
- Overflow behavior is explicit:
  - `Drop oldest` removes overflow rows from transient session recents.
  - `Keep hidden this session` keeps overflow rows only in service-worker memory and hides rows after the visible limit.
- Pinning, bookmarking, and captured-original semantics remain separate from recents retention.

## Manual Acceptance

1. Open the panel and add several images to Recent history.
2. Open Settings, set `Visible recents` to a smaller number, choose `Drop oldest`, and apply.
3. Verify only that many recent rows remain visible.
4. Reload the panel and add another recent.
5. Verify the oldest overflow rows do not return.
6. Change overflow to `Keep hidden this session`, set a smaller visible limit, and add more recents.
7. Verify only the configured number is shown.
8. Increase `Visible recents` during the same extension session.
9. Verify hidden session recents can reappear up to the new visible limit.
10. Set `Visible recents` smaller again, then click `Show hidden recents`.
11. Verify hidden session recents reappear without reloading the browser extension.
12. Navigate to another site and verify the same setting value applies there.

## Expected Result

- Recents remain site-scoped transient rows.
- The setting is extension-owned and applies consistently across sites.
- Overflow rows are either dropped or hidden in-session according to the selected setting.
- Hidden rows kept for the current session can be shown again from Settings without an extension reload.
- Durable pins/bookmarks/originals are not created or deleted by changing recents retention.
