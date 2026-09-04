# Recents Scope Selector

Purpose: verify that transient Recents can be viewed for the current page,
current site, or all sites without becoming durable history.

## Product Rules

- Page scope uses origin plus path and ignores query/hash fragments.
- Site scope uses the page hostname and is the default.
- All-sites scope preserves global insertion order and deduplicates matching IDs
  and URLs.
- A scope change invalidates an older in-flight load or mutation response; stale
  results must not overwrite the newly selected scope.
- Recents live only for the browser session. `chrome.storage.session` preserves
  them across MV3 service-worker suspension without making them durable.
- Pins/bookmarks remain durable queue records and are not Recents storage.

## Manual Acceptance

1. Open Image Trail on two paths of one site and load a different image on each.
2. Open it on a second site and load another image.
3. Select **Page** and verify only the current origin/path rows appear.
4. Select **Site** and verify both rows from the current hostname appear.
5. Select **All sites** and verify all three rows appear newest-first with no
   duplicate URL or ID.
6. From All sites, pin a row from the other site and immediately select Site.
7. Verify the Site list remains selected and is not overwritten by the late pin
   response.
8. Stop or idle out the extension service worker, then reopen the panel.
9. Verify the Page/Site/All sites rows and order are unchanged.
10. End the browser session and start a new one.
11. Verify Recents are empty and durable pins/bookmarks/originals remain.

## Automated Coverage

- `tests/recent-history-cache.test.ts`: page/site keys, global order,
  deduplication, mutation behavior, and cache recreation over one session store.
- `tests/dom/record-library-controller.test.ts`: stale all-scope pin responses
  cannot overwrite a later scope.
- `tests/e2e/recents-scope.spec.ts`: packaged Page/Site/All sites behavior.
- `tests/e2e/recents-worker-session.spec.ts`: packaged service-worker termination,
  recreation, and Recents restoration inside one browser session.
- `tests/invariants.test.ts`: production composition uses session storage and
  continues to reject durable Recents storage.
