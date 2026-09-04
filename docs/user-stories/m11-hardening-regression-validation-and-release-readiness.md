# M11: Hardening, Regression Validation, And Release Readiness

**Order:** 11

**Type:** Release gate

**Status:** in progress

## Goal

Prove that the extension is reliable, recoverable, privacy-conscious, and
distributable before removing the repository's pre-release status or treating it
as the primary workflow. This milestone collects evidence and closes blockers; it
does not absorb new feature work.

## Completed foundation

- [x] Required CI covers version policy, lint, formatting, acceptance coverage,
      unit/DOM coverage, build, Storybook, path-filtered E2E, CodeQL, type coverage,
      file-size limits, and product invariants.
- [x] Recents persistence, `queueUpdatedAt` ordering, and Recall queue-producer
      boundaries have executable invariant checks.
- [x] Host access uses action-driven injection plus explicit optional-origin
      grants; broad install-time host access was removed in #57.
- [x] Changesets, synchronized package/manifest/lock versions, release build
      identity, and a rolling version PR were implemented in #387.
- [x] User-visible flows have an acceptance-coverage map and browser/manual test
      guidance.

## Remaining tracked work

- [x] #501 — v0.2.5 verified the automatic version-cut pipeline publishes a
      downloadable and Chrome Web Store-ready ZIP plus SHA-256 checksum.
- [x] #502 — prepare Chrome Web Store listing assets, privacy/data-use answers,
      permission justifications, public support/privacy links, and reviewer steps.
- [ ] #503 — run the final clean-profile regression and recovery sweep and record
      exact evidence, known limitations, and recovery instructions.
- [x] #13 — record the M10 React/Vite decision. Deferral is acceptable, but the
      decision gate cannot remain ambiguous when M11 closes.

Defects discovered by #502 or #503 receive focused blocker issues. They are not
fixed by silently expanding those evidence tickets.

## Final regression checklist

Issue #503 owns the execution record for one exact release-candidate commit:

- [x] clean install and first action-driven injection in Brave/Chromium;
- [ ] upgrade and IndexedDB migration from the most recent practical prior
      version;
- [ ] encrypted export followed by clean-profile import/restore;
- [ ] delete, orphan cleanup, and bounded storage-growth behavior;
- [x] permission denial, grant, retry, and least-privilege prompts;
- [x] automation stop, throttling, cancellation, and interruption behavior;
- [x] bookmarklet parity flows from the extension-port acceptance baseline;
- [x] intentional behavior differences documented with their rationale;
- [ ] known limitations and actionable recovery steps published;
- [x] required automated gates pass on the tested commit.

Each row must end as passed, intentionally changed, or blocked by a linked issue.
A chat summary or broad “tested manually” statement is not evidence.

### Current #503 execution record

The exact candidate is the published v0.17.0 release at commit
`482b984eb67f`. The published ZIP SHA-256 is
`b52e464bd8e76a79099d02da4f8cb509e967f66169f6370e12d1cb897b4ad7a1`.
The direct practical upgrade baseline is v0.16.0 at commit `f20e206ccbe0`,
whose published ZIP SHA-256 is
`95f08133a54d1610d96734ae39b36e1ec5bbce2244b224da672613c767aa24a0`.

Completed manual evidence on the exact v0.17.0 package:

- A fresh Brave profile loaded the release package. The first toolbar action
  granted current-site access, injected exactly one panel, and auto-selected the
  sole image on the single-image fixture.
- A numeric query-field Trail started, paused, resumed, and stopped when manual
  Prev interrupted the resumed slideshow. The panel reported
  `Slideshow: stopped` after the interruption.
- The three-image fixture reported exactly three qualifying images without
  auto-selecting one. Closing and reinvoking the browser action restored exactly
  one panel.
- Fresh privacy defaults prefer encrypted pin saves, keep thumbnail storage
  encrypted and non-downgradable, and default automatic lock to ten minutes.
- Creating the first key unlocked encrypted capture. The first original-capture
  attempt failed closed until the optional origin grant was approved; Brave
  requested only “Read and change your data on 127.0.0.1”. The built-in retry
  then captured the original without requiring a second capture action.
- Forcing the MV3 service worker through `brave://serviceworker-internals`
  preserved the unlocked session, protected queue row, and `Original stored`
  relationship. Re-capturing the same original returned
  `Original already stored` and left encrypted-original usage at one 432-byte
  record.
- The selected original exported as a 1,011-byte encrypted JSON file with
  SHA-256
  `953ece4602a5b85c4eab7987f1e0ca522837f4e3305230618365e7d3c74f4d1e`.
  The password-wrapped key backup saved separately on the owner’s Desktop with
  SHA-256
  `2d985170853b2431a9373d648e73772aaefdd47dddd608af47bd2bebd959c4f1`.
