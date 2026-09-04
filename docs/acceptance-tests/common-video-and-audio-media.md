# Acceptance Test: Common Video And Audio Media

Issue: [#679](https://github.com/qwts/image-trail/issues/679)  
Related Photos issue: [qwts/photos#549](https://github.com/qwts/photos/issues/549)

## Expected Behavior

- MP4/M4V/M4A, MOV/QuickTime, WebM, Matroska, AVI, MPEG Program Stream, and raw MPEG Layer II/III audio are accepted only after bounded signature-first inspection. A suffix or declared MIME type never establishes trust.
- The probe records bounded container, stream, codec, profile, level, bit-depth, channel, sample-rate, language, duration, coded/display dimensions, rotation, frame-rate/VFR, audio-presence, and HDR transfer facts when the container safely exposes them.
- Capture stores the exact original bytes in the encrypted original store. Durable queue records retain only authenticated custody metadata and a deterministic inert SVG poster; media data URLs never enter queue or recent metadata.
- Native preview capability is derived from the current browser every time and is never persisted or transferred as truth. MP4/MOV H.264, HEVC, or ProRes and WebM VP8/VP9/AV1 candidates use native controls only when `canPlayType` accepts the exact MIME/codec tuple.
- Native preview starts paused, has a finite metadata-load timeout, uses a bounded blob URL, captures at most one bounded first-frame PNG poster, and cleans up media state and the blob URL on page exit.
- Matroska, AVI, MPEG Program Stream, raw MP2, unsupported codec combinations, and device-rejected native candidates remain explicitly preserved-only while exact export remains available.
- Local file and intentional direct HTTPS import share the existing encrypted-capture transaction. A malformed, truncated, spoofed, oversized, or structurally over-budget input fails before a blob or durable row is committed.
- Downloads and full encrypted backup/restore preserve exact bytes, verified MIME type, safe filename, SHA-256, dimensions, and bounded media facts.
- The additive Photos interoperability media block preserves portable facts but excludes device playability. Inbound metadata must agree on media kind, MIME type, container, extension, and bounds before it can enrich an authenticated original.
- Transcoding, editing, DRM, streaming playlists, list autoplay, and codec installation are out of scope.
- Interoperability remains experimental and opt-in. Source, baseline, and release manifests contain no `nativeMessaging`; only `IMAGE_TRAIL_ENABLE_INTEROP=1` may add it.

## Current-Stack Revalidation

The recovered implementation was replayed onto the current stacked source on 2026-08-07 without reviving its obsolete prerequisite merges. The current guarded unit/DOM suite passes with 441 DOM tests, including the complete deterministic signature, custody, preview, backup, and interop matrix. Typecheck, formatting, version policy, dependency/cycle/dead-code checks, size ratchets, and 99.82% strict type coverage also pass. Packaged Chromium, Storybook, coverage, release-artifact, and exact-permission evidence remains an exact-head CI gate before the PR can leave draft.

## Packaged Automated Evidence

The synthetic FFmpeg fixture corpus is bit-exact across regeneration:

- `h264-aac.mp4`: `255d0bf97174c3be46680efa94e9fc5a0fc22509c94cf7e92e805bd013eca020`
- `iphone-rotated.mov`: `9e7eda91717cc4c8c304974975e189d081257ed8df53e6601d5212d700339cf2`
- `iphone-slow-motion-vfr.mp4`: `a1121f3cf00078c6c5a7019b439a78515fdf92e1f08ff0d9ff3be2a64e9e4316`
- `iphone-hevc-main10-hdr.mov`: `6e75d7664ba9c6d7123813fa9dbdc015a32948d68dc9d86b2deaa745ac7b8390`
- `prores-pcm.mov`: `8aa692fbe3501faeb445a525c128f6b69ad1997c2cbca71f3958ebfacd99e069`
- `vp9-opus.webm`: `4a8c4a40b6283e06510e062b88e75fc09fd5adeec1ff773ffd3bd7ed1c89e819`
- `h264-aac.mkv`: `20373b49b438841a6a54964e4bb4a2a70df9f25b1b5146e0ece8afd15d29bb67`
- `mpeg4-mp3.avi`: `edff26feba6f40509d808778cdbe7aa8b77ff7a857f5ed52c739fc0188b26731`
- `mpeg2-mp2.mpg`: `f5867a92ba980288d15ee08d3a210fef9c9b82a22a22c853d1c2771057889ae7`
- `mpeg1-mp3.mpg`: `894bd1f3f57deb7927fc356faf82094e4b9b9622e10ec27048a6cd7a74eda9e0`
- `audio-only.mp2`: `bdb86d88f9a86682178857e90c64327b041ff2e8a58a05fd20022741c5c38cf3`
- `truncated.mp4` and `spoofed.mp4`: malformed negative fixtures

Run:

```sh
npm run test:e2e -- tests/e2e/common-video-media.spec.ts
npm run test:e2e
INTEROP_PHOTOS_ROOT=/path/to/pinned/photos npm run ci
npm run test:stories:ci
npm run build:release
if rg -n 'nativeMessaging' extension/dist/manifest.json extension/dist; then exit 1; fi
```

Expected:

- The focused packaged-extension flow imports MP4, Matroska, MP2, and WebM from local files and a direct URL; proves encrypted custody, stable inert posters, authenticated extension labels, exact MP4 export, and atomic truncated/spoofed rejection.
- WebM preview has focusable native controls, starts paused, decodes, captures one PNG first-frame poster, plays only after activation, and reports pause/completion. Matroska and MP2 remain explicitly preserved-only.
- Unit and DOM tests cover every checked-in container and codec, exact hashes, rotation, variable frame rate, MPEG-1/MP3, HEVC Main 10/PQ, ProRes, signature correction, bounds, encrypted retrieval, transaction rollback, posters, native/preserved preview paths, backup/restore, and strict interop metadata.
- The full Playwright gate passes with baseline interoperability disabled, and the release scan produces no match.

## Manual Check

1. Build the release package with `npm run build:release`, then inspect source and built manifests.
   Expected: `nativeMessaging` is absent from `permissions` and `optional_permissions`, and Transfer & Sync is absent.
2. Load the unpacked release and unlock encrypted originals.
3. Import representative iPhone H.264, slow-motion VFR, and HEVC MOV/MP4 files, ProRes MOV, WebM, MKV, AVI, MPEG-1/MP3, MPEG-2/MP2, and raw MP2 from local files. Import one direct HTTPS source after the intentional origin-permission prompt.
   Expected: each valid source creates one durable row with a stable poster, verified label, dimensions when available, and stored-original indicator.
4. Observe Queue, Recall, and Gallery for at least 10 seconds.
   Expected: no media autoplays or flickers; selected and stored-original states remain distinct.
5. Open each native-capable item with only the keyboard.
   Expected: playback begins only after activation; focus, play, pause, seek, mute, volume, duration, poster, timeout, and error behavior are usable and honestly reported.
6. Open MKV, AVI, MPEG-PS, and MP2 items.
   Expected: each remains downloadable and says preserved-only without rendering an active media element.
7. Compare rotated iPhone MOV orientation and HEVC HDR appearance against the source in a trusted native player.
   Expected: display orientation is correct; metadata reports Main 10 and PQ without claiming unsupported device decode.
8. Download every original and compare SHA-256, byte length, filename, extension, MIME type, dimensions, rotation, duration, and stream facts.
   Expected: exact bytes and authenticated facts match.
9. Create a full encrypted backup, delete the test records, restore it, and repeat the download and metadata comparison.
   Expected: exact originals and portable facts survive without plaintext or duplicate durable media payloads.
10. Attempt truncated, spoofed, oversized, deeply nested, excessive-stream, and unsupported-codec inputs.
    Expected: processing remains bounded, gives actionable failure or preserved-only status, and creates no partial blob or durable row.
11. In an `IMAGE_TRAIL_ENABLE_INTEROP=1` build, transfer one playable candidate and one preserved-only original to Photos and back.
    Expected: SHA-256, bytes, safe filename, MIME, container, streams, dimensions, rotation, duration, and HDR facts remain coherent. No device-playability claim is transferred.

## Review Boundary

The automated packaged-extension run proves bounded signature parsing, exact encrypted custody, inert list presentation, native no-autoplay behavior, preserved-only honesty, malformed-input atomicity, exact export, backup/restore logic, interop schema coherence, and baseline permission policy. Human review remains responsible for real Apple-device samples, system codec behavior, perceived playback and HDR quality, keyboard seek/volume ergonomics, and a live gated Photos round trip.
