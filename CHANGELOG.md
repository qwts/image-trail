# image-trail

## 0.12.4

### Patch Changes

- e64a217: Replace every protected workspace and preview with one opaque unlock surface whenever encrypted storage is locked.

## 0.12.3

### Patch Changes

- 9627f35: Keep encrypted originals unlocked for the configured inactivity period across Manifest V3 worker restarts, with 5, 10, 15 minute and Never policies plus immediate manual lock.

## 0.12.2

### Patch Changes

- 6f0eca3: Let detached Recents and Queue windows grow with new rows until users choose a persistent custom size.

## 0.12.1

### Patch Changes

- e179cf2: Report thumbnail storage as always encrypted and migrate legacy settings that incorrectly labeled it plaintext.

## 0.12.0

### Minor Changes

- 0bd10f6: Add transient Recents scopes for the current page, current site, and all sites.

## 0.11.0

### Minor Changes

- 2884396: Add metadata-only source, record-kind, and image-type filters to Gallery.

## 0.10.2

### Patch Changes

- fb9c473: Minify and audit production release artifacts before packaging.

## 0.10.1

### Patch Changes

- ca53801: Harden workspace overlays across complex host layouts, interrupted gestures, private restart restoration, touch targets, zoom, reduced motion, and exact teardown.

## 0.10.0

### Minor Changes

- c6c6978: Add React-rendered floating workspace windows and four edge rails with shade, snap, ordered stacks, keyboard previews, and private per-page layout restoration.

## 0.9.0

### Minor Changes

- 9027223: Align bare-key navigation, capture, pinning, Help, and Settings with the updated workspace handoff; add a persisted Down-arrow assignment and privacy-safe capture/download feedback.

## 0.8.0

### Minor Changes

- 9781b17: Add self-contained React Dashboard, Gallery, Recall, and Settings extension pages with durable shared state and source-tab return handling.

## 0.7.0

### Minor Changes

- b356e31: Add accessible Dashboard, Gallery, Recall, and Settings dock routes with compact in-panel views, focus and scroll restoration, and a real Gallery-tab action.

## 0.6.0

### Minor Changes

- e364853: Detect single-image, gallery, and feed page contexts, expose a capability-aware React context switcher, and persist explicit per-host overrides in extension-owned settings.

## 0.5.0

### Minor Changes

- bb93d32: Align the injected panel, Settings, Help, capture feedback, and detached-window presentation with the approved design-system handoff, and add versioned visual-acceptance coverage for every supplied screenshot.

## 0.4.0

### Minor Changes

- f3c22ba: Adopt a locally bundled React UI boundary for the panel header, destination dock, and Host target while preserving the existing extension state, action, controller, detach, focus, and storage architecture.

## 0.3.1

### Patch Changes

- 23b4b2b: Add branded extension and toolbar icons for Chrome and the Chrome Web Store.

## 0.3.0

### Minor Changes

- 88c0533: Complete the design-system migration by aligning Gallery header, search, paging, albums, status, cards, locked and empty states on canonical tokens and shared primitives with focused accessibility and packaged-extension acceptance coverage.
- 6a29c88: Migrate the panel shell, status surfaces, Host target, URL editor, detached chrome, and primary navigation, capture, slideshow, and Grab Mode workflow to the shared design system.
- 70bd2fd: Migrate the Field Editor to the shared design-system FieldRow, active-field hierarchy, responsive states, and critique-ready Storybook coverage while preserving existing editing and navigation behavior.
- c183676: Unify Queue, Recents, Recall, and Gallery records on the shared design-system RecordRow with consistent selection, stored-original, encrypted, unavailable-key, privacy, and thumbnail states.
- 1088f9a: Migrate Settings, encrypted and cloud integrations, maintenance controls, shortcuts, and Help to the shared design system while preserving existing behavior and native control state.

### Patch Changes

- 6b5c96d: Add accessible plain-DOM design-system primitives with shared interaction states and Storybook coverage.

## 0.2.6

