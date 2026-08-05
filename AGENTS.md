# Agent Instructions

Canonical agent context for Image Trail; vendor files are thin adapters.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and its
[wiki guide](https://github.com/qwts/image-trail/wiki/Contributing).

## Product boundaries

- Image Trail is pre-release, source-only Chromium extension software.
- Recents are transient session state. Never persist them unless the user
  explicitly pins or bookmarks a record.
- Pins are durable queue records. Bookmarks are pins linked to captured original
  bytes; record metadata and encrypted original bytes remain separate.
- Recall pages the durable queue producer, never the blob store or a copy of the
  visible queue. Recalling moves selected records to the queue front without
  adding them to Recents.
- Queue order is `queueUpdatedAt`, not encrypted-envelope `updatedAt`. Metadata
  refreshes must not reorder records or reseal encrypted metadata.
- Extension-owned state uses IndexedDB or extension-owned messaging, never
  host-page `localStorage`.
- Selected state remains visually distinct from stored-original state; a stored
  original is an indicator, not a competing selection background.
- Transfer & Sync is experimental. Baseline and release builds keep it disabled
  and omit `nativeMessaging`; enable it only in an explicit experimental build.

Executable checks in `tests/invariants.test.ts`, `tests/manifest-commands.test.ts`,
and `eslint.config.js` enforce the highest-risk boundaries.

## Context map

| Work                                                 | Read first                                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Issue claims, branches, PRs, review threads, cleanup | [Contributing](https://github.com/qwts/image-trail/wiki/Contributing)                                                     |
| Product model, UI, privacy, accessibility            | [DESIGN.md](DESIGN.md)                                                                                                    |
| Tests, coverage, acceptance ledger                   | [Testing Strategy](https://github.com/qwts/image-trail/wiki/Testing-Strategy)                                             |
| Versioning, changesets, release packaging            | [Versioning and Releases](https://github.com/qwts/image-trail/wiki/Versioning-and-Releases)                               |
| Data, IndexedDB, crypto, queue ordering              | [data context](extension/src/data/AGENTS.md)                                                                              |
| UI rendering and interaction traps                   | [UI context](extension/src/ui/AGENTS.md)                                                                                  |
| Guarded local processes and isolation                | [docs/agent-process-guard.md](docs/agent-process-guard.md)                                                                |
| Claude-specific enforcement                          | [docs/claude-code-environment.md](docs/claude-code-environment.md)                                                        |
| Full validation and invariant report                 | [.agents/skills/source-command-check/SKILL.md](.agents/skills/source-command-check/SKILL.md)                              |
| Agent primitive inventory and eval cases             | [.agents/governance.json](.agents/governance.json) and [.agents/evals/golden-tasks.json](.agents/evals/golden-tasks.json) |

Layer direction is enforced by ESLint:
`core → data → background → content → ui`. Read the nearest directory
`AGENTS.md` before changing data or UI internals.

## Repo-specific working agreement

- Keep chat brief. During issue work, put scope, progress, validation, and
  review handoff on the issue.
- A request to implement an issue authorizes the stated scope. Follow the wiki
  claim/branch-link flow, then post the confirmed problem or scope and plan.
- Before editing, state the likely fix, why it may fail, confidence, and possible
  regressions in one short line each.
- Preserve unrelated work. Keep one behavioral objective per PR and carry every
  actionable review thread through visible reply, fix or rationale, then resolve.
- User-visible or workflow changes need the corresponding wiki/acceptance update
  and an honest manual test script before final review.

## Validation and process safety

- Use the Node version in `.nvmrc`; install with `npm ci`.
- Draft PRs start no Actions jobs. Before marking a PR ready, run `npm run ci`
  and use the source-command-check skill for the full E2E, Storybook, coverage,
  and invariant report. After pushing the final branch SHA, an agent may
  dispatch `ci.yml` with purpose `exact-sha-preflight`; wait for that exact SHA
  to pass before marking the PR ready.
- Run tests only through guarded npm entrypoints. Never invoke raw test runners,
  `:run`/`:inner` scripts, or headed/UI browser modes as an agent.
- Poll or terminate a live guarded run before starting another. An `rss-limit`
  or `timeout` kill is a real failure; inspect `.guard/last-run.json` and do not
  raise the limit to force a pass.
- Release validation must include `npm run build:release` and confirm
  `nativeMessaging` is absent from both `extension/dist/manifest.json` and the
  packaged baseline.

<!-- governed:shared-agent-discovery:start -->

## Shared agent conventions and skills

PR-first workflow, validation-before-push, commit and PR hygiene, and the
untrusted-input threat model are defined once, for every repo, in the
[org-wide agent conventions](https://github.com/qwts/playbook-engineering/blob/main/docs/reference/agent-conventions.md).
Before creating or copying a repo-local skill, consult the
[shared agent skills](https://github.com/qwts/playbook-engineering/blob/main/skills/README.md)
index. Reuse a shared skill when it fits; only a skill genuinely specific
to this repository belongs in its local context.
This repository is governed by
[playbook-engineering](https://github.com/qwts/playbook-engineering) — its
[shared SOPs](https://github.com/qwts/playbook-engineering/blob/main/docs/sop/README.md)
and [engineering decisions](https://github.com/qwts/playbook-engineering/blob/main/docs/decisions/README.md)
apply here by default
([ENG-0008](https://github.com/qwts/playbook-engineering/blob/main/docs/decisions/ENG-0008-shared-sop-inheritance.md):
inherit by default, vary by explicit delta).
<!-- governed:shared-agent-discovery:end -->