- A wrong key-backup password failed closed. Importing the saved backup restored
  key reference `blob:34be0ce4-9e51-407d-bf3d-495ac97b4734`, unlocked the
  workspace, and made the protected row plus its stored-original relationship
  readable again. Thumbnails remained zero plaintext storage records.

Automated evidence from a detached checkout of the exact v0.17.0 tag:

- `npm run lint`, `npm run format:check`, `npm test`, and `npm run build` passed.
  Lint reported no `envelope.updatedAt` restricted-syntax violation; strict type
  coverage passed at 99.82%.
- `npm run test:e2e` passed all 104 Playwright tests, including automation
  governance, encrypted capture/export, key-backup wrong-password recovery,
  bounded original storage, permission retry, extension-process restart, and
  packaged private-workspace restart coverage.
- `npm run test:cov` passed at 83.31% lines/statements, 82.24% branches, and
  85.83% functions.
- `npm run test:stories:ci` passed 28 suites and 180 interaction tests.
- The executable invariants passed: Recents exposes no durable write path; queue
  ordering uses `queueUpdatedAt`, never encrypted-envelope `updatedAt`; Recall
  pages the queue producer instead of the blob store; ESLint rejects the
  forbidden queue sort; and interoperability custody does not reach host-page,
  provider, log, or extension-storage APIs.

The remaining rows are deliberately still open. #503 must still verify the
final encrypted-image import result in the second profile, captured-original
deletion plus orphan cleanup, and the direct v0.16.0-to-v0.17.0 packaged upgrade.
The native key-backup chooser also exposed #606: when the chooser returns focus
to the visually hidden file input, attached Settings can scroll to its trailing
groups. Key import still succeeds and Settings state is not lost, but #606 must
merge and receive packaged chooser verification before #503 closes.

### Intentional differences from the bookmarklet baseline

- Recents are session-only review state. They never become durable unless the
  user explicitly pins or captures them; durable rows live in Queue and Recall.
- Host access is granted from an explicit browser action and optional per-origin
  retry instead of broad install-time page access.
- Captured originals and thumbnails are encrypted extension-owned records. A
  durable pin can exist without an original, and a locked workspace renders no
  protected row content beneath its opaque lock surface.
- Slideshow and retry work are governed and interruptible. Manual opposite
  navigation stops active automation rather than racing it.

### Recovery guidance and current limitations

- Keep the exported key-backup JSON separate from encrypted image/full-backup
  files. The backup password unwraps the key; it is not stored in either file.
- A wrong password or corrupt key backup fails closed. Re-select the original
  key-backup file, import it with the correct backup password, then unlock the
  workspace with the encrypted-originals password.
- If capture reports that optional origin access is required, approve only the
  named image origin and use the built-in retry. Denial does not create a
  plaintext original or partial durable relationship.
- Repeated capture of a row that already owns an original is bounded and reports
  `Original already stored`; it does not append another encrypted blob.
- Until #606 merges, returning from a key-backup chooser can scroll attached
  Settings near Utilities/System. Scroll back within Settings; the destination
  and selected backup remain intact, and import can still complete.
- Do not clear a stored key without a verified key backup. If the key is lost,
  encrypted originals remain intentionally unreadable; metadata-only durable
  pins can still be retained or removed according to normal queue cleanup rules.

## Store and distribution checklist

Issues #501 and #502 jointly own this boundary:

- [ ] version, manifest, lockfile, changelog, and release build identity agree;
- [ ] release ZIP has `manifest.json` at its root and matches its SHA-256 file;
- [ ] the GitHub Release is marked prerelease while repository status remains
      pre-release;
- [ ] single-purpose, permission, and data-use disclosures match shipped behavior;
- [ ] screenshots, icons, descriptions, category, support URL, and privacy URL are
      ready;
- [ ] reviewer steps require no private maintainer credentials;
- [ ] upload the exact #501 ZIP after the release-readiness checks pass; no
      separate submission approval is required.

Current release automation contains no Chrome Web Store credentials. Complete
store submission and rollout as the next operational steps after the checklist
passes, without a separate approval pause, until dedicated automation owns them.

## Close criteria

M11 and parent issue #14 can close only when:

1. #501, #502, and #503 are complete;
2. #13 records an adopt-or-defer decision;
3. every final checklist row has evidence or a resolved blocker;
4. no open blocker can cause data loss, plaintext key exposure, uncontrolled
   requests, misleading permissions, or unrecoverable migration failure;
5. the exact candidate commit passes required automated gates; and
6. the known-limitations/recovery record is reviewed before release status
   changes.

Server integration, mobile ingestion, photo-library replacement semantics,
vector search, and unrelated feature expansion remain out of scope.
