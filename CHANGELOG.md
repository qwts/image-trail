# image-trail

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
