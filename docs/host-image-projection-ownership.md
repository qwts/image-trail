# Host Image Projection Ownership

Issue #180 introduced an explicit projection operation boundary for host-image previews and URL application.

## Ownership Model

A projection operation is the unit of ownership for changing the selected host image. Each operation has:

- `id`
- `reason`
- source URL
- display URL
- selected target handle
- original selected source relationship
- lifecycle status

`ImageTrailPanel` owns projection intent and side effects. `PageAdapter` owns DOM application and native selected-image load/error observation. Load notifications from `PageAdapter` carry the projection id when they belong to an extension projection.

## Lifecycle

Projection sessions use these states:

- `idle`
- `preloading`
- `applying`
- `loaded`
- `failed`
- `canceled`
- `superseded`

Only the active session may commit projection-derived side effects. Stale preload, load, error, thumbnail, parsed-field, URL review, Recents, and message completions must return without mutating current panel state.

## Request Reasons

Projection reasons identify the user or restore path that requested the operation:

- `selected-url-apply`
- `parsed-field-navigation`
- `parsed-field-restore`
- `bookmark-load`
- `record-preview`

Row provenance is intentionally not inferred from `capture/preview`; the action currently carries a URL, optional blob id, and optional scroll anchor, but not whether the row came from Recents, queue, or Recall.

## Side-Effect Rules

- Same-current projection is a no-op/status update.
- Rapid projections are last-request-wins.
- Parsed-field restore may project only through the explicit `parsed-field-restore` reason.
- A parsed-field record keyed to the current browser page URL may replay its saved source in a new tab at that same URL, even when the selected host image source or handle differs from the prior tab.
- Source-based restore fallback remains stricter and still requires source or selected-target compatibility.
- Recents writes from extension-projected loads are gated by the active projection id.
- Native/page image loads can still produce load notifications without a projection id.
- Release/close restores the original host-page image snapshot and remains separate from projection success or failure.
- The projection owner short-circuits repeated identical projection requests when they exceed the loop guard threshold and logs a `console.warn` with the blocked request details.

Out of scope for this slice: Recents persistence, pin/bookmark/Recall storage semantics, original blob/capture ownership, and UI redesign.
