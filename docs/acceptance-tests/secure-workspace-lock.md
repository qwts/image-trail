# Secure Workspace Lock

> Canonical privacy and manual acceptance for [#570](https://github.com/qwts/image-trail/issues/570).

## Security contract

- The encrypted-original session is the single lock authority for the in-page panel, detached windows, rails, Recall, Dashboard, Settings, Gallery, and Preview pages.
- When a key exists but is locked, each protected surface is replaced by one opaque unlock surface. Protected children are unmounted; hiding them with CSS is insufficient.
- Locked DOM, visible text, titles, accessibility names, image elements, URLs, filenames, album names, thumbnails, rows, and out-of-band toasts contain no protected record content.
- The password is dispatched only to the extension-owned unlock request, cleared from the form immediately, and never stored in UI state.
- A wrong password or unavailable runtime remains locked without briefly restoring protected content.
- Manual **Lock workspace** controls use the same session transition and broadcast it to every open extension context.
- Successful unlock restores the prior workspace layout and safely recreated focus target without duplicating a panel or detached section.

## Manual acceptance

1. Create or unlock encrypted storage, pin and capture an image, detach Recent history, open Dashboard and Gallery, and open a decrypted Preview page.
2. Use **Lock workspace** in the panel header.
3. Verify the panel is replaced by one opaque lock dialog. Confirm the panel header, record rows, images, URLs, detached window, rails, Recall content, and toast content are absent from both the visible UI and accessibility tree.
4. Verify Dashboard, Gallery, and Preview change to their lock surfaces without being reloaded. Confirm Gallery cards and the Preview image element are absent from the DOM.
5. Enter a wrong password from one lock surface. Verify an inline alert appears, every surface remains locked, and no protected content flashes.
6. Enter the correct password from Gallery or another lock surface. Verify every open surface restores, the detached section returns with its prior layout, and exactly one in-page panel host exists.
7. Lock again from an extension destination. Verify the panel, all destinations, Gallery, and Preview transition together.
8. Stop the MV3 worker while unlocked, perform an encrypted capture to prove session recovery, then repeat steps 2–6.
9. Repeat with keyboard-only navigation and a screen reader. The lock dialog must be modal, the password and submit controls must be reachable, locked workspace controls must be unreachable, and unlock must return focus to a safely recreated workspace control.

## Automated evidence

- Cross-context message validation and notifier/client behavior: `tests/secure-workspace-lock.test.ts`
- Panel DOM removal, detached-layout restoration, focus, failed unlock, and duplicate prevention: `tests/dom/panel-render-controller.test.ts`
- Destination fail-closed rendering and wrong-password flow: `extension/src/ui/stories/extension-destinations.stories.tsx`
- Worker restart, panel/detached/Dashboard/Gallery/Preview lock, wrong password, and restoration: `tests/e2e/secure-session.spec.ts`
- Coverage ledger: `tests/e2e/coverage-map.json`
