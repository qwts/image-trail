## Motivation

<!-- Why is this change needed? Link related issues, wiki plans, or repo context. -->

## Description

<!-- What changed? Include implementation notes, user-facing behavior changes, or follow-up work. -->

## Documentation

<!-- Link docs/ADR/user-story/acceptance-test updates, or state why no documentation change is needed. -->

## Testing

<!-- List the exact commands you ran locally, for example: `npm test`. -->
<!-- Draft PRs start no Actions jobs. Run the agreed local gates before marking ready. -->
<!-- If you dispatched exact-SHA preflight, record the final SHA and successful CI run URL. -->

<!-- Coverage travels with the change — see the wiki Testing Strategy page. -->

- [ ] **Considered acceptance-flow impact.** If this PR adds or changes a user-facing flow, I updated `tests/e2e/coverage-map.json` — automated (`playwright-e2e` / `storybook` / `unit-dom`), or `manual` (with a `reason`) / `deferred` (with an `issue`). If it doesn't, there's no acceptance impact. (CI enforces this; opt out with a `no-acceptance-impact` note or label.)
- [ ] **Reviewed the file-size report.** Oversized touched files did not grow; any extraction isolates a coherent responsibility and preserves module boundaries rather than moving code into arbitrary helpers.

## Manual Testing

<!-- For UI/browser/user-visible behavior, list step-by-step manual checks and expected results. -->
<!-- If no manual testing is needed, state why automated coverage is sufficient. -->
