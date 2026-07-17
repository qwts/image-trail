---
description: Production release runbook for Image Trail — cut a version, validate the hardened build, and publish the packaged extension.
argument-hint: '[patch|minor|major]'
---

Image Trail's release flow is automation-first: local gates prove the change,
`version-cut.yml` cuts the version tag, and `release.yml` builds, hardens, and
publishes the packaged extension. This runbook is the human checklist around
that automation. Do not skip a step; if a gate fails, stop and surface it.

## 1. Preflight (local)

- Confirm `main` is green and you are releasing from it (or a branch about to
  merge). Trunk-based: releases are cut from `main`.
- Ensure user-visible changes since the last release each carry a changeset
  (`npx changeset`). The version bump is derived from these.
- Run the full CI-equivalent gate, which now includes the license gate:

```sh
npm run ci   # version-policy, check:licenses, interop, lint, format, coverage tests, build
```

`check:licenses` fails if any shipped dependency has a non-permissive/unknown
license or if `THIRD-PARTY-LICENSES.txt` is stale (`npm run licenses:write` to
refresh, then commit).

## 2. Verify the hardened release build locally

```sh
npm run build:release        # minifies, strips debug/sourcemaps, audits artifacts (--require-release)
npm run test:e2e:release     # smoke-tests the hardened build end to end
npm run package:release      # produces release/*.zip + *.sha256, re-validating the archive
```

`build:release` enforces minification and the release artifact text audit
(no sourcemaps, debug logging, secrets, or build-machine paths in shipped code
— see `scripts/extension-artifact-policy.mjs`). The packaged zip ships
`THIRD-PARTY-LICENSES.txt` for the bundled third-party code.

## 3. Cut the version and publish (automation)

- Land the Changesets version PR (bumps `package.json` + `extension/manifest.json`
  together via `scripts/sync-manifest-version.mjs`).
- `version-cut.yml` creates the `v<version>` tag; `release.yml` then runs on the
  tag: `npm run ci` → Playwright → `test:e2e:release` → `package:release` →
  publishes the GitHub Release assets (zip + checksum) as a prerelease.
- Recovery path if the tag was pushed with `GITHUB_TOKEN` (no workflow trigger):
  dispatch `release.yml` manually with the exact `v<version>` tag.

## 4. Store submission (manual, out of CI)

- Download the published `image-trail-v<version>.zip`, verify its SHA-256 against
  the published `.sha256`, and submit it to the Chrome Web Store. CI publishes
  GitHub Release assets only; it does not submit to the store.

## Hardening reference

Enforced automatically each release build (do not regress):

- **Minification + dead-code stripping** — `minify`, `drop:['debugger']`,
  `pure:['console.debug']`, `NODE_ENV=production` (`scripts/extension-build-policy.mjs`).
- **Release text audit** — rejects sourcemap metadata, `debugger`,
  `console.debug`, unresolved `process.env`/`import.meta.env`, private keys,
  token/AWS-key-shaped strings, and build-machine paths.
- **Artifact allowlist** — only expected files ship; symlinks and stray files fail.
- **Reproducible identity** — release `build-info.json` carries no worktree and a
  fixed key set.
- **Least privilege** — every `manifest.json` permission maps to real API usage;
  no static `host_permissions` (runtime `optional_host_permissions` only); no CSP
  override (MV3 secure default: no remote code / eval). Re-audit permission usage
  whenever a permission is added.
