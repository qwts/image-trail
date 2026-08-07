# Overlook and Image Trail interoperability contract

`v1/` is an exact vendored copy of the canonical contract published by
[`qwts/photos`](https://github.com/qwts/photos/tree/main/design/handoff/contracts/v1).
Its source commit and checksum are pinned in `source.json` and enforced by
`npm run check:interop-contract`.

`npm run check:interop-acceptance` validates every local Image Trail evidence
set and needs no companion checkout. With `INTEROP_PHOTOS_ROOT` pointed at the
pinned Photos source, `npm run check:interop-acceptance:cross-repo` validates
both repositories and refuses missing, stale, or unpinned companion evidence.
`npm run check:interop-closeout` includes that cross-repository gate and also
refuses to pass until every credential-bound manual check has timestamped
GitHub evidence.

Do not edit files under `v1/` independently. Contract changes originate in
Photos, then arrive here as one reviewed checksum update with matching runtime
and golden-fixture parity.

Architecture: [Photos ADR-0014](https://github.com/qwts/photos/wiki/ADR-0014-Image-Trail-Bidirectional-Interoperability).
