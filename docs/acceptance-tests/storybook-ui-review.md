# Storybook UI Review

Image Trail uses Storybook as a component-first review harness for existing plain TypeScript DOM components. Stories should exercise isolated UI components with static fixtures and mock dispatch callbacks.

Storybook's own dev tooling may install React packages transitively for its manager UI. Image Trail stories and extension UI components must continue to use the existing plain TypeScript DOM render functions rather than React components.

## Commands

- Run Storybook locally: `npm run storybook`
- Build static Storybook output: `npm run build:storybook`

## Story Scope

- Prefer existing exported DOM render functions from `extension/src/ui/components`.
- Do not add React components, JSX, or a React renderer for Image Trail stories in this first pass.
- Use static fixtures from `extension/src/ui/stories`.
- Keep stories free of service worker, IndexedDB, encryption runtime, content-script page DOM, and full panel boot dependencies.
- Add stories for meaningful states: normal, selected, captured/original-linked, locked/private, loading, error, empty, long text, and narrow layout.
- Parsed fields and URL editor stories should cover active/editable, included/excluded, step controls, privacy masking, empty, long text, and disabled data-URL states supported by the current plain DOM component APIs.

## Review Intent

Storybook is the UI critique bench for Image Trail, not just a screenshot gallery. Stories should make accessibility gaps and quality-of-life cues easy to spot before they are buried in full extension flows. When a component has loading, network, retry, disabled, empty, error, privacy, or permission states, add stories that show those states directly. When the current component API cannot represent an expected cue, do not fake product behavior in the story; capture the missing state as follow-up work.

Review each new story for:

- Accessible names, labels, titles, focus affordances, and keyboard-visible controls.
- Clear loading, network, retry, disabled, and error cues where the component represents async work.
- Privacy-safe masked states that still explain what is hidden.
- Long text, narrow layout, and overflow behavior without clipped controls or shifting hit targets.

## Review Matrix

Use the stories as a checklist, not only as visual examples:

- Parsed fields: `ActiveField`, `IncludedAndExcluded`, `FailedLoad`, `PrivacyMasked`, `Collapsed`, and `Narrow` cover field focus, successful/failed navigation feedback, included/excluded controls, privacy masking, keyboard-reachable step buttons, and compact layout.
- URL editor: `Empty`, `ReviewNeededUrl`, `DataUrl`, `PrivacyMasked`, `LongOverflow`, and `Narrow` cover disabled data-URL editing, review-needed text, empty state, privacy-safe URLs, and overflow.
- Status and async cues: `Capturing`, `CapturePermissionError`, `PrivacyMaskedErrorToast`, `RetryAndRateLimit`, and `StorageUsage` cover loading, permission/network-style capture failure, privacy-safe toast copy, retry/rate-limit status, storage status, the sticky header status pill, the viewport-edge toast, and the panel-level waiting/error frame cues.
- Host target: `NeedsSelection`, `Picking`, `GrabMode`, `FillScreenActive`, `PrivacyMasked`, `LongOverflow`, and `Narrow` cover target selection, grab-mode state, pressed controls, privacy masking, long URL overflow, and compact layout.
- Recent history and bookmarks queue: `Empty`, `Selected`, `PinnedAndCaptured`, `LockedPrivate`, `LongOverflow`, `Narrow`, plus queue paging/selection stories cover transient recents, durable queue state, stored-original indicators, locked/private rows, and overflow.
- Recall drawer: `Loading`, `Error`, `Selected`, `HasMore`, and `Narrow` cover async loading, decrypt failure, disabled selection actions, pagination, and drawer sizing.
- Encrypted originals: `SetupRequired`, `LockedWithBackup`, `Busy`, `Unlocked`, `MaintenanceNeeded`, and `Narrow` cover lock/setup state, disabled busy controls, backup controls, waiting cues, and maintenance cues.
- Import and export: `Busy`, `Error`, `ImageUtilitiesReady`, `ImageUtilitiesLocked`, `ImageUtilitiesError`, and `Narrow` cover import/export disabled state, error messages, image-transfer availability, encrypted-transfer lock state, waiting cues, and file-picker layout.

If a reviewer expects a cue that is missing from this matrix and the production component API cannot render it, open a focused follow-up issue instead of adding story-only fake state. Follow-up #191 tracks explicit accessible labels/help text for password and file-picker controls surfaced by the Encrypted originals and Import and export stories.

## Adding Stories

1. Put component stories next to the component as `*.stories.ts`.
2. Reuse the Storybook host helpers so panel CSS sees the same root classes as the extension.
3. Add or extend static fixtures instead of reaching into live stores or browser APIs.
4. Keep production extension builds clean by leaving stories under the existing `tsconfig` excludes.

## Acceptance

- `npm run build:storybook` succeeds.
- Existing `npm run lint`, `npm run format:check`, `npm test`, and `npm run build` behavior remains unchanged.
- The normal extension build output does not include `*.stories` files or `extension/src/ui/stories`.
