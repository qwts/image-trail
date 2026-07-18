# Image Trail — Claude Code guide

Start with **`AGENTS.md`**. It is the shared agent-context file and holds the
product invariants — recents are transient; pins/bookmarks/Recall semantics;
storage rules; queue order is `queueUpdatedAt`; selected state stays distinct
from stored-original — plus the branch/GitHub and documentation/validation
workflow. This file only adds Claude-specific orientation; do not duplicate
`AGENTS.md` here.

## Architecture

Layers, with a strict import direction:

```
core  ->  data  ->  background  ->  content  ->  ui
```

- `core` — pure domain logic, no DOM or `chrome` APIs.
- `data` — IndexedDB persistence and crypto (`extension/src/data/`).
- `background` — MV3 service worker; must not import `content/` or `ui/`.
- `content` — content scripts bridging the page; may depend on `background/`.
- `ui` — panel rendering; routes through `content/` controllers, never
  `data`/`background` directly.

ESLint enforces these boundaries via `no-restricted-imports` in
`eslint.config.js`. Do not bypass them. Layer-local context lives in
`extension/src/data/CLAUDE.md` and `extension/src/ui/CLAUDE.md`.

## Messaging

The background message protocol is registry-driven, not a `switch`. Add a
`defineMessage` entry to the registry (assembled in
`extension/src/background/service-worker.ts`, machinery in `message-dispatch.ts`)
and its schema in `message-schemas.ts`, with types in `messages.ts`. Do not add
raw `switch (message.type)` cases — that is exactly what the registry replaced.

## Before "done"

Run the gates from `AGENTS.md`:

```sh
npm run lint && npm run format:check && npm test && npm run build
```

`npm test` includes the happy-dom DOM suite (`npm run test:dom`). Storybook
interaction (`play`) tests are separate: `npm run test:stories` against a dev
server, or `npm run test:stories:ci` (CI runs the latter).

CI additionally runs `npm run test:cov` — a `c8` coverage gate over the unit +
DOM suites that fails below the `.c8rc.json` thresholds (lines/branches) and
writes `coverage/lcov.info`. Treat the thresholds as a ratchet: only raise them.

The Claude Code environment itself (checked-in `.claude/settings.json`
permissions and hooks, the process-tree guard, and the per-repo bootstrap) is
documented in `docs/claude-code-environment.md`; `npm run check:agent-env`
guards that wiring in CI.

Product invariants are enforced as executable checks: `tests/invariants.test.ts`
(recents never persisted; queue order is `queueUpdatedAt`, not envelope `updatedAt`;
Recall pages the queue producer, not the blob store) and the `no-restricted-syntax`
envelope-sort rule in `eslint.config.js`. The `/check` command
(`.claude/commands/check.md`) runs the gates plus these invariants and reports each.
