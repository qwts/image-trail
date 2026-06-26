# Bounded Neighbor Preloading

Purpose: verify that parsed-field navigation can optionally warm nearby image URLs without letting speculative work mutate visible or durable state.

## Expected Behavior

- Neighbor preloading is disabled by default.
- When disabled, parsed-field Previous/Next behavior matches the existing active projection flow.
- The neighbor preload distance is per side: a value of `5` means up to five URLs ahead and five URLs behind, not 2.5 each way.
- Neighbor preloading uses only included parsed navigation fields. It must not choose a default numeric URL part on its own.
- When enabled with ahead/behind value `1`, a successful parsed-field projection from image `10` warms image `9` and image `11` when those URLs can be produced from the included parsed field.
- Speculative preload results are in memory only and must not create Recents, URL review status records, parsed-field restore records, selected-target changes, panel messages, pins, bookmarks, Recall entries, downloads, or captured originals.
- Failed or stale speculative preloads are silent and do not replace the active projection session.
- Rapid direction changes start a newer preload batch and do not create unbounded requests.
- In-radius preload candidates run as parallel background work under the request caps; one slow or failed neighbor must not prevent later neighbors in the same batch from starting.
- Preload batches start nearest neighbors first and keep filling the configured ahead/behind buffer with non-failed loaded or loading URLs. Known failed URLs do not count as filled buffer slots, and failed speculative requests must immediately refill from farther candidates in the same direction.
- The manual Preload more button extends the current session buffer by another configured ahead/behind count on every click. It skips URLs already loaded, loading, or failed, so repeated clicks keep adding farther candidates instead of resetting to the same range.
- Rapid Previous/Next presses are queued against the latest parsed-field navigation state. If movement gets ahead of the current preload buffer, later queued movements must catch up from the newest successful image instead of being dropped.
- Active Previous/Next request throttling is configurable by minimum interval, request count, and window length. It must be based on active load requests that start, not on every keyboard event or cached preload reuse.
- Failed speculative preload results are kept only in the bounded in-memory preload cache.
- The preload cache lives only for the current page/panel session. A cache limit of `0` keeps all entries for that page session; a positive limit evicts oldest entries after that many warmed or failed URLs.
- Active Previous/Next can skip over consecutive known failed active or speculative neighbors while filling the configured ahead/behind buffer. For example, if image `11` through `14` are known failed and image `15` is the next non-failed candidate, Next from image `10` may jump to image `15`.
- Active parsed-field failures are remembered in the same page-session cache so a manually discovered dead neighbor can be skipped by the next in-radius navigation instead of falling back to a one-step retry.
- Active Previous/Next checks the page-session preload cache before making a network request and must not wait for a fresh current-image fingerprint fetch before using a warmed target.
- Ahead/behind distance and request caps prevent runaway downloads in either direction.
- Ahead/behind distance is bounded by the Settings control and local-settings migration.

## Manual Test

1. Open a page with a selected image URL that has an incrementable parsed query field, such as `image=10`, and include that field for navigation.
2. Confirm Settings shows neighbor preloading disabled by default.
3. Use parsed-field Previous/Next while disabled.
4. Expected: only the active projected URL loads, and Recents, URL review status, parsed-field markers, and panel messages behave as they did before this feature.
5. Enable neighbor preloading, set Ahead/behind to `1`, and set cache to `24`.
6. Navigate from `image=10` to `image=11`.
7. Expected: the active projection updates to `image=11`, then the extension silently warms the adjacent parsed-field URLs around `image=11` as parallel background work.
8. Navigate back to a warmed neighbor.
9. Expected: the active navigation may reuse the in-memory preload result; visible state changes only through the active projection path.
10. Focus a parsed-field `+` or `-` button, then use the Left/Right arrow keys.
11. Expected: the arrows continue navigating the most recently successful parsed field without requiring focus to return to the page or field input.
12. Rapidly press Previous/Next several times.
13. Expected: requested movements are applied in order from the latest successful parsed-field state; stale speculative loads do not update Recents, URL review status, selected target state, parsed-field restore state, or panel messages.
14. Navigate near missing images in either direction.
15. Expected: failed active and speculative neighbors are remembered only in memory and do not update Recents, selected target state, or panel messages from speculative work. Later neighbors should still be able to warm until the configured ahead/behind buffer has that many non-failed loaded or loading URLs.
16. If several consecutive neighbors are known failed and a later in-radius neighbor is not known failed, press Previous/Next toward the failed range.
17. Expected: active navigation skips the known failed range and tries the later in-radius neighbor.
18. Set cache to `0`, navigate through a few warmed or failed neighbors, then navigate back through the same range.
19. Expected: warmed successes and known failures are retained for the page session without oldest-entry eviction.
20. Click Preload more repeatedly with Ahead/behind set to `5`.
21. Expected: each click adds up to five more preload attempts ahead and five more behind from farther candidates, skipping entries already loaded, loading, or failed.
22. Disable neighbor preloading.
23. Expected: in-memory preload cache is cleared, no further speculative neighbor loads are started, and normal active navigation still works.
