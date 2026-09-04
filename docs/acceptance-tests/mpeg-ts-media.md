# MPEG-TS Media

Issue: #678  
Related Photos issue: qwts/photos#548

## Expected Behavior

- Direct `.ts`, `.mts`, and `.m2ts` files and URLs are accepted only after a bounded, signature-first MPEG transport-stream inspection. A suffix or `video/mp2t` declaration alone is not trusted.
- The initial playable matrix is H.264 Constrained Baseline, Baseline, Main, or High video with optional AAC LC audio. Unknown profiles, H.264 High 10/4:2:2/4:4:4, non-LC AAC, MPEG-2 Video, MP2, and other unapproved streams remain preserved-only and never claim playback.
- Capture stores one exact encrypted original separately from the durable queue record. The authenticated record keeps the safe filename, verified `video/mp2t` MIME type, extension, SHA-256 identity, byte length, dimensions, duration, and bounded stream facts.
- The probe accepts sustained 188-byte transport packets and 192-byte M2TS packets. PAT, PMT, PCR, H.264 SPS, MPEG-2 sequence headers, and AAC ADTS inspection have fixed packet, byte, stream, metadata, dimension, duration, and file-size limits.
- Queue, Recall, and Gallery rows use a deterministic inactive SVG poster with codec and duration status. The poster contains no script or external resource.
- Full preview never autostarts. A supported stream is remuxed in memory for native keyboard-focusable play, pause, seek, mute, volume, duration, and error controls. The first decoded frame becomes the preview poster without replacing the stored original.
- The preview adapter uses the exact-pinned, license-audited `mpegts.js` source with workers disabled, bounded buffering, a finite load timeout, and deterministic player and object-URL cleanup.
- Downloads, full encrypted backup/restore, and the additive Photos interoperability media block preserve the exact original and safely probed media facts. Playability is derived locally and is never persisted as interoperable truth.
- Malformed, truncated, oversized, cadence-spoofed, or structurally over-budget input fails before a blob or durable queue record is committed.
- HLS playlists, live streams, MPEG Program Streams, transcoding, remux exports, editing, DRM, and list autoplay remain out of scope.
- Interoperability remains experimental and opt-in. The source, baseline, and release manifests contain no `nativeMessaging` permission; only an explicit `IMAGE_TRAIL_ENABLE_INTEROP=1` build adds it.

## Packaged Automated Evidence

Checked-in fixtures have deterministic SHA-256 identities:

- `supported-h264-aac.mpegts`: `a327f9d90565a7672ce85ac341066e0da7ea89caf9b053c32352ece756dfd754`
- `supported.m2ts` (deterministic 192-byte packet conversion used by packaged E2E): `da3d70e6479b8ce82d73ffa6b31b930a1555cb1c6e4d523854076ed2fab092d9`
- `preserved-mpeg2-mp2.mpegts`: `095b7bfb8cfb4f4eaaa37bc7600a5870b3d3a8561769bcbdaa17e6603fb4a756`
- `truncated-h264-aac.mpegts`: `f9501eddbe99dcb75e6414e32ac4e4b2b59cdc347eaa23b1e5c426507c567b59`
- `spoofed-jpeg.bin`: `5fefb55d3e27603a91f828fcb10e8529f8cde7ce010c08391ea8b79af72d54bb`
- `malformed-no-cadence.bin`: `b6cc9cd43bccd931dfa90c073ed79946d2f7b6ec7982951b5fe655f23505cfc4`

Run:

```sh
npm run test:e2e -- tests/e2e/mpeg-ts-media.spec.ts
npm run test:e2e
INTEROP_PHOTOS_ROOT=/path/to/pinned/photos npm run ci
npm run test:stories:ci
npm run build:release
if rg -n 'nativeMessaging' extension/dist/manifest.json extension/dist; then exit 1; fi
```

Expected:

- The focused packaged-extension flow imports the true 192-byte M2TS fixture from a direct URL and the preserved-only fixture from a local file, proves encrypted-original custody, displays stable posters, exports exact hashes and filenames, and rejects truncated media without changing durable state.
- The supported preview has native controls, starts paused, reaches playback, exposes a decoded PNG first-frame poster, and reports bounded readiness, pause, completion, or failure status. The MPEG-2 plus MP2 preview remains explicitly preserved-only.
- Unit and DOM tests cover 188/192-byte cadence, cross-packet PMT reconstruction, PAT/PMT/PCR facts, H.264 and MPEG-2 dimensions and frame rate, H.264/AAC/MPEG-2 profiles, known hashes, fetch and data-URL limits, transactional rollback, encrypted retrieval, static posters, downloads, backups, and Photos-compatible metadata.
- The supported fixture reports H.264 Constrained Baseline plus AAC LC, 64 by 64 coded and display dimensions, and 15 frames per second. The preserved-only fixture reports MPEG-2 Main plus MP2 with the same dimensions and frame rate.
- The full Playwright suite passes its baseline permission policy; experimental interoperability remains intentionally gated.
- The release scan produces no match.

## Manual Check

1. Build the release package with `npm run build:release`.
2. Inspect `extension/manifest.json` and `extension/dist/manifest.json`.
   Expected: `nativeMessaging` is absent from `permissions` and `optional_permissions`.
3. Load `extension/dist` as an unpacked extension and open Settings.
   Expected: unfinished Transfer & Sync controls are absent.
4. Import representative supported `.ts`, `.mts`, and `.m2ts` files, then import a supported direct HTTPS URL after granting only that origin.
   Expected: every valid source creates one durable row with the original filename extension, dimensions, duration, codec status, and stored-original indicator.
5. Inspect Queue, Recall, and Gallery for at least 10 seconds.
   Expected: no video autoplays; each row keeps a stable inactive poster and distinct selected and stored-original states.
6. Open the supported item in full preview and operate the native controls with only the keyboard.
   Expected: focus is visible; play, pause, seek, mute, and volume work; duration and errors are announced; playback starts only after activation.
7. Close and reopen the supported preview.
   Expected: no stale playback continues, the object URL and player are cleaned up, and a deterministic first decoded frame appears when decode succeeds.
8. Open the MPEG-2 plus MP2 item.
   Expected: the exact original remains downloadable while the preview states that playback is unavailable; no playable state is implied.
9. Download both originals and compare SHA-256, byte length, filename, extension, MIME type, dimensions, duration, and stream facts with the source fixtures.
   Expected: exact bytes and authenticated facts match.
10. Create a full encrypted backup, delete the test records, restore the backup, and repeat the download and metadata comparison.
    Expected: exact bytes and facts survive without a plaintext or duplicated durable media payload.
11. Attempt malformed, truncated, cadence-spoofed, unsupported-container, oversized, and resource-exhausting inputs.
    Expected: processing stops within the documented limits, actionable status is shown, and no partial blob or durable record remains.
12. In a separate `IMAGE_TRAIL_ENABLE_INTEROP=1 npm run build`, transfer one supported and one preserved-only stream to Photos and back.
    Expected: SHA-256, bytes, MIME type, extension, dimensions, duration, and stream facts remain coherent. Baseline and release artifacts remain unchanged.

## Review Boundary

The automated packaged-extension run proves signature validation, bounded probing, exact encrypted custody, deterministic list posters, browser remux playback, native control state, malformed-input atomicity, downloads, backup/restore logic, interoperability schema coherence, and baseline permission policy. Human review remains responsible for perceived playback quality, system codec behavior, keyboard seek and volume ergonomics, first-frame poster aesthetics, and a live gated Photos round trip.
