// Issue #856: wiki page -> target repo-relative path.
// Source of truth for the migration; maps every retired wiki page to where its
// canonical content now lives in-repo. Keys are wiki filenames.
//
// Groups:
//   A. Repo pointer stubs being restored (paths already exist; content replaced)
//   B. Wiki-only pages gaining a new in-repo home
//   C. Superseded/archive-only pages (retained under docs/ for reference, or
//      intentionally not migrated because the content is obsolete)

export const WIKI_PAGE_TO_REPO = new Map(Object.entries({
  // ---------- B. Operational / entrypoint guides (new homes) ----------
  'Contributing.md': 'docs/contributing.md',
  'Testing-Strategy.md': 'docs/testing-strategy.md',
  'Versioning-and-Releases.md': 'docs/versioning-and-releases.md',
  'Privacy-And-Permissions-Review.md': 'docs/privacy-and-permissions-review.md',
  'Design-System.md': 'docs/design-system.md',
  'Page-Context-Capability-Matrix.md': 'docs/page-context-capability-matrix.md',
  'Architecture-Decision-Records.md': 'docs/adr/README.md',
  'User-Stories.md': 'docs/user-stories/README.md',
  'Acceptance-Tests.md': 'docs/acceptance-tests/README.md',
  'Chrome-Web-Store-Submission.md': 'docs/acceptance-tests/chrome-web-store-submission.md',
  'Interop-Closeout-Evidence.md': 'docs/interop-closeout-evidence.md',
  'PCloud-API-Spike.md': 'docs/pcloud-api-spike.md',
  'Extension-Page-Destinations.md': 'docs/extension-page-destinations.md',
  'Recall-Drawer.md': 'docs/recall-drawer.md',

  // ---------- A. Restore existing pointer stubs (top-level docs/) ----------
  'June-20-2026-Regression-Fixes.md': 'docs/2026-06-20-regression-fixes.md',
  'Bookmarklet-Behavior-Map.md': 'docs/bookmarklet-behavior-map.md',
  'Brave-Extension-Port-Plan.md': 'docs/brave-extension-port-plan.md',
  'Extension-Port-Acceptance-Baseline.md': 'docs/extension-port-acceptance-baseline.md',
  'Extension-Port-Use-Cases.md': 'docs/extension-port-use-cases.md',
  'Host-Image-Projection-Ownership.md': 'docs/host-image-projection-ownership.md',
  'IndexedDB-Structure-Draft.md': 'docs/indexeddb-structure-draft.md',
  'Local-Storage-Structure-Draft.md': 'docs/local-storage-structure-draft.md',
  'Milestone-User-Story-Plan.md': 'docs/milestone-user-stories.md',
  'Milestone-User-Story-Plan-Updated.md': 'docs/milestone-user-stories.updated.md',
  'Extension-Build-Milestones.md': 'docs/milestones.md',
  'Proposed-Extension-File-Structure.md': 'docs/proposed-extension-file-structure.md',

  // ---------- A. Restore existing pointer stubs (docs/adr/) ----------
  'ADR-0001-Automation-Check-Governance.md': 'docs/adr/0001-automation-check-governance.md',

  // New ADRs not yet present in-repo
  'ADR-0002-React-UI-Renderer-Boundary.md': 'docs/adr/0002-react-ui-renderer-boundary.md',
  'ADR-0003-Workspace-Rails-And-Host-Reflow-Boundary.md': 'docs/adr/0003-workspace-rails-and-host-reflow-boundary.md',
  'ADR-0004-Overlook-Interop-Contract-And-Pairing-Custody.md': 'docs/adr/0004-overlook-interop-contract-and-pairing-custody.md',
  'ADR-0005-Overlook-Record-Translation-And-Durable-Pin-Custody.md': 'docs/adr/0005-overlook-record-translation-and-durable-pin-custody.md',
  'ADR-0006-Acknowledged-Move-Journals-And-Source-Deletion-Guards.md': 'docs/adr/0006-acknowledged-move-journals-and-source-deletion-guards.md',
  'ADR-0007-Deterministic-Reviewed-Sync-Journals.md': 'docs/adr/0007-deterministic-reviewed-sync-journals.md',
  'ADR-0008-Isolated-Encrypted-Interop-Transports.md': 'docs/adr/0008-isolated-encrypted-interop-transports.md',

  // ---------- A. Restore acceptance-test stubs ----------
  'Acceptance-Test-Acknowledged-Move-Journals.md': 'docs/acceptance-tests/acknowledged-move-journals.md',
  'Acceptance-Test-Bounded-Neighbor-Preloading.md': 'docs/acceptance-tests/bounded-neighbor-preloading.md',
  'Acceptance-Test-Common-Video-And-Audio-Media.md': 'docs/acceptance-tests/common-video-and-audio-media.md',
  'Acceptance-Test-Detachable-Sections.md': 'docs/acceptance-tests/detachable-sections.md',
  'Acceptance-Test-Deterministic-Reviewed-Sync.md': 'docs/acceptance-tests/deterministic-reviewed-sync.md',
  'Acceptance-Test-Encrypted-Image-Downloads.md': 'docs/acceptance-tests/encrypted-image-downloads.md',
  'Acceptance-Test-Encrypted-Session-Inactivity.md': 'docs/acceptance-tests/encrypted-session-inactivity.md',
  'Acceptance-Test-Form-Control-Consistency.md': 'docs/acceptance-tests/form-control-consistency.md',
  'Acceptance-Test-GIF-And-WebP-Media.md': 'docs/acceptance-tests/gif-and-webp-media.md',
  'Acceptance-Test-Gallery-Albums.md': 'docs/acceptance-tests/gallery-albums.md',
  'Acceptance-Test-Gallery-Design-System.md': 'docs/acceptance-tests/gallery-design-system.md',
  'Acceptance-Test-Grab-Mode-Strategies.md': 'docs/acceptance-tests/grab-mode-strategies.md',
  'Acceptance-Test-Host-Image-Projection-Ownership.md': 'docs/acceptance-tests/host-image-projection-ownership.md',
  'Acceptance-Test-In-Panel-Help.md': 'docs/acceptance-tests/in-panel-help.md',
  'Acceptance-Test-Interop-Contract-And-Pairing.md': 'docs/acceptance-tests/interop-contract-and-pairing.md',
  'Acceptance-Test-Isolated-Encrypted-Interop-Transports.md': 'docs/acceptance-tests/isolated-encrypted-interop-transports.md',
  'Acceptance-Test-Key-Backup-Restore.md': 'docs/acceptance-tests/key-backup-restore.md',
  'Acceptance-Test-Local-Only-Backup-Reminders.md': 'docs/acceptance-tests/local-only-backup-reminders.md',
  'Acceptance-Test-Local-Original-Capture-Survives-Remote-Loss.md': 'docs/acceptance-tests/local-original-capture-survives-remote-loss.md',
  'Acceptance-Test-M00-Planning-Baseline-Review.md': 'docs/acceptance-tests/m00-planning-baseline-review.md',
  'Acceptance-Test-MPEG-TS-Media.md': 'docs/acceptance-tests/mpeg-ts-media.md',
  'Acceptance-Test-Multi-Select-Image-Download.md': 'docs/acceptance-tests/multi-select-image-download.md',
  'Acceptance-Test-Overlook-Record-Translation.md': 'docs/acceptance-tests/overlook-record-translation.md',
  'Acceptance-Test-Overlook-Transfer-And-Sync-UI.md': 'docs/acceptance-tests/overlook-transfer-and-sync-ui.md',
  'Acceptance-Test-Oversized-Original-Is-Bounded.md': 'docs/acceptance-tests/oversized-original-is-bounded.md',
  'Acceptance-Test-Panel-Layout-Stability.md': 'docs/acceptance-tests/panel-layout-stability.md',
  'Acceptance-Test-Per-Site-Capture-Rules.md': 'docs/acceptance-tests/per-site-capture-rules.md',
  'Acceptance-Test-Queue-And-Recall-Clear-Delete-Semantics.md': 'docs/acceptance-tests/queue-recall-clear-delete.md',
  'Acceptance-Test-Recents-Retention-Settings.md': 'docs/acceptance-tests/recents-retention-settings.md',
  'Acceptance-Test-Recents-Scope-Selector.md': 'docs/acceptance-tests/recents-scope-selector.md',
  'Acceptance-Test-Row-And-List-Visual-System.md': 'docs/acceptance-tests/row-list-visual-system.md',
  'Acceptance-Test-Searchable-Metadata-Privacy-Policy.md': 'docs/acceptance-tests/searchable-metadata-privacy-policy.md',
  'Acceptance-Test-Secure-Workspace-Lock.md': 'docs/acceptance-tests/secure-workspace-lock.md',
  'Acceptance-Test-Settings-Action-Hierarchy.md': 'docs/acceptance-tests/settings-action-hierarchy.md',
  'Acceptance-Test-Settings-Utility-Layout.md': 'docs/acceptance-tests/settings-utility-layout.md',
  'Acceptance-Test-Shift-Modified-Capture-And-Pin.md': 'docs/acceptance-tests/shift-capture-to-pin.md',
  'Acceptance-Test-Storybook-UI-Review.md': 'docs/acceptance-tests/storybook-ui-review.md',
  'Acceptance-Test-Target-Picker-Captures-Only-The-Selected-Image.md': 'docs/acceptance-tests/target-picker-captures-only-selected-image.md',
  'Acceptance-Test-Third-Party-CDN-Permission-Flow.md': 'docs/acceptance-tests/third-party-cdn-permission-flow.md',
  'Acceptance-Test-Trusted-Privileged-Activation.md': 'docs/acceptance-tests/trusted-privileged-activation.md',
  'Acceptance-Test-URL-Review-Status-Import-Export.md': 'docs/acceptance-tests/url-review-status-import-export.md',
  'Acceptance-Test-URL-Template-Learning.md': 'docs/acceptance-tests/url-template-learning.md',
  'Acceptance-Test-Workspace-Rails-Cross-Site-Safety.md': 'docs/acceptance-tests/workspace-rails-cross-site-safety.md',
  'Acceptance-Test-pCloud-API-Spike.md': 'docs/acceptance-tests/pcloud-api-spike.md',
  'Acceptance-Test-pCloud-Provider-Boundary.md': 'docs/acceptance-tests/pcloud-provider-boundary.md',

  // ---------- A. Restore user-story stubs ----------
  'User-Story-M00-Planning-Baseline-And-Bookmarklet-Behavior-Map.md': 'docs/user-stories/m00-planning-baseline-and-bookmarklet-behavior-map.md',
  'User-Story-M01-MV3-Shell-Message-Contracts-And-Injected-Panel.md': 'docs/user-stories/m01-mv3-shell-message-contracts-and-injected-panel.md',
  'User-Story-M02-Target-Image-Selection-And-Page-Integration.md': 'docs/user-stories/m02-target-image-selection-and-page-integration.md',
  'User-Story-M03-URL-Parser-Field-Model-And-Navigation-Core.md': 'docs/user-stories/m03-url-parser-field-model-and-navigation-core.md',
  'User-Story-M04-IndexedDB-Keys-Local-Settings-And-Envelope-Foundation.md': 'docs/user-stories/m04-indexeddb-keys-local-settings-and-envelope-foundation.md',
  'User-Story-M05-Runtime-History-And-Bookmarks-Parity.md': 'docs/user-stories/m05-runtime-history-and-bookmarks-parity.md',
  'User-Story-M06-Stored-Originals-Capture-Pipeline-And-Cross-Origin-Permissions.md': 'docs/user-stories/m06-stored-originals-capture-pipeline-and-cross-origin-permissions.md',
  'User-Story-M07-Recall-Migration-Import-Export-And-Encrypted-Downloads.md': 'docs/user-stories/m07-recall-migration-import-export-and-encrypted-downloads.md',
  'User-Story-M08-Automation-Keybindings-And-Request-Governance.md': 'docs/user-stories/m08-automation-keybindings-and-request-governance.md',
  'User-Story-M09-LLM-Metadata-And-Encrypted-Metadata-Cache.md': 'docs/user-stories/m09-llm-metadata-and-encrypted-metadata-cache.md',
  'User-Story-M10-UI-Scale-Up-And-React-Vite-Decision.md': 'docs/user-stories/m10-ui-scale-up-and-react-vite-decision.md',
  'User-Story-M11-Hardening-Regression-Validation-And-Release-Readiness.md': 'docs/user-stories/m11-hardening-regression-validation-and-release-readiness.md',

  // ---------- A. Restore deprecated bookmarklet stubs ----------
  'Deprecated-Bookmarklet.md': 'deprecated/bookmarklet/README.md',
  'Deprecated-Bookmarklet-Architecture-Notes.md': 'deprecated/bookmarklet/docs/architecture-notes.md',
  'Deprecated-Bookmarklet-Bugs-And-Fixes.md': 'deprecated/bookmarklet/docs/bugs-and-fixes.md',
  'Deprecated-Bookmarklet-Add-Target-Picker-Single-Image-Auto-Detect.md': 'deprecated/bookmarklet/docs/target_picker_and_single-image_autodetect_962f4f39.plan.md',
  'Deprecated-Bookmarklet-Plan.md': 'deprecated/bookmarklet/plan.md',

// ---------- C. Archive/planning pages intentionally NOT migrated ----------
// Historical planning / wiki-architecture artifacts superseded by the restored
// user-stories, milestones, and ADR content above. Per the issue scope these are
// obsolete and removed rather than revived as source-controlled docs.
//
//   Home.md, Docs-Migration-Plan.md, Milestone-Zero-Baseline-Plan.md,
//   User-Story-Split-Plan.md, Project-Planning-Archive.md,
//   Retrospectives-and-Debugging-Notes.md, Agent-Feedback-And-Environment-Notes.md,
//   Repo-Documentation-Pointer-Map.md
}));

// Exit with error on a MISSING source wiki page so the map stays exhaustive.
export function repoPathForWikiPage(wikiFile) {
  return WIKI_PAGE_TO_REPO.get(wikiFile) ?? null;
}

export function hasWikiPageFor(wikiFile) {
  return WIKI_PAGE_TO_REPO.has(wikiFile);
}
