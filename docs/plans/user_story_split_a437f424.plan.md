---
name: User Story Split
overview: Split the milestone-level user stories from `docs/milestone-user-stories.updated.md` into one markdown file per milestone under `docs/user-stories`, preserving the document-provided story information while leaving new scaffolding sections intentionally blank.
todos:
  - id: create-story-directory
    content: Create `docs/user-stories` and a README index for shared milestone context.
    status: pending
  - id: transpose-milestones
    content: Create one user-story markdown file for each milestone `M00` through `M11` using only source-filled milestone content plus blank scaffold sections.
    status: pending
  - id: verify-split
    content: Check that the generated files cover all source milestones and do not fill the scaffold-only sections.
    status: pending
isProject: false
---

# User Story Split Plan

Create a new `[docs/user-stories](docs/user-stories)` directory and add one file per milestone from `[docs/milestone-user-stories.updated.md](docs/milestone-user-stories.updated.md)`.

Each milestone file will preserve only the filled content already present in the source document:

- Milestone title, order, and type
- Existing user-story sentence and milestone context paragraph
- Existing scope bullets
- Existing out-of-scope bullets
- Existing exit criteria bullets
- Existing primary artifacts, primary modules, and suggested additional modules where present

Each file will also include empty scaffolding sections for future elaboration, but those sections will not be filled in. The scaffold will be consistent across all milestone files:

- `## User Story` with the source story text already present
- `## Source Context` with the source milestone summary paragraph already present
- `## Scope`, `## Out Of Scope`, `## Exit Criteria`, and source-provided artifact/module sections already present
- `## Acceptance Scenarios` left as `TBD`
- `## Implementation Notes` left as `TBD`
- `## Test Notes` left as `TBD`
- `## Open Questions` left as `TBD`

Use predictable filenames so the milestone order is obvious:

- `[docs/user-stories/m00-planning-baseline-and-bookmarklet-behavior-map.md](docs/user-stories/m00-planning-baseline-and-bookmarklet-behavior-map.md)`
- `[docs/user-stories/m01-mv3-shell-message-contracts-and-injected-panel.md](docs/user-stories/m01-mv3-shell-message-contracts-and-injected-panel.md)`
- `[docs/user-stories/m02-target-image-selection-and-page-integration.md](docs/user-stories/m02-target-image-selection-and-page-integration.md)`
- `[docs/user-stories/m03-url-parser-field-model-and-navigation-core.md](docs/user-stories/m03-url-parser-field-model-and-navigation-core.md)`
- `[docs/user-stories/m04-indexeddb-keys-local-settings-and-envelope-foundation.md](docs/user-stories/m04-indexeddb-keys-local-settings-and-envelope-foundation.md)`
- `[docs/user-stories/m05-runtime-history-and-bookmarks-parity.md](docs/user-stories/m05-runtime-history-and-bookmarks-parity.md)`
- `[docs/user-stories/m06-stored-originals-capture-pipeline-and-cross-origin-permissions.md](docs/user-stories/m06-stored-originals-capture-pipeline-and-cross-origin-permissions.md)`
- `[docs/user-stories/m07-recall-migration-import-export-and-encrypted-downloads.md](docs/user-stories/m07-recall-migration-import-export-and-encrypted-downloads.md)`
- `[docs/user-stories/m08-automation-keybindings-and-request-governance.md](docs/user-stories/m08-automation-keybindings-and-request-governance.md)`
- `[docs/user-stories/m09-llm-metadata-and-encrypted-metadata-cache.md](docs/user-stories/m09-llm-metadata-and-encrypted-metadata-cache.md)`
- `[docs/user-stories/m10-ui-scale-up-and-react-vite-decision.md](docs/user-stories/m10-ui-scale-up-and-react-vite-decision.md)`
- `[docs/user-stories/m11-hardening-regression-validation-and-release-readiness.md](docs/user-stories/m11-hardening-regression-validation-and-release-readiness.md)`

Also add an index file at `[docs/user-stories/README.md](docs/user-stories/README.md)` that lists all generated story files and carries over the shared planning rules, cross-milestone technical spikes, and Definition of Done from the source document. This keeps shared planning context in one place instead of duplicating it into every story.

After creating the files, verify that all 12 milestones from the source document have a corresponding file and that scaffolding-only sections remain unfilled.
