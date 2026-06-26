# Bounded Neighbor Preloading

Purpose: verify that parsed-field navigation can optionally warm nearby image URLs without letting speculative work mutate visible or durable state.

## Expected Behavior

- Neighbor preloading is disabled by default.
- When disabled, parsed-field Previous/Next behavior matches the existing active projection flow.
- When enabled with radius `1`, a successful parsed-field projection from image `10` warms image `9` and image `11` when those URLs can be produced from the active parsed field.
- Speculative preload results are in memory only and must not create Recents, URL review status records, parsed-field restore records, selected-target changes, panel messages, pins, bookmarks, Recall entries, downloads, or captured originals.
- Failed or stale speculative preloads are silent and do not replace the active projection session.
- Rapid direction changes start a newer preload batch and do not create unbounded requests.
- In-radius preload candidates run as parallel background work under the request caps; one slow or failed neighbor must not prevent later neighbors in the same batch from starting.
- Failed speculative preload results are kept only in the bounded in-memory preload cache.
- The preload cache lives only for the current page/panel session. A cache limit of `0` keeps all entries for that page session; a positive limit evicts oldest entries after that many warmed or failed URLs.
- Active Previous/Next can skip over consecutive known failed speculative neighbors within the configured radius. For example, if image `11` through `14` are known failed and image `15` is the next non-failed candidate, Next from image `10` may jump to image `15`.
- Active parsed-field failures are remembered in the same page-session cache so a manually discovered dead neighbor can be skipped by the next in-radius navigation.
- Active Previous/Next checks the page-session preload cache before making a network request and must not wait for a fresh current-image fingerprint fetch before using a warmed target.
- Radius and request caps prevent runaway downloads in either direction.
- Radius is bounded by the Settings control and local-settings migration.

## Manual Test

1. Open a page with a selected image URL that has an incrementable parsed query field, such as `image=10`.
2. Confirm Settings shows neighbor preloading disabled by default.
3. Use parsed-field Previous/Next while disabled.
4. Expected: only the active projected URL loads, and Recents, URL review status, parsed-field markers, and panel messages behave as they did before this feature.
5. Enable neighbor preloading, set radius to `1`, and set cache to `24`.
6. Navigate from `image=10` to `image=11`.
7. Expected: the active projection updates to `image=11`, then the extension silently warms the adjacent parsed-field URLs around `image=11` as parallel background work.
8. Navigate back to a warmed neighbor.
9. Expected: the active navigation may reuse the in-memory preload result; visible state changes only through the active projection path.
10. Rapidly press Previous/Next several times.
11. Expected: newer active projections win; stale speculative loads do not update Recents, URL review status, selected target state, parsed-field restore state, or panel messages.
12. Navigate near missing images in either direction.
13. Expected: failed speculative neighbors are remembered only in memory and do not update Recents, URL review status, selected target state, parsed-field restore state, or panel messages. Later in-radius neighbors should still be able to warm even when earlier neighbors fail.
14. If several consecutive neighbors are known failed and a later in-radius neighbor is not known failed, press Previous/Next toward the failed range.
15. Expected: active navigation skips the known failed range and tries the later in-radius neighbor.
16. Set cache to `0`, navigate through a few warmed or failed neighbors, then navigate back through the same range.
17. Expected: warmed successes and known failures are retained for the page session without oldest-entry eviction.
18. Disable neighbor preloading.
19. Expected: in-memory preload cache is cleared, no further speculative neighbor loads are started, and normal active navigation still works.
