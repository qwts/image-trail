# Acceptance Test: Per-Site Capture Rules

Issue: [#211](https://github.com/qwts/image-trail/issues/211)

## Purpose

Verify that Image Trail can remember a conservative, exact-host Grab preference without turning a site rule into automatic capture or weakening the boundary between durable Queue metadata and encrypted original bytes.

## Product contract

- No saved rule means every explicit Grab click creates a metadata-only Queue pin.
- A rule matches one normalized hostname only. It does not match parent domains, subdomains, paths, ports, or wildcard patterns.
- `Pin metadata only` retains the conservative behavior explicitly.
- `Pin + capture encrypted original` still requires an explicit Grab Mode click. It pins the durable Queue row first and only then sends the image through the existing encrypted-original capture flow.
- The default Capture action and its Shift-modified Pin state keep their existing meanings.
- A capture failure, locked key, or denied permission leaves the durable pin intact and reports the existing honest capture recovery state.
- A successful capture links the separately stored encrypted original to the Queue record without changing `queueUpdatedAt` merely for the metadata refresh.
- The follow-on Recent is transient session state. The rule is extension-owned local settings state and never uses host-page `localStorage`.
- Privacy Mode masks saved hostnames in both Settings surfaces.

## Automated evidence

- `tests/site-capture-rules.test.ts` covers conservative defaults, exact normalized matching, malformed/wildcard rejection, migration, reversal, and the 100-rule bound.
- `tests/panel-subscriptions.test.ts` proves the explicit Grab sequence is durable pin, optional capture, then transient Recent creation.
- `tests/captured-originals-controller.test.ts` proves only an exact opted-in page hostname reaches bookmark capture.
- `tests/panel-settings-controller.test.ts` covers extension-owned persistence and removal without unrelated setting drift.
- `tests/dom/manual-controls-view.test.ts` covers inspectable trusted-site Grab copy.
- `tests/dom/extension-destination-surfaces.test.tsx` and `tests/dom/settings-view.test.ts` cover standalone/source-panel controls and Privacy Mode masking.
- `extension/src/ui/components/manual-controls-view.stories.ts` exposes the trusted-site state for visual review.

## Manual packaged-extension script

1. Load a baseline package in a fresh Chromium profile and open a multi-image page at `images.example.test` (or another controlled exact hostname).
2. Turn on Grab Mode and click one image. Confirm one Queue pin is created, no stored-original indicator appears, and no other visible image is captured.
3. Open Settings. Under **Per-site Grab behavior**, add the current exact hostname with **Pin + capture encrypted original**.
4. Return to Controls. Confirm the Grab title/help text says explicit clicks will pin and capture encrypted originals for this site.
5. With encrypted original storage unlocked, turn on Grab Mode and click one image. Confirm the Queue pin appears before capture completion and then gains the stored-original indicator after success.
6. Confirm the clicked image appears in Recents only for the current session. Restart the extension session and confirm the rule remains but the Recent does not.
7. Lock encrypted storage or deny an optional cross-origin fetch permission, then click another image explicitly. Confirm the Queue pin remains and the capture flow reports locked/permission recovery without claiming an original was stored.
8. Visit a parent domain and a subdomain. Confirm neither inherits the exact-host Capture rule and their explicit Grab clicks remain metadata-only.
9. Enable Privacy Mode and inspect both source-panel and standalone Settings. Confirm the saved hostname is replaced by a numbered/private label and is absent from visible text, titles, and accessibility labels.
10. Remove the rule. Return to the original hostname and confirm Grab copy and behavior return to metadata-only pinning.

## Required invariants

- No rule automatically captures page images.
- No Grab path writes original bytes outside encrypted-original storage.
- Queue order remains based on `queueUpdatedAt`; capture metadata refresh does not reseal or reorder unrelated records.
- Recents remain transient and are never used as the durable capture owner.
- Release and baseline manifests remain free of `nativeMessaging`.
