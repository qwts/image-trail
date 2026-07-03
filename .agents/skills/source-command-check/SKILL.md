---
name: 'source-command-check'
description: 'Run the full validation gates plus the product-invariant checks and report privacy, queue-order, and recents-persistence status explicitly.'
---

# source-command-check

Use this skill when the user asks to run the migrated source command `check`.

## Command Template

Run Image Trail's validation gates **and** the executable product-invariant checks, then report the
result. Do not skip a step; if a gate fails, stop and surface the failure verbatim.

## 1. Run the gates (in order)

```sh
npm run lint          # includes lint:package (no "latest" pins) + eslint (incl. the envelope.updatedAt sort rule)
npm run format:check
npm test              # typecheck + compile + unit + DOM suites (includes tests/invariants.test.ts)
npm run build
npm run test:e2e      # validates tests/e2e/coverage-map.json, then runs the Playwright extension smoke gate
npm run test:cov      # c8 coverage gate; must stay at/above the .c8rc.json floor
npm run test:stories:ci  # Storybook interaction (play) tests; matches CI after build + e2e
```

## 2. Confirm the product invariants (from `tests/invariants.test.ts`)

These encode the highest-stakes rules in `AGENTS.md` → "Product Model" / "Storage Rules". `npm test`
already runs them; call out each one by name so a regression is impossible to miss:

- **Recents persistence (privacy leak):** the recents layer
  (`extension/src/content/recent-history-store.ts`, `extension/src/data/runtime/runtime-history.ts`)
  must expose no durable IndexedDB / `chrome.storage` write path.
  Recents are transient — persisting them is a privacy leak.
- **Queue order:** queue paging must sort by `queueUpdatedAt`, never the encrypted envelope's
  `updatedAt`. Enforced behaviorally by the repository test and syntactically by the
  `no-restricted-syntax` sort rule in `eslint.config.js`.
- **Recall vs. blob store:** Recall must page the queue producer and never read the encrypted blob
  store directly.

## 3. Report

State, explicitly:

- ✅/❌ per gate (lint, format:check, test, build, test:e2e, test:cov, test:stories:ci), with the
  failing output if any.
- ✅/❌ per invariant above. If `tests/invariants.test.ts` failed, name which invariant regressed and
  quote the assertion message.
- Any `no-restricted-syntax` violation reported by `eslint` (the envelope.updatedAt sort footgun).

If everything passes, say so plainly and note the current coverage numbers from the `test:cov` output.
Never report a gate as passing that you did not actually run.
