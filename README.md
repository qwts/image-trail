# Image Trail

[![CI](https://github.com/qwts/image-trail/actions/workflows/ci.yml/badge.svg)](https://github.com/qwts/image-trail/actions/workflows/ci.yml)
![status: pre-release](https://img.shields.io/badge/status-pre--release-orange)
![install: source only](https://img.shields.io/badge/install-source%20only-blue)
![node: 24.18.0](https://img.shields.io/badge/node-24.18.0-339933)
![platform: Chromium MV3](https://img.shields.io/badge/platform-Chromium%20MV3-4285F4)
![encrypted originals](https://img.shields.io/badge/originals-encrypted-6f42c1)
![pCloud backup](https://img.shields.io/badge/backup-pCloud-17a2b8)

Image Trail is a Brave/Chromium extension for turning image URL structure into
navigable trails and local galleries. It lets the URL patterns already present
on a site drive image progression, so you can recover images from hosted
services or run your own web photo server without hardcoding one-off gallery
rules for every URL shape.

It is built around a small in-page panel with target image selection, parsed URL
controls, transient Recents, durable pins/bookmarks, encrypted original capture,
Recall, encrypted backups, pCloud integration, and import/export workflows.

> **Status:** Image Trail is pre-release software. It is not product-ready, not
> published to an extension store, and should be installed from source only for
> development and review.

## What It Does

- Select a host-page image and project related image URLs back into that target.
- Parse URL structure into editable fields so numeric and patterned image
  trails can drive next/previous navigation.
- Learn source-specific URL patterns instead of requiring hardcoded gallery
  rules for each site or photo server.
- Keep Recents as transient session history while saving pins/bookmarks as
  durable queue records.
- Capture original image bytes into encrypted local storage linked from durable
  bookmark records, with key backup/restore flows for recovery.
- Use Recall to page durable pins/bookmarks back into the visible queue.
- Import, export, back up, and restore local Image Trail data, including
  encrypted backup files and pCloud-backed restore workflows.
- Govern automation with bounded request, retry, slideshow, shortcut, and
  neighbor-preload controls.

## Local Development

Use the Node version pinned in `.nvmrc`.

```sh
nvm use
npm ci
npm run build
```

The compiled extension is written to `extension/dist/`. Load that directory as
an unpacked extension in Brave or another Chromium browser:

1. Open the browser extension management page.
2. Enable developer mode.
3. Choose **Load unpacked**.
4. Select this repository's `extension/dist/` directory.

The extension manifest currently identifies the extension as Image Trail and
ships the built MV3 service worker/content-script bundle from `extension/dist/`.

## Documentation

Canonical long-lived documentation lives in the GitHub wiki, with root
`DESIGN.md` as the design-editor exception:

- [Image Trail Wiki](https://github.com/qwts/image-trail/wiki)
- [Contributing](https://github.com/qwts/image-trail/wiki/Contributing)
- [Testing Strategy](https://github.com/qwts/image-trail/wiki/Testing-Strategy)
- [Acceptance Tests](https://github.com/qwts/image-trail/wiki/Acceptance-Tests)
- [User Stories](https://github.com/qwts/image-trail/wiki/User-Stories)
- [Repo Documentation Pointer Map](https://github.com/qwts/image-trail/wiki/Repo-Documentation-Pointer-Map)
- [Design brief](DESIGN.md)
- [Versioning automation planning](https://github.com/qwts/image-trail/issues/387)

Repository markdown files are pointer stubs unless they are agent instruction
files, `README.md`, `CONTRIBUTING.md`, root `DESIGN.md`, or GitHub issue and
pull request templates. Update the wiki page linked from a stub, not the stub
itself.

## Validation

```sh
npm run lint
npm run format:check
npm test
npm run build
```

Before pushing implementation work, run the CI-equivalent gate:

```sh
npm run ci
```

`npm run ci` runs lint, format check, coverage-gated tests, and build. The
coverage gate uses `.c8rc.json`; CI uploads `coverage/lcov.info` when it runs.

## README Freshness Contract

`README.md` is the stable public front door for the project. Keep it current
when product-facing capabilities, install/build instructions, validation
commands, or release/versioning expectations change.

Detailed SOPs, ADRs, acceptance criteria, test strategy, implementation notes,
and fast-moving planning details belong in the wiki. If a PR changes behavior
that affects this README but intentionally does not update it, the PR should
state why.