### Patch Changes

- 77e03b9: Add the shared production design-token foundation used by the injected panel and Gallery.

## 0.2.5

### Patch Changes

- ab59acc: Treat thumbnail and malformed blob rows as missing during original repair verification without reading encrypted payloads.

## 0.2.4

### Patch Changes

- a2fae10: Verify repairable encrypted originals without loading their ciphertext into memory.

## 0.2.3

### Patch Changes

- 9711f90: Add reviewable saved URL stepping presets for numbered filenames, gallery paths, and query parameters.

## 0.2.2

### Patch Changes

- b93864e: Add a queue repair flow that re-captures missing encrypted originals for selected durable pins without changing queue order.

## 0.2.1

### Patch Changes

- 93209dc: Clear stale pCloud backup details from Settings when persisted backup history is empty.

## 0.2.0

### Minor Changes

- 4b0dc5d: Add persisted display-only ordering controls for Recents and Queue.

### Patch Changes

- f8ccb97: Expose the build-info overlay toggle in Chromium extension keyboard shortcut settings.
- 627f761: Restore centered Recent metadata for Adaptive layouts with three or more visible rows and full-width, edge-feathered backgrounds for two-row layouts.
- 730864b: Add a recoverable permission grant and capture retry action.
- d5e4740: Harden CI/CD and repo automation (#278): cancel superseded PR CI runs, run CI on pushes to main, grouped weekly Dependabot updates, a husky + lint-staged pre-commit hook, and a changesets release flow whose `changeset:version` script keeps `extension/manifest.json` in step with `package.json`.
- fb629e7: Detachable sections are complete: the Queue section can now detach like Recent history and Settings, and the detach control supports drag-out — press and drag it to place the floating window exactly where you drop it (a plain click still detaches at the default spot).
- adf190f: Every panel section is now detachable — URL editor, Host target, Parsed fields, Manual controls, Recent history, Queue, and Settings — and you can grab a section by its header (or any empty surface) and drag it straight out of the panel to place its floating window; Escape cancels an in-progress drag, including window moves.
- 641d7d5: Add the detachable-section pattern and pilot it on Recent history: a keyboard-accessible detach control moves the section into a floating extension-owned window (drag its title to move, Escape or Restore returns it), leaving a stable placeholder in the panel.
- a634932: Detached section windows now have standard window chrome: a minimize button collapses the window to its title bar (session-only), and a close (X) button restores the section back into the panel, replacing the text Restore button.
- 3fb5c88: Centralize Field Editor display state and clarify Previous/Next field selection labels.
- 77e3aaf: Show parsed-field split lengths and add decimal/hex display toggles for numeric fields.
- 6af159c: Load a focused Recent history row when Enter is pressed.
- 45ab58e: Replace install-time all-sites access with active-tab injection and optional per-origin grants, including a narrow pCloud permission prompt.
- 6ae69f3: Add a Max kept recents setting so visible Recents can stay capped while hidden session-only overflow is separately bounded.
- a097397: Define empty and delimiter-changing parsed-field commits so raw delimiters reparse the projected field structure, reject split-invalidating edits, and add a structure reset.
- b2d516e: Recover the selected host image without a visible reset when redraw-heavy pages replace its DOM node.
- 89de32c: Refresh Gallery automatically when durable pins, captures, bookmarks, or album memberships change in another extension context, and add a lint-time guard against oversized new source files.
- 727913c: Rename the Parsed fields section to Field Editor.
- 303e619: Update row click and keyboard behavior so Recent, Queue, and Recall rows select first and project selected rows.
- 05c408c: Settings can now detach from the panel into its own floating window: a detach control beside the Settings heading moves the whole surface (all groups, encryption, import/export, cloud backup) into a wider window with the standard minimize/close chrome, while the header gear keeps toggling Settings open and closed wherever it lives. Escape pressed inside a text field no longer restores a detached window mid-edit.
- 36ef0aa: Remember verified pCloud backup details across sessions without storing provider secrets.
