# Workspace Rails Cross-Site Safety

> Canonical hardening and manual acceptance for issues [#506](https://github.com/qwts/image-trail/issues/506), [#521](https://github.com/qwts/image-trail/issues/521), and [#522](https://github.com/qwts/image-trail/issues/522). The production boundary is [ADR-0003](../adr/0003-workspace-rails-and-host-reflow-boundary.md).

## Supported layout matrix

Workspace rails are extension-owned overlays. They do not inset, wrap, transform, resize, or otherwise reflow host content.

| Host condition                                            | Supported behavior                                                   | Required fallback or cleanup                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Static or responsive root                                 | Floating windows and admissible left/right/top/bottom rails          | Host geometry, media-query behavior, and page dimensions stay unchanged        |
| Fixed or sticky chrome                                    | Overlay rail; physical overlap is possible by design                 | Uncovered host controls keep their original hit targets and positions          |
| Infinite feed or SPA root replacement                     | Workspace remains extension-owned through in-page updates            | Full navigation tears down the old workspace; reopen starts one clean instance |
| Nested scrolling                                          | Rail overflow stays inside the rail                                  | Page and nested scroll offsets stay unchanged                                  |
| RTL                                                       | Physical left/right edges keep explicit labels and keyboard commands | No logical-edge remapping                                                      |
| Iframe presence                                           | Parent-page overlay only                                             | No iframe DOM or ancestry mutation                                             |
| Transformed root or custom containing block               | Visual-viewport overlay                                              | No wrapper, margin, inset, or transform applied to the host root               |
| Browser fullscreen                                        | The fullscreen top layer owns rendering and hit testing              | Workspace is usable again after fullscreen exits                               |
| 200% zoom equivalent, narrow viewport, or competing rails | A rail is admitted only with a 640×480 center corridor               | Section falls back to a clamped floating window or attached panel              |
| Reduced motion                                            | Same preview, announcement, focus, and state result                  | Animated travel is removed                                                     |
| Coarse pointer                                            | 16px detach threshold, 56px edge magnet, 44px chrome controls        | Pointer cancel restores the pre-gesture state                                  |

## Approved deviations from the handoff

- The handoff prototype reflows a simulated host. Production uses overlay rails because arbitrary site roots, fixed chrome, nested scrollers, frames, responsive queries, and SPA replacement cannot be rolled back safely with a general reflow heuristic.
- Reference rail geometry remains 344px for left/right and 240px for top/bottom, but the center-corridor gate can reject it and use a floating/attached fallback.
- Rails use physical edges in RTL so labels, previews, persisted values, and keyboard commands remain deterministic.
- Fullscreen content owns the browser top layer; Image Trail does not inject itself into the host's fullscreen subtree.
- Workspace restoration is opt-in and installation-local. Only a versioned layout record under an HMAC-derived opaque key is stored; raw URL, hostname, record content, Recents, and private page metadata are excluded.

## Manual acceptance

Use a packaged local build and a normal host page with at least two qualifying images so the separate standalone-image preview behavior is not engaged.

1. At a 1440×900 CSS viewport, record the page and nested-scroll offsets, body and root inline styles, page dimensions, selected text, a fixed element, a sticky element, and an uncovered host control's hit target.
2. Open Image Trail. Detach Recent history, Queue, and Controls. Verify each section has one instance and the attached placeholder remains in its original slot.
3. Shade and unshade a floating window. Snap it to every physical edge with pointer and keyboard. Reorder two cards, unsnap one, cancel one drag with Escape or pointer cancel, and restore one to the panel.
4. Verify keyboard focus moves to the active workspace control, restore returns focus to the detach control, and live announcements name the section, shade state, physical edge, and stack position.
5. Repeat with reduced motion and a touch/coarse-pointer device emulation. Confirm the result remains visible, workspace chrome is at least 44×44 CSS pixels, and a canceled gesture commits no stale geometry.
6. Repeat at a 720×450 CSS viewport (200% zoom equivalent) and then 360×740. A now-invalid rail must become a fully reachable floating window or attached section; no window may open offscreen.
7. Exercise responsive, fixed/sticky, long/infinite feed, nested-scroll, RTL, iframe, transformed-root, SPA update, full navigation, and host fullscreen cases. Verify no host root is wrapped or restyled, uncovered hit testing stays on the host, and fullscreen owns its top layer.
8. Close the panel. Compare every baseline from step 1 exactly. Verify no Image Trail host, rail, floating window, preview, selection marker, handle, lock-box attribute, listener behavior, or page offset remains.
9. Enable **Restore workspace layout per site**, arrange and shade/snap windows, reload the source page, and fully restart the extension. Verify the layout restores under an opaque `workspace-layout:v2:` key and storage contains no raw URL, hostname, query value, image URL, record content, or Recents.
10. Reset workspace layout. Verify all sections return attached and the v2 record is removed. A stale/corrupt record or install secret must fail to the usable transient default without exposing stored payload details.
11. Compare floating, shaded, railed, and restored chrome with `11-detached-windows.png`. Check title hierarchy, grips, edge label, controls, borders, glow, spacing, and readable overflow. Safety fallbacks take precedence over prototype geometry.

## Troubleshooting

| Symptom                                          | Check                                                                   | Expected resolution                                                                                                |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Rail disappears after resize or zoom             | Measure the remaining CSS-pixel center corridor                         | This is the designed safety fallback; use the clamped floating window or enlarge the viewport                      |
| Host content is covered                          | Confirm no host style or ancestry changed and test an uncovered control | Overlay occlusion is possible; move/unsnap/shade the rail. General host reflow is not supported                    |
| Layout does not restore                          | Confirm the opt-in setting, same install profile, and a valid v2 record | Restoration is off by default and installation-local; corrupt/stale state falls back transiently                   |
| Drag remains active or geometry jumps            | Trigger Escape/pointer cancel, minimize/close, then reopen              | Preview/listeners must clear and pre-gesture geometry must remain                                                  |
| Page looks dark or the target fills the viewport | Check whether the page has exactly one qualifying image                 | That is the separate standalone-image preview contract; use a multi-image page for workspace host-baseline testing |
| Panel appears missing in host fullscreen         | Exit fullscreen                                                         | The host fullscreen element owns the browser top layer; the workspace returns after exit                           |
| E2E first run shows hidden panel roots           | Rerun the failing spec serially with `--workers=1`                      | Treat as a regression only if the documented cold-start race reproduces serially                                   |

## Automated evidence

- Host layouts and exact baseline: `tests/e2e/workspace-host-layouts.spec.ts`
- Navigation, teardown, minimize, and interrupted drag: `tests/e2e/workspace-lifecycle.spec.ts`
- Accessibility, reduced motion, touch, zoom, narrow, and fullscreen: `tests/e2e/workspace-accessibility.spec.ts`
- Private extension-restart restore and reset: `tests/e2e/workspace-reload-persistence.spec.ts`
- Floating, shaded, railed, and restored artifacts: `tests/e2e/workspace-visual-states.spec.ts`
- Schema, migration, corruption, mutation ordering, and geometry: `tests/workspace-layout*.test.ts`, `tests/workspace-rails-feasibility.test.ts`
- Coverage ledger: `tests/e2e/coverage-map.json`
