# Image Trail

Image Trail is a Brave/Chromium extension for image URL navigation, runtime
history, durable pins/bookmarks, encrypted original capture, Recall, and
import/export workflows.

## Documentation

Canonical documentation lives in the GitHub wiki:

- [Image Trail Wiki](https://github.com/qwtm/image-trail/wiki)
- [Contributing](https://github.com/qwtm/image-trail/wiki/Contributing)
- [Repo Documentation Pointer Map](https://github.com/qwtm/image-trail/wiki/Repo-Documentation-Pointer-Map)

Repository markdown files are pointer stubs unless they are agent instruction
files. Update the wiki page linked from a stub, not the stub itself.

## Local Checks

```sh
npm run lint
npm run format:check
npm test
npm run test:cov
npm run build
```

`npm run test:cov` runs the test suites under `c8` and enforces the coverage
thresholds in `.c8rc.json`; CI runs it and uploads `coverage/lcov.info`.

## Extension Build

```sh
npm run build
```

The compiled extension output is written under `extension/dist/`.
