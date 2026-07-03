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
