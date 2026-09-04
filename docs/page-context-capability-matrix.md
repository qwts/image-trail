# Page Context Capability Matrix

Canonical behavior for issue
[#517](https://github.com/qwts/image-trail/issues/517): automatic page-context
detection, explicit overrides, and context-sensitive panel controls.

## Context model

| Context      | Automatic signal                                                                                              | Supported controls                           | Context-specific copy                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------- |
| Single image | Zero or one qualifying image and no feed signal                                                               | Trail Prev/Next, Capture original, Slideshow | Target badge: `Single image`; Grab is hidden                              |
| Gallery page | More than one qualifying image without a feed signal                                                          | Single-image controls plus Grab              | Target badge: `Gallery page · N images`                                   |
| Feed         | A `[role="feed"]` containing at least two qualifying images, or at least two image-bearing `article` elements | Single-image controls plus Grab              | Target badge: `Feed · N images`; Grab hint explains click-to-pin behavior |

A qualifying image uses the same visible-image rules as target selection. Tiny,
hidden, disconnected, or source-less images do not establish a capability.

Context changes presentation and page interaction only. It does not change the
storage model: Recents remain transient; pins remain durable queue records; a
captured original remains separate encrypted blob data linked from its durable
record.

## Override contract

- The fixed page-level switcher always shows the effective context.
- Unsupported contexts are disabled, so an override cannot activate a control
  the current page cannot support.
- The status distinguishes `Automatic` from `Override` and exposes a visible
  `Use automatic` reset while overridden.
- A saved override that becomes unsupported remains saved but inactive. The
  detected context becomes effective and the switcher reports the stale saved
  override without activating its controls.
- Overrides are stored in extension-owned local settings under
  `imageTrail.localSettings.pageContextOverrides`, keyed by normalized hostname.
  Host-page `localStorage` is never used.
- The map retains the 100 most recently updated valid hostname records. Invalid
  context values, timestamps, and scope keys are discarded during migration.

## Transition behavior

- Opening the panel detects the current page before rendering the switcher.
- DOM changes are observed on a trailing edge so an infinite feed or SPA can
  acquire or lose capabilities without a full reload.
- Hostname changes reload the matching saved override. Same-host SPA route
  changes keep the host-scoped preference while recomputing capabilities.
- The target badge, Grab availability, and feed hint update from the same
  effective context state. Stale controls must not remain active after a
  transition.
- Switcher labels and status are generic. They never include a page URL,
  hostname, selector, or detection evidence that could defeat privacy mode.

## Automated acceptance

- Unit/model: `tests/page-context.test.ts`
- Detection DOM: `tests/dom/page-context-detection.test.ts`
- Persistence/controller: `tests/page-context-controller.test.ts`
- Switcher and context-aware controls: `tests/dom/page-context-switcher.test.ts`
  and `tests/dom/manual-controls-view.test.ts`
- Packaged extension: `tests/e2e/page-context.spec.ts`
- Handoff artifacts: `08-context-gallery` and `09-context-feed`

## Manual acceptance

1. Open a standalone-image URL. Confirm `Automatic · Single image`, disabled
   Gallery/Feed overrides, and no Grab control.
2. Open a multi-image gallery. Confirm `Automatic · Gallery page`, the image
   count badge, and Grab availability.
3. Open an infinite or semantic feed. Confirm `Automatic · Feed`, the feed hint,
   and active Grab copy after enabling Grab.
4. Select a supported override, reload, and confirm it persists for that
   hostname. Select `Use automatic` and confirm the stored override is removed.
5. While overridden, transition the page to an incompatible shape. Confirm the
   detected mode becomes effective and incompatible controls are disabled.
6. Compare the switcher, target badge, and Controls section against handoff
   screenshots 08 and 09 at the 924×540 reference viewport.
