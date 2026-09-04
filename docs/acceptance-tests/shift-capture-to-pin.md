# Acceptance Test: Shift-Modified Capture And Pin

Issue: [#756](https://github.com/qwts/image-trail/issues/756)

## Purpose

Verify that Image Trail presents one primary current-image control without blurring the product boundary between durable metadata pins and separately captured encrypted original bytes.

## Product contract

- The primary control is **Capture** by default and captures an original only after trusted activation.
- Holding Shift outside editable controls and durable-record rows changes that control to **Pin** without firing an action. Releasing Shift restores **Capture**.
- Keyup, browser-window blur, hidden-document state, and panel keyboard shutdown clear the transient modifier so the control cannot remain stuck on **Pin**.
- Shift input inside an input, textarea, select, content-editable surface, or durable-record row remains native and does not change the primary control.
- Activating transient **Pin**, or using the existing **P** shortcut, writes metadata to the durable Queue without capturing original bytes. **C** remains the explicit capture shortcut.
- Queue does not duplicate the current-image Pin action. Its controls operate on durable queue records and Recall.
- Pin and Capture continue to use the trusted-activation boundary; synthetic events cannot invoke either privileged action.
- Pinning does not add a transient Recent. Successful explicit capture may add its separately owned session Recent through the existing capture flow.
- Pin creation establishes `queueUpdatedAt`; later original or metadata refreshes do not reorder the Queue merely by changing encrypted-envelope metadata.

## Automated evidence

- `tests/dom/keyboard-router.test.ts` covers editable exclusions, deduplicated Shift state, and keyup, blur, visibility, and disable cleanup.
- `tests/dom/manual-controls-view.test.ts` covers default Capture, transient Pin, trusted dispatch, and the discoverable C, Shift, and P hint.
- `tests/dom/bookmarks-view.test.ts` proves Queue omits the duplicate current-image Pin action while its durable controls remain available.
- `tests/action-dispatch.test.ts` retains the registered `pin/current` route while removing the unused duplicate alias.
- `extension/src/ui/components/manual-controls-view.stories.ts` exposes both production control states for visual review.
- Packaged Chromium flows use the Shift-modified control when they need to pin the current image, covering original preservation, Queue/Recall, detached Queue, secure-session, media, and import/export behavior.

## Manual packaged-extension script

1. Load a baseline package on a page with a selected image. Confirm the primary control reads **Capture** and Queue has no **Pin current** button.
2. Hold Shift over the host page or a non-editable panel control. Confirm **Capture** changes to **Pin** without adding a Queue row or Recent.
3. Release Shift. Confirm the control immediately returns to **Capture**.
4. Repeat the modifier and then blur the browser window, switch away so the document becomes hidden, and close/reopen the panel. Confirm each path restores **Capture**.
5. Focus a text input, textarea, select, or content-editable host element and type with Shift. Confirm native editing continues and the primary control does not change.
6. Hold Shift and activate **Pin**. Confirm one durable metadata row appears at the Queue front, no stored-original indicator appears, and Recents is unchanged.
7. Press **P** on a non-editable surface. Confirm the same metadata-only result. Press **P** in an editable surface or focused Queue row and confirm it remains native.
8. Activate default **Capture**, then repeat with **C**. Confirm capture remains explicit and reports honest locked, permission, progress, and success states; only success links separately stored encrypted original bytes.
9. Confirm selected-target styling and stored-original indication remain visually distinct throughout.
10. Reload the extension session. Confirm durable Queue pins remain, Recents do not persist, and the primary control starts in **Capture** state.

## Required invariants

- Recents remain transient session state and are never persisted by Pin.
- Queue order remains based on `queueUpdatedAt`, not encrypted-envelope `updatedAt`.
- Captured original bytes remain separate from durable record metadata and stay encrypted.
- Extension-owned state never uses host-page `localStorage`.
- Release and baseline manifests remain free of `nativeMessaging`.
