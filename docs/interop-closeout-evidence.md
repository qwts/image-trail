# Interop Closeout Evidence

Issues: [Image Trail #590](https://github.com/qwts/image-trail/issues/590) and
[Photos #337](https://github.com/qwts/photos/issues/337)

The canonical released-product runbook and evidence format live in the
[Photos wiki](https://github.com/qwts/photos/wiki/Interop-Closeout-Evidence).
Run it against both released products; do not close either issue from mocked
provider or implementation evidence alone.

## Image Trail gate

Image Trail vendors Photos'
`design/handoff/contracts/v1/acceptance-evidence.json` byte for byte under
`contracts/interop/v1/`. The canonical `SHA256SUMS`, source commit, and manifest
digest are pinned by `npm run check:interop-contract`.

- `npm run check:interop-acceptance` verifies all ten epic scenarios, both
  repositories' automated-reference shape, and every local Image Trail test
  reference. Normal CI runs this command.
- `npm run check:interop-closeout` additionally refuses to pass until released
  bidirectional, live pCloud, live Google Drive, and signed iCloud native-host
  entries each contain a timestamp and GitHub evidence URL.

Never edit the evidence manifest locally. Photos publishes the canonical
checksum update first; Image Trail then vendors the exact canonical commit and
reruns the parity and closeout gates.

## Image Trail-specific checks

During each canonical manual run:

1. Use a released extension build and record its version, commit, browser, OS,
   and the Overlook release paired with it.
2. Exercise one Queue row, a multi-selection, an album/Gallery source, a
   captured original, and a metadata-only bookmark. Confirm Queue order,
   selection, scroll, Gallery context, and detached geometry remain stable.
3. Lock the key while Transfer and Sync is open. Confirm the entire surface is
   opaque and contains no thumbnail, title, URL, count, conflict, provider, or
   original detail beneath the lock overlay. Unlock from that surface and
   continue the same journal.
4. For Move, retain the source until the Overlook acknowledgement proves durable
   metadata and, when claimed, verified original custody. An interruption,
   rejection, forged acknowledgement, or provider failure must not remove it.
5. For Sync, review direction/scope and every conflict/delete decision. Pause,
   resume, restart, disconnect, and confirm no delete propagates silently or
   mutates Recents.
6. Inspect provider namespaces and diagnostics for seeded plaintext titles,
   URLs, filenames, metadata, credentials, passwords, or key encodings. None may
   appear.

Post the same redacted result URLs to #590 and #337, then update the canonical
Photos manifest. Image Trail closeout is complete only after the exact vendored
update makes `npm run check:interop-closeout`, CI, E2E, Storybook, privacy
invariants, and release packaging all pass.

## Recovery

- Before acknowledgement: preserve the Image Trail source and encrypted
  journal, reconnect or re-import pairing as indicated, and resume.
- After acknowledgement: rerun only the idempotent source finalizer; never
  synthesize a second acknowledgement or unconditional delete.
- Wrong password/key, corruption, replay, unsupported version, cross-pairing
  path, wrong extension identity, unsigned host, and malformed native response
  fail closed. Keep both products disconnected until the cause is recorded.
- If target custody cannot be proven, retain both copies and leave the manual
  manifest entry pending.
