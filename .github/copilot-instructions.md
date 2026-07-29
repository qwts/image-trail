# Copilot review adapter

Read [`AGENTS.md`](../AGENTS.md) first. It is the canonical source for Image
Trail product boundaries and repository workflow; do not restate them here.

## Review focus

Prioritize findings that can cause:

- privacy leaks from plaintext URL, title, thumbnail, dimension, or generated
  metadata;
- state corruption, queue reordering, or original-photo loss;
- destructive behavior that bypasses relationship and reference-count rules;
- UI ambiguity between selection, pin, and stored-original states;
- inaccessible pointer-only, hover-only, focus-breaking, or color-only
  interactions;
- broad permissions, untrusted network behavior, or weakened release gates;
- missing regression or acceptance evidence for changed behavior.

Prefer a small number of actionable, line-specific findings over style
commentary. Flag unrelated refactors and formatting churn in narrow PRs.

For behavior, storage, security, CI, automation, or workflow changes, verify
that the PR names the relevant wiki, acceptance, or ADR update and gives exact
validation evidence. Apply the clear/delete language and accessibility
contracts from [`DESIGN.md`](../DESIGN.md) without duplicating them here.
