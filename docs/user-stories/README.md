# User Stories Index

One file per milestone. Shared planning context lives here.

## Story Files

| Order | File                                                                                                                                           | Milestone                                                             |
| ----: | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
|     0 | [m00-planning-baseline-and-bookmarklet-behavior-map.md](m00-planning-baseline-and-bookmarklet-behavior-map.md)                                 | M00: Planning Baseline And Bookmarklet Behavior Map                   |
|     1 | [m01-mv3-shell-message-contracts-and-injected-panel.md](m01-mv3-shell-message-contracts-and-injected-panel.md)                                 | M01: MV3 Shell, Message Contracts, And Injected Panel                 |
|     2 | [m02-target-image-selection-and-page-integration.md](m02-target-image-selection-and-page-integration.md)                                       | M02: Target Image Selection And Page Integration                      |
|     3 | [m03-url-parser-field-model-and-navigation-core.md](m03-url-parser-field-model-and-navigation-core.md)                                         | M03: URL Parser, Field Model, And Navigation Core                     |
|     4 | [m04-indexeddb-keys-local-settings-and-envelope-foundation.md](m04-indexeddb-keys-local-settings-and-envelope-foundation.md)                   | M04: IndexedDB, Keys, Local Settings, And Envelope Foundation         |
|     5 | [m05-runtime-history-and-bookmarks-parity.md](m05-runtime-history-and-bookmarks-parity.md)                                                     | M05: Runtime History And Bookmarks Parity                             |
|     6 | [m06-stored-originals-capture-pipeline-and-cross-origin-permissions.md](m06-stored-originals-capture-pipeline-and-cross-origin-permissions.md) | M06: Stored Originals, Capture Pipeline, And Cross-Origin Permissions |
|     7 | [m07-recall-migration-import-export-and-encrypted-downloads.md](m07-recall-migration-import-export-and-encrypted-downloads.md)                 | M07: Recall, Migration, Import/Export, And Encrypted Downloads        |
|     8 | [m08-automation-keybindings-and-request-governance.md](m08-automation-keybindings-and-request-governance.md)                                   | M08: Automation, Keybindings, And Request Governance                  |
|     9 | [m09-llm-metadata-and-encrypted-metadata-cache.md](m09-llm-metadata-and-encrypted-metadata-cache.md)                                           | M09: LLM Metadata And Encrypted Metadata Cache                        |
|    10 | [m10-ui-scale-up-and-react-vite-decision.md](m10-ui-scale-up-and-react-vite-decision.md)                                                       | M10: UI Scale-Up And React/Vite Decision                              |
|    11 | [m11-hardening-regression-validation-and-release-readiness.md](m11-hardening-regression-validation-and-release-readiness.md)                   | M11: Hardening, Regression Validation, And Release Readiness          |

---

## Planning Rules

- Preserve observable bookmarklet behavior before redesigning it.
- Keep `core/`, `data/`, `content/`, `background/`, and `ui/` boundaries intact.
- Keep business logic framework-independent.
- Use TypeScript compilation only until UI complexity justifies React/Vite.
- Treat IndexedDB, encryption envelopes, migrations, and key records as foundational interfaces, even when early UI coverage is minimal.
- Keep runtime/session-visible state separate from encrypted durable records.
- Store original image bytes only through explicit user action.
- Do not request broad host permissions up front.
- Every milestone should leave the extension in a manually testable state.

---

## Cross-Milestone Technical Spikes

These should be scheduled before or inside the earliest affected milestone.

| Spike                                 | Earliest Milestone | Pass Condition                                                             |
| ------------------------------------- | -----------------: | -------------------------------------------------------------------------- |
| MV3 ES module loading without bundler |                M01 | Unpacked extension loads compiled TypeScript output cleanly                |
| Content-script panel isolation        |                M01 | Page CSS does not materially break core panel controls                     |
| Target image mutation behavior        |                M02 | Late images and target changes are handled without stale references        |
| URL parser parity                     |                M03 | Fixture URLs round-trip and mutate by token position                       |
| IndexedDB migration safety            |                M04 | Failed migration leaves prior readable state when possible                 |
| WebCrypto envelope shape              |                M04 | Minimal encrypted record can be written/read with versioned metadata       |
| Extension-context image fetch         |                M06 | Same-origin and selected cross-origin outcomes are understood and surfaced |
| Optional host permission request flow |                M06 | Specific image origin can be requested without broad upfront permissions   |
| Encrypted export/import restore       |                M07 | Clean profile can import selected exported records                         |
| Automation request governance         |                M08 | Rapid manual and automated actions are throttled by the same cap model     |
| LLM image input fallback              |                M09 | Data URL and URL fallback paths behave predictably                         |

---

## Definition Of Done For Any Milestone

- The extension remains loadable as an unpacked MV3 extension.
- New state changes flow through named actions or repositories, not ad hoc UI writes.
- Storage changes include schema/version implications.
- Sensitive durable data is either encrypted or explicitly classified as plaintext local settings.
- Feature behavior has at least one manual happy-path and one failure-path check.
- New permissions are justified by a specific feature and documented.
- Any deferred behavior is explicitly listed rather than silently omitted.

## Per-Story Completion Template

Every milestone story should now include these sections before implementation begins:

1. **Documentation Review Complete** — names the docs reviewed, the story-specific guardrails, added acceptance criteria, and intentional out-of-scope work.
2. **Acceptance Scenarios** — concrete pass/fail criteria rather than broad intent.
3. **Planning Discipline To Apply Before Build** — shift-left, DRY, single-responsibility, secure-by-default, testability-first, explicit-interface, observability/status, and React-ready constraints.
4. **Implementation Notes** — patterns and module boundaries to preserve during coding.
5. **Test Notes** — manual or automated checks that can be prepared before integration.
6. **Acceptance Criteria Coverage Review** — what was missing, what was added, and whether uncertainty remains.
7. **Open Questions** — decisions that should be resolved explicitly instead of discovered late in implementation.

This keeps the stories reviewable as planning artifacts and prevents future implementation work from using undocumented assumptions.
