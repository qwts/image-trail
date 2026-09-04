# ADR-0003: Workspace Rails and Host Reflow Boundary

## Status

Accepted — 2026-07-14

Tracking: [#520](https://github.com/qwts/image-trail/issues/520)  
Implementation: [#521](https://github.com/qwts/image-trail/issues/521)  
Hardening: [#522](https://github.com/qwts/image-trail/issues/522)
Parent: [#506](https://github.com/qwts/image-trail/issues/506)

## Context

The updated handoff demonstrates detachable sections that can shade to a title bar, snap into left/right/top/bottom edge rails, stack, and restore per URL structure. Its prototype owns a simulated host page, so it can safely inset that page when rails appear. The extension runs inside arbitrary documents whose responsive rules, framework roots, fixed and sticky elements, scroll containers, frames, custom elements, and navigation lifecycles it does not own.

Issue #520 compared overlay rails, page-root inset/margin, wrapper insertion, CSS transforms, and site-specific adapters. Disposable browser fixtures covered static and responsive layouts, fixed/sticky chrome, infinite feeds, nested scrolling, iframes, transformed roots, fullscreen-like surfaces, CSS viewport reduction equivalent to zoom, RTL, SPA roots, and Shadow DOM.

The handoff values are treated as hypotheses:

- 8 CSS pixels before a fine-pointer drag detaches;
- 40 CSS pixels for fine-pointer edge magnetism;
- 344 CSS pixels for left/right rails;
- 240 CSS pixels for top/bottom rails;
- layout persistence by URL structure.

## Decision

### Safe production subset

Ship extension-owned **overlay rails** as the only general rail mode. A rail is rendered inside the extension's Shadow DOM, positioned against the visual viewport, and never changes host styles, DOM ancestry, scroll state, or focus.

No host-page reflow ships in #521. Page-root inset/margin, wrapper insertion, and transforms are rejected as general strategies. Site-specific reflow remains a future capability that requires a separately reviewed adapter, adapter-specific fixtures, explicit supported conditions, and exact rollback evidence. No adapter was approved by #520.

Unsupported or constrained pages retain usable attached or floating sections. They do not receive a degraded host mutation.

### Strategy evidence

| Strategy          | Evidence                                                                                                                           | Decision                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Extension overlay | Extension surfaces leave host geometry, scroll, focus, styles, and ancestry unchanged.                                             | General default and fallback. |
| Root inset/margin | Reduces normal-flow space but viewport media queries still match the full viewport; fixed/sticky chrome can remain under the rail. | Rejected for general use.     |
| Wrapper insertion | Changes direct-child selectors, framework-root ancestry, mutation records, and positioning containing blocks.                      | Rejected.                     |
| CSS transform     | Changes paint geometry while layout width, media queries, scroll bounds, and fixed/sticky behavior remain unchanged.               | Rejected.                     |
| Site adapter      | Can coordinate a known content root and known chrome, but only for an explicitly supported site/version with exact rollback.       | Deferred; not part of #521.   |

### Layout-condition evidence

| Condition                       | General reflow failure or uncertainty                                       | #521 behavior                                                      |
| ------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Static flow                     | A root inset can work, but this does not prove other page contracts.        | Overlay rail.                                                      |
| Responsive/media queries        | Root width and viewport query width disagree.                               | Overlay rail.                                                      |
| Fixed/sticky chrome             | Elements can remain in or cross the reserved edge.                          | Overlay rail.                                                      |
| Infinite feed                   | Measurements and roots change continuously.                                 | Overlay rail.                                                      |
| Nested scroll                   | Root mutation does not reserve space inside the actual scroller.            | Overlay rail.                                                      |
| Iframe                          | A parent mutation cannot safely reflow cross-origin child content.          | Overlay rail.                                                      |
| Transformed root                | Containing blocks and fixed positioning are already non-default.            | Overlay rail.                                                      |
| Fullscreen                      | Fullscreen ownership and visual viewport can exclude the extension surface. | Attached/floating fallback when a rail is not visible or usable.   |
| Zoom/small CSS viewport         | Reference rails can leave too little usable center area.                    | Geometry gate; attached/floating fallback.                         |
| RTL                             | Physical edge and logical flow direction must not be conflated.             | Explicit physical edge labels and deterministic keyboard commands. |
| SPA navigation/root replacement | A mutated root can be replaced without a safe restore point.                | Overlay rail survives through the extension controller only.       |
| Shadow DOM/custom elements      | Host internals and scroll roots are not generally inspectable or mutable.   | Overlay rail.                                                      |

### Geometry and input thresholds

Keep the 344px side and 240px block rail sizes for visual fidelity. Admit a requested rail layout only when subtracting its occupied physical edges from the current CSS viewport leaves at least a 640px by 480px center corridor. This is a usability and occlusion gate even though the host is not reflowed.

Concrete outcomes:

| CSS viewport                                         | Requested rails                    | Remaining corridor | Result                      |
| ---------------------------------------------------- | ---------------------------------- | ------------------ | --------------------------- |
| 1440×900                                             | one side                           | 1096×900           | Allowed.                    |
| 1440×900                                             | both sides                         | 752×900            | Allowed.                    |
| 1024×768                                             | both sides                         | 336×768            | Floating/attached fallback. |
| 1024×768                                             | one top                            | 1024×528           | Allowed.                    |
| 1024×768                                             | top and bottom                     | 1024×288           | Floating/attached fallback. |
| 800×600                                              | one side                           | 456×600            | Floating/attached fallback. |
| 1440×900 device viewport at 200% CSS zoom equivalent | one side in a 720×450 CSS viewport | 376×450            | Floating/attached fallback. |

Thresholds are measured in CSS pixels after pointer capture:

| Input          | Detach/unsnap | Edge magnet | Contract                                         |
| -------------- | ------------: | ----------: | ------------------------------------------------ |
| Fine pointer   |           8px |        40px | Preserves the handoff.                           |
| Coarse pointer |          16px |        56px | Reduces accidental detach/snap.                  |
| Keyboard       |   Not spatial | Not spatial | Explicit edge commands; never requires dragging. |

A sub-threshold fine/coarse pointer movement remains the existing click path. Reduced motion removes animated travel but not preview or state feedback.

## #521 Production Contract

### State and schema

The controller owns one serializable workspace record. React is not a second store.

```ts
interface WorkspaceLayoutV2 {
  schemaVersion: 2;
  persistenceKeyVersion: 1;
  panel: { position: { x: number; y: number } | null };
  sections: Record<
    string,
    {
      mode: 'attached' | 'floating' | 'railed';
      edge: 'left' | 'right' | 'top' | 'bottom' | null;
      order: number | null;
      shaded: boolean;
      collapsed: boolean;
      floatingRect: {
        x: number;
        y: number;
        width: number;
        height: number;
      } | null;
    }
  >;
}
```

- `mode` is exclusive. A section has one registry identity and one rendered instance.
- `edge` and `order` are meaningful only for `railed`; `floatingRect` is meaningful only for `floating` but may retain the last valid floating rectangle for unsnap.
- Shade is title-bar-only presentation and is distinct from section collapse and whole-panel minimize.
- Restore sanitizes finite geometry, known enum values, and current registry section IDs. Unknown/removed IDs are ignored; newly added IDs use registry defaults.
- Panel position restores independently, clamps to the current visual viewport, and never causes host-page movement.
- Queue, Recall, Recents, original-store, record content, URLs, and page metadata are not part of this schema.

### Persistence key and migration

Select a per-install, privacy-safe derived URL-structure key:

1. Normalize the current origin, path-segment shapes, sorted query names, and query value shapes in memory. Dynamic numeric, UUID, long-hex, and opaque path tokens are replaced with type markers. Query values are represented only by shapes such as number, boolean, UUID, URL, empty, or text.
2. Derive `HMAC-SHA-256(installSecret, normalizedStructure)`.
3. Store only `workspace-layout:v2:<base64url digest>` as the record key. Do not persist the normalized input, raw URL, hostname, query value, or page-derived label.
4. Generate and keep `installSecret` in an extension-owned repository. Never expose it to the host page or use host `localStorage`.

Migration is write-before-delete:

1. Look up v2 first.
2. When v2 is absent, read the existing `workspace-layout:<hostname>` record only as a migration source.
3. Sanitize its allowlisted section/layout fields into v2, write v2, and delete the legacy record only after the v2 write succeeds.
4. If generation, derivation, sanitization, or writing fails, keep the legacy record, use session-transient layout, and retain overlay/floating usability.
5. Reset deletes both the current derived v2 record and the matching legacy hostname record. Turning restore off does not silently delete either record.

The key algorithm and layout schema are independently versioned so a later normalization change cannot be mistaken for a layout migration.

### Snap, stack, preview, and collision

- Pointer snap activates only while the title/detach surface owns pointer capture and the rail geometry gate passes.
- A visible extension-owned preview identifies the physical edge and insertion order before drop. Invalid rail geometry shows a floating fallback preview and an accessible reason.
- Keyboard commands provide: move to floating window, move to each allowed physical edge, move earlier/later within the edge, shade/unshade, restore to panel, and cancel.
- Rail order is deterministic: persisted integer order, then registry order/section ID as the stable tie-breaker. Reordering compacts indexes.
- Moving a section between edges removes it from the old stack before inserting it into the new stack. Duplicate membership is impossible.
- Rail overflow scrolls inside the extension-owned rail. It never scrolls or resizes the page. Shaded title bars remain operable.
- Dragging a railed title past the input's detach threshold unsnaps to the last valid floating rectangle, clamped around the pointer. Cancel restores the pre-drag edge/order.
- Floating windows and the main panel clamp to the visual viewport on restore, resize, zoom, and visual-viewport changes. Rail admission is recalculated; a now-invalid rail becomes floating if a valid rectangle exists, otherwise attached.
- The main panel and rail stacks are separate extension surfaces. Their collision resolution cannot move host content.

### Recall, scroll, focus, and renderer boundary

- Recall remains positioned relative to the main panel and remains a queue-producer view. It is not a rail member, independent blob browser, clone of visible queue state, or Recents producer.
- Mode changes capture approved extension scroll offsets and a focus token before rendering, then restore them after the same section instance is placed in its new host. Page scroll is never readjusted as rail behavior.
- Pointer cancel/Escape restores the pre-drag position. Restore-to-panel returns focus to the section's detach control. Keyboard moves announce section, edge/order, shade state, and fallback through an `aria-live` region.
- React renders extension-owned attached sections, floating windows, rail stacks, title bars, and previews. Controllers own geometry, pointer coordination, persistence, migration, viewport observation, and mutation policy.
- React never renders a host-page node, owns no parser/queue/Recall repository, and creates no React-only section state channel. Portals or roots have explicit mount/unmount ownership.

### Teardown and failure behavior

On close, unsnap, navigation, error, extension reload, or controller teardown:

- release pointer capture and remove document/window listeners;
- cancel animation frames, timers, pending previews, and viewport observers;
- flush or explicitly cancel the debounced extension-owned layout write;
- unmount extension roots/portals and remove rails, windows, previews, and live regions;
- leave page styles, attributes, DOM ancestry, focus, and scroll exactly as found.

Because #521 performs no host mutation, host rollback is a deliberate no-op. Any future site adapter must implement an idempotent `apply()`/`rollback()` lifecycle, snapshot every value it changes, and prove exact restoration in adapter-specific browser tests before it can alter this ADR's production boundary.

## Evidence and validation

- Unit evidence: `tests/workspace-rails-feasibility.test.ts`
- Controller and persistence evidence: `tests/workspace-layout-controller.test.ts`, `tests/workspace-layout-repository.test.ts`, `tests/workspace-layout.test.ts`
- Browser fixtures: `tests/e2e/workspace-rails-spike.spec.ts`, `tests/e2e/workspace-host-layouts.spec.ts`, `tests/e2e/workspace-lifecycle.spec.ts`, `tests/e2e/workspace-accessibility.spec.ts`, `tests/e2e/workspace-reload-persistence.spec.ts`, `tests/e2e/workspace-visual-states.spec.ts`
- Acceptance coverage map: `tests/e2e/coverage-map.json`
- Manual matrix and troubleshooting: [Workspace Rails Cross-Site Safety](../acceptance-tests/workspace-rails-cross-site-safety.md)

The #520 spike remains test/documentation only. #521 implemented the React workspace renderer, overlay rails, and private v2 persistence contract. #522 hardens teardown, failed storage operations, interrupted gestures, host hit testing, accessibility, viewport fallback, restart restoration, and cross-site acceptance without adding a host-reflow mode.

## Consequences

- #506 is narrowed to overlay rails while preserving the handoff's detach, shade, snap, stack, and restore workflow.
- #521 implements the screenshot composition without making arbitrary pages responsible for extension layout; #522 proves that boundary across the supported matrix.
- A site-specific adapter can be proposed later, but it is opt-in architecture work with its own evidence, not a heuristic general fallback.
- The derived key improves privacy but is installation-local; cross-install workspace-layout portability is not promised.
