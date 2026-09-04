# Recents Retention Settings

Purpose: verify that recent history stays transient while the extension-owned settings control how many recent rows are shown and how overflow is handled.

## Product Rules

- Recents are transient browser-session state, not durable memory. They survive
  MV3 service-worker suspension through `chrome.storage.session` and clear when
  the browser session ends.
- The visible recent-row limit and max kept recent-row limit are stored in extension-owned settings.
- Overflow behavior is explicit:
  - `Drop oldest` removes overflow rows from transient session recents.
  - `Keep hidden this session` keeps overflow rows only in browser-session storage, hides rows after the visible limit, and drops rows past `Max kept recents`.
  - `Auto-pin overflow` is opt-in and sends each overflow row through the normal durable pin-save path. It follows the encrypted-pin preference and its locked plaintext fallback, never captures original bytes, and retains a row in session storage when the durable save fails.
- Auto-pin does not re-save an already durable URL, so recognizing an existing pin must not change queue order or reseal metadata.
- `Review recent session` temporarily reveals retained overflow up to `Max kept recents`. `Finish review` returns to the configured visible limit. Review mode is not a persisted setting.
- Pinning, bookmarking, and captured-original semantics remain separate from recents retention except for the explicit `Auto-pin overflow` promotion policy; promotion creates only the durable pin, never a captured original.

## Manual Acceptance

1. Open the panel and add several images to Recent history.
2. Open Settings, set `Visible recents` to a smaller number, choose `Drop oldest`, and apply.
3. Verify only that many recent rows remain visible.
4. Reload the panel and add another recent.
5. Verify the oldest overflow rows do not return.
6. Change overflow to `Keep hidden this session`, set a smaller visible limit, set `Max kept recents` higher than the visible limit, and add more recents.
7. Verify only the configured number is shown.
8. Increase `Visible recents` during the same extension session.
9. Verify hidden session recents can reappear up to the new visible limit.
10. Set `Visible recents` smaller again, then click `Review recent session`.
11. Verify hidden session recents reappear without reloading the browser extension, but never beyond `Max kept recents`. Verify no row is pinned, bookmarked, captured, or added to Recall by entering review mode.
12. Click `Finish review` and verify the list returns to `Visible recents`. Reopen Settings and verify both retention limits and the overflow behavior are unchanged.
13. Navigate to another site and verify the same setting value applies there and review mode is no longer active.
14. Stop or idle out the extension service worker, reopen the panel, and verify
    the retained Recents and their order are unchanged.
15. Choose `Auto-pin overflow`, set `Visible recents` lower than `Max kept recents`, and add enough new images to overflow the visible limit.
16. Verify the oldest overflow row leaves Recents and appears at the Queue front as a durable pin. Verify it has no stored-original indicator and still offers the explicit `Capture` action.
17. Repeat once with encrypted pin saves preferred and unlocked, then once with plaintext preferred. Verify the resulting pin storage follows that preference. Lock encrypted pin storage while encrypted saves remain preferred and verify the fallback status truthfully reports a plaintext save.
18. Make durable saving fail, add another overflow row, and verify the row remains available in the browser-session Recents store for retry rather than being dropped.
19. Pin a URL normally, note its Queue position and metadata, then make the same URL an auto-pin overflow candidate. Verify it is removed from Recents without being re-saved, reordered, or resealed.
20. End the browser session, start a new one, and verify Recents are empty while
    durable pins/bookmarks/originals remain.

## Expected Result

- Recents remain site-scoped transient rows.
- The visible and max kept settings are extension-owned and apply consistently across sites.
- Overflow rows are dropped, hidden in-session, or explicitly promoted to durable pins according to the selected setting.
- Hidden rows kept for the current session can be reviewed without an extension reload, up to the max kept setting, and `Finish review` restores the visible limit.
- Session review neither changes retention settings nor creates durable queue, Recall, or original records.
- Auto-pin uses the normal durable save preference and locked fallback, never captures original bytes, retains failed promotions in session, and leaves existing durable queue order unchanged.
- Service-worker suspension does not end the browser session or clear Recents.
- A new browser session starts with no Recents.
- Durable pins are created only by the explicit auto-pin policy; captured originals are never created or deleted by changing recents retention.
