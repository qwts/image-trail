# Gallery Search

Purpose: verify that Gallery search matches durable metadata and preserves queue order while never exposing encrypted blob identifiers, URLs, or labels in privacy mode.

## Product Rules

- Search normalizes whitespace and case before matching.
- Search matches durable metadata only; encrypted blob identifiers are never matched or surfaced.
- While privacy mode is active, URL and label terms are hidden from search and its results.
- Search paging preserves queue order within matched results.
- A zero limit is treated as unlimited results.
- Stale offsets are clamped to the final available page.
- Search requests a bounded durable page for small libraries and collects large libraries through multiple bounded pages.
- Search and filters share one durable scan and preserve queue order.
- The search source cache shares in-flight scans and retries after a failed scan.

## Manual Scenario

1. Load the built extension with several durable records carrying metadata and stored originals.
2. Type a query with mixed case and extra whitespace and verify results normalize and match.
3. Search a term derived from an encrypted blob identifier and verify it never matches or appears in results.
4. Enable privacy mode and verify URL/label-derived search terms and result text are hidden.
5. Page through search results and verify queue order is preserved within matches.
6. Set the limit to zero and verify search returns all matches as unlimited.
7. Search while applying metadata filters and verify they share one durable scan.

## Expected Result

- Search is case- and whitespace-normalized over durable metadata only.
- Encrypted blob identifiers and privacy-mode URL/label terms never leak.
- Ordering, paging, and filter composition remain correct and bounded.

Automated evidence:

- `tests/gallery-search.test.ts`
