# Experimental interop acceptance package

Issue: [#865](https://github.com/qwts/image-trail/issues/865)
Closeout owner: [#590](https://github.com/qwts/image-trail/issues/590)

Image Trail baseline and release packages intentionally omit Transfer & Sync and
the `nativeMessaging` permission. The experimental package is a separate,
hardened operator artifact for the released-product acceptance matrix. It must
not replace or weaken the baseline package.

## Build and inspect

Use the repository Node version and the public pCloud application client id:

```sh
PCLOUD_CLIENT_ID=your-public-client-id npm run package:experimental
```

The command emits `release/image-trail-v<version>-experimental.zip` and its
SHA-256 file. It fails closed unless the artifact:

- records `mode: experimental` with no local worktree path;
- is minified and contains no debug marker, unresolved environment reference,
  credential-shaped value, source map, or E2E-only open-shadow marker;
- requests `nativeMessaging` and includes the pairing-import application;
- contains the public Chrome Web Store key that derives the released extension
  id `kopcjofaojfpgdoianeddagpenhijphi`; and
- keeps every normal release-only manifest and archive check intact.

Run `npm run package:release` separately and confirm its manifest still omits
`nativeMessaging` before treating the experimental artifact as usable.

## Disposable profile only

1. Create a new Chromium profile with no personal browsing, extension, or
   provider state. Do not modify the normal Image Trail profile.
2. Extract the experimental ZIP into a new directory and load that directory as
   an unpacked extension.
3. Confirm Chromium reports extension id
   `kopcjofaojfpgdoianeddagpenhijphi`, the package version matches the intended
   acceptance revision, and the build overlay reports `experimental` plus the
   expected commit.
4. Install the current signed/notarized Overlook release and inspect the native
   host manifest before pairing. The only allowed origin must be
   `chrome-extension://kopcjofaojfpgdoianeddagpenhijphi/`.
5. Use only disposable libraries and dedicated provider folders/accounts. Keep
   pairing passwords, keys, tokens, account identifiers, local paths, and
   original filenames out of commands, logs, and issue comments.
6. Follow the canonical source-controlled
   [Interop Closeout Evidence](https://github.com/qwts/photos/blob/main/docs/Interop-Closeout-Evidence.md)
   runbook. Post only its redacted evidence fields to both closeout issues.
7. Disconnect providers, remove the experimental extension profile, and remove
   the native-host registration when the run finishes.

Building or inspecting this package does not verify a #590 manual row. A row
changes only after the complete released-product run has matching timestamped
GitHub evidence in both repositories and the canonical Photos manifest is
updated at one reviewed checksum.
