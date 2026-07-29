# Image Trail — Claude Code adapter

Read [`AGENTS.md`](AGENTS.md) first; it is the canonical shared context.

Claude-specific permissions, hooks, worktree identity, and process-guard
behavior are enforced by [`.claude/settings.json`](.claude/settings.json) and
documented in
[`docs/claude-code-environment.md`](docs/claude-code-environment.md).

Use `/check` for the repository validation and invariant report. Use `/release`
only for an explicitly requested release operation.
