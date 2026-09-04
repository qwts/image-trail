# GIF and WebP Media

Issue: #677  
Related Photos issue: qwts/photos#547

## Expected Behavior

- Static WebP, animated WebP, and animated GIF files are accepted only after bounded, signature-first inspection.
- Capture stores the exact original bytes separately from the durable queue record. The record keeps the verified MIME type, safe original filename, dimensions, and bounded frame/loop facts.
- Queue, Recall, and Gallery list thumbnails remain deterministic JPEG posters. They do not animate.
- Host projection and full preview use the original GIF/WebP source. The browser remains responsible for native frame timing and loop playback; Image Trail does not re-encode the original.
- With reduced motion enabled, an animated full preview opens on a static poster and exposes native Play/Stop controls. A poster-generation failure must remain non-autoplaying.
- Downloads prefer the authenticated encrypted original and preserve its verified MIME type, extension, filename, dimensions, and byte hash.
- Full encrypted backup/restore preserves the original bytes and media metadata without assembling all originals into one message.
- The additive `roundTripMetadata.overlook.media` contract keeps GIF/WebP kind, MIME type, extension, dimensions, frame count, and loop count coherent for Photos interoperability.
- Malformed, truncated, oversized, or structurally over-budget GIF/WebP input fails before a partial original record is committed.
- Interoperability remains experimental and opt-in. The baseline and release manifests contain no `nativeMessaging` permission and expose no unfinished Transfer & Sync entry point.

## Packaged Automated Evidence

The repository fixtures have deterministic provenance and SHA-256 values:

- `animated.gif`: `e91380db853442ee77466f0f4a4b85f86c07b1607597efce84f1985ed38267f0`
- `animated.webp`: `b0a4e06afd321fbcefdf834e165224734e99f0df811ab532c5bd3e94518f9b18`
- `static.webp`: `786ba2cc8b977a04ec253aae1b5807485716d62927faecea9a364fcbbe601065`
- `truncated.gif`: malformed negative fixture

Run:

```sh
npm run test:e2e -- tests/e2e/gif-webp-media.spec.ts
npm run test:e2e
INTEROP_PHOTOS_ROOT=/path/to/pinned/photos npm run ci
npm run test:stories:ci
npm run build:release
if rg -n 'nativeMessaging' extension/dist/manifest.json extension/dist; then exit 1; fi
```

Expected:

- The focused packaged-extension flow captures all three valid fixtures, keeps every list thumbnail static, downloads each exact original hash, decodes each full preview at 40 by 40 pixels, holds animated media on a poster under reduced motion, and rejects the truncated GIF without changing the original-blob count.
- Unit and DOM tests cover bounded GIF/WebP parsing, canonical MIME detection, schema coherence, encrypted retrieval validation, filename sanitization, preview payload limits, reduced-motion controls, exact backup/restore bytes, and interop round trips.
- The full Playwright suite passes its baseline interoperability policy check; the experimental interoperability test remains intentionally skipped in a baseline build.
- The release scan produces no match.

## Manual Check

1. Build the release package with `npm run build:release`.
2. Inspect `extension/dist/manifest.json`.
   Expected: `nativeMessaging` is absent from `permissions` and `optional_permissions`.
3. Load `extension/dist` as an unpacked extension and open Settings.
   Expected: unfinished Transfer & Sync controls are absent.
4. Open a page containing one animated GIF, one animated WebP, and one static WebP. Capture each original.
   Expected: each durable row shows the verified format and dimensions plus the stored-original indicator.
5. Observe Queue, Recall, and Gallery lists for at least 10 seconds.
   Expected: thumbnails remain stable posters and do not animate or flicker.
6. Open each full preview.
   Expected: GIF and animated WebP playback remains visually faithful to the source; static WebP remains still.
7. Enable the operating system's reduced-motion preference before opening an animated preview.
   Expected: the preview opens on a non-animating poster, keyboard focus can reach Play, Play starts the original animation, and Stop restores the same poster.
8. Download each captured original and compare its SHA-256 hash, filename extension, MIME type, and pixel dimensions with the source.
   Expected: all values match exactly.
9. Create a full encrypted backup, delete the local test records, restore the backup, and repeat the download/hash comparison.
   Expected: exact original bytes and media facts survive.
10. Attempt to capture a truncated or malformed GIF/WebP and an image beyond the existing original-byte budget.
    Expected: capture fails with actionable feedback and leaves no partial durable original.
11. In a separate experimental build, enable interoperability and transfer one animated GIF and one animated WebP to Photos and back.
    Expected: original bytes, filename, MIME type, dimensions, animation frame count, and loop metadata remain coherent. The baseline release remains unchanged.

## Review Boundary

The automated packaged-extension run proves byte identity, browser decode, static-poster behavior, control state, safe malformed-input handling, backup/restore logic, contract validation, and baseline permission policy. Human review remains responsible for perceived animation timing, operating-system reduced-motion startup behavior, and a live Photos round trip.
