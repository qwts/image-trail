# Image Trail Design System

This page is the canonical contract for Image Trail's production UI. The supplied HTML/React handoff is behavior and composition reference material; production rendering adopts locally bundled React incrementally while retaining typed plain-DOM factories as migration seams.

Tracking: [#538](https://github.com/qwts/image-trail/issues/538). Architecture decision: [ADR-0002](adr/0002-react-ui-renderer-boundary.md), [#539](https://github.com/qwts/image-trail/issues/539).

## Production source of truth

`extension/src/ui/styles/tokens.css` owns the shared tokens. It declares the same values for two environments:

- `:host` supplies tokens to the injected panel Shadow DOM.
- `:root` supplies tokens to extension-owned pages and Storybook.

`extension/src/ui/styles/design-system.css` is the injected UI entrypoint. Its order is part of the contract: tokens, primitives, feedback, panel shell, primary workflow, RecordRow, FieldRow, Settings/Help surface, then Settings integrations. `panel.css` imports that entrypoint before remaining legacy panel styles. The independent extension Gallery loads `gallery-tokens.css`, which imports the canonical tokens, primitives, feedback, and RecordRow sheets in that order; `gallery.css` owns only Gallery composition. Gallery has no compatibility palette, global legacy button/input theme, or second token source.

The panel's `all: initial` boundary does not reset custom properties, so tokens inherit from the Shadow host while host-page styles remain isolated.

## Token taxonomy

### Surfaces

| Token                                | Value                   | Use                               |
| ------------------------------------ | ----------------------- | --------------------------------- |
| `--it-panel-bg`                      | `rgb(0 0 0 / 88%)`      | Injected panel                    |
| `--it-drawer-bg`                     | `rgb(0 0 0 / 91%)`      | Recall and detached windows       |
| `--it-header-bg`                     | `rgb(9 9 9 / 98%)`      | Sticky chrome                     |
| `--it-menu-bg`                       | `#171717`               | Menus and popovers                |
| `--it-input-bg`                      | `#111`                  | Inputs and thumbnail placeholders |
| `--it-input-bg-privacy`              | `#080808`               | Masked inputs                     |
| `--it-control-bg`                    | `#222`                  | Controls                          |
| `--it-control-bg-hover`              | `#2b2b2b`               | Hovered controls                  |
| `--it-control-bg-alt`                | `#242424`               | Compact ghost controls            |
| `--it-fill-3` through `--it-fill-14` | white at 3% through 14% | Layered depth over black          |

### Text, borders, and semantic color

| Group                | Canonical values                               |
| -------------------- | ---------------------------------------------- |
| Text ramp            | `#fff`, `#eee`, `#ddd`, `#ccc`, `#aaa`, `#999` |
| Panel/control border | `#666`, `#555`                                 |
| Divider/row border   | white 12%, white 13%; row hover white 28%      |
| Target accent        | `rgb(89 255 178)`                              |
| Selected-row accent  | `rgb(124 255 168)`                             |
| Waiting accent       | `rgb(139 246 220)`                             |
| Focus / active field | `#8fd` / `#9ee`                                |
| Error / locked       | `rgb(255 112 112)` / `rgb(255 96 112)`         |
| Warning              | `rgb(226 188 103)`                             |
| Connected            | `rgb(123 190 138)`                             |
| Current buffer       | `#58a6ff`                                      |

Accent identifies an outline, glow, or restrained translucent surface. Do not turn mint into a large solid fill. Selected state must remain stronger than the stored-original indicator.

### Typography

- UI: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`.
- Mono: `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
- Sizes: 14px title, 12px heading/base, 11px small, 10px micro, 9px tiny.
- Weights: 400, 600, 700, and 800 for the strongest toast label.
- Base line height: 1.4. Tight ramps: 1.25 and 1.2.
- Uppercase micro-label tracking: `0.03em`.

Use mono for URLs, field values, badges, keycaps, and diagnostics. No webfonts.

### Spacing, radii, and geometry

| Contract                                     | Value                       |
| -------------------------------------------- | --------------------------- |
| Control cluster / row / section gaps         | 4px / 6px / 8px             |
| Panel padding                                | 10px                        |
| Radius: control / badge / row / card / panel | 4px / 5px / 6px / 7px / 8px |
| Pill radius                                  | 999px                       |
| Panel width                                  | 420px, bounded by viewport  |
| Recall/detached width                        | 340px, bounded by viewport  |
| Icon button                                  | 26px square                 |
| Minimum touch target                         | 44px                        |
| Record thumbnail                             | 44px                        |
| Record-row minimum height                    | 120px                       |

The system uses intentional 5px, 7px, 9px, and 11px values; it is not a strict 4/8 grid.

### Elevation and focus

- Panel shadow: `0 8px 24px rgb(0 0 0 / 45%)`.
- Menu shadow: `0 10px 26px rgb(0 0 0 / 42%)`.
- Target glow: mint 22% ring plus 34% 16px glow.
- Selected-row glow: green 14% ring plus 16% 12px glow.
- Wait glow: cyan 72%, 10px.
- Error glow: red 22%, 18px.
- Focus ring: `1px solid #8fd`, offset 2px. Existing controls may retain a stronger equivalent until migrated.

## Motion

Motion is restrained and never bouncy:

- fast interactions: 160ms;
- fades: 170ms;
- working sweep: 1200ms linear;
- waiting dot: 900ms;
- error frame: short three-pulse glow.

Every primitive and composed surface must disable nonessential animation under `prefers-reduced-motion: reduce` without hiding state.

## Privacy and lock treatment

- Encrypted and locked rows use the red-tinted locked surface at opacity 0.72.
- Key-unavailable rows use opacity 0.34.
- Masked text uses a faint gradient veil with `blur(0.5px)`.
- More private states become denser and more opaque, not more transparent.
- Privacy-safe status, title, tooltip, placeholder, and accessible-name copy must never echo URL-derived text.
- Do not hydrate encrypted original bytes merely to classify or render a row.

These treatments are visual expressions of existing product boundaries; they do not change storage or persistence behavior.

## Component inventory

Production views render from serializable input and dispatch existing named actions or callbacks. React components and retained typed DOM factories share that boundary; neither owns state, persistence, navigation, or storage.

| Primitive           | Contract                                                                                                               |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Button              | primary, secondary, ghost, danger, active, waiting, disabled, full-width                                               |
| IconButton          | 26px glyph wrapper with required accessible name and tooltip                                                           |
| Input / Select      | native semantics, label relationship, error and disabled states                                                        |
| Toggle              | native checked/disabled semantics with visible state                                                                   |
| Badge / StatusPill  | compact semantic metadata; never color alone                                                                           |
| Kbd                 | mono keyboard hint                                                                                                     |
| Toast               | status/error feedback without blocking controls                                                                        |
| Card                | tokenized grouped surface                                                                                              |
| SectionHeader       | title, collapse, detach, and action slots                                                                              |
| RecordRow           | shared visual states for Queue, Recents, Recall, export selection, and Gallery while preserving each source's behavior |
| FieldRow            | view-model-driven field controls without parser, commit, projection, or navigation ownership                           |
| Settings adapter    | shared semantics for existing stateful controls, groups, integrations, shortcuts, danger actions, and Help             |
| Destination shell   | shared real-tab identity, four-route navigation, source-tab status/return, and centered workspace composition          |
| Gallery composition | independent extension-page header, search, paging, albums, status, cards, locked, and empty states                     |

Core primitives are tracked in [#510](https://github.com/qwts/image-trail/issues/510), RecordRow in [#512](https://github.com/qwts/image-trail/issues/512), FieldRow in [#513](https://github.com/qwts/image-trail/issues/513), Settings/Help in [#514](https://github.com/qwts/image-trail/issues/514), and Gallery/final acceptance in [#515](https://github.com/qwts/image-trail/issues/515).

### Plain-DOM primitive API

Production factories live in `extension/src/ui/components/primitives.ts`. Import the named `createButton`, `createIconButton`, `createInput`, `createSelect`, `createToggle`, `createBadge`, `createStatusPill`, `createKbd`, `createToast`, `createCard`, or `createSectionHeader` function and pass its exported readonly options contract. Each factory returns a native element that can be inserted into the existing render tree.

- Callers own state and pass existing callbacks; factories only render DOM and dispatch native events.
- Buttons are always `type="button"`; inputs, textareas, selects, and checkboxes retain native form and keyboard behavior.
- Icon-only or non-text content requires an accessible name. Inputs accept either `ariaLabel` or `ariaLabelledBy`.
- `privacyMasked: true` is a separate typed Input and Toast contract: raw `value` or `message` input is rejected and never copied into rendered DOM.
- Shared production classes use the `image-trail-ds__*` prefix. Consumers choose semantic options instead of adding appearance classes or inline styles.
- `SectionHeader` composes caller-owned action elements and exposes collapse/detach callbacks without owning open or detached state.
- The injected UI entrypoint is `extension/src/ui/styles/design-system.css`. The extension-owned Gallery intentionally imports the required canonical subset through `gallery-tokens.css` in the same order.

Critique and interaction contracts live in Storybook under **Design System / Core primitives**. Complex queue records and field rows must use their later composed contracts instead of extending these factories with product behavior.

### Panel shell and primary workflow

The production shell is the first incremental React boundary:

- `extension/src/ui/react/panel-header.tsx` renders the shared header and destination dock; `extension/src/ui/react/target-picker-view.tsx` renders the stateful Host target. Both receive existing state/actions and own no product state.
- `extension/src/ui/react/react-subtree.tsx` is the explicit coexistence boundary for mounting and unmounting React inside the existing Shadow DOM and detached-section renderer.
- `extension/src/ui/components/panel-shell-view.ts` retains minimized-shell and targeted-toast factories while later surfaces migrate. Privacy mode replaces URL-derived status copy before it reaches visible text, tooltips, titles, or accessible names.
- `extension/src/ui/components/manual-controls-view.ts` renders the primary navigation and capture workflow. Previous, next, capture, slideshow, and Grab Mode remain visible; Field previous/next, retry, and stop actions stay under **More controls**, whose open state remains caller-owned.
- `extension/src/ui/render.ts` composes sections in the canonical order: Host target, URL editor, Field Editor, then Controls. Existing detach, Recall, focus restoration, scroll restoration, and targeted refresh behavior remain outside the visual factories.
- `extension/src/ui/components/detachable-section.ts` and `extension/src/ui/section-registry.ts` compose shared section chrome without changing detach, placeholder, drag, or window behavior.

Shell styles live in `panel-shell.css`; navigation and capture styles live in `primary-workflow.css`. Both are bounded design-system sheets imported by `design-system.css`. When migrating a surface, remove its superseded rules from `panel.css` instead of layering a duplicate visual implementation over them.

### RecordRow API

`extension/src/ui/components/record-row.ts` owns the typed, state-free `createRecordRow` factory. Queue, Recents, Recall, and Gallery pass display-safe values plus their existing actions; the factory owns only shared markup and visual-state classes.

- Layout is explicit: `panel`, `recall`, or `gallery`. Panel and Recall keep their existing row interaction target; Gallery receives a native button inside its list item.
- State is explicit: `default`, `selected`, `locked-encrypted`, or `key-unavailable`. `storedOriginal` remains an independent indicator so captured state never competes with selected state.
- `privacyMasked` suppresses the supplied thumbnail and adds the shared veil. Callers must still pass privacy-safe source, name, metadata, titles, warnings, and accessible copy; the factory does not accept or sanitize private records.
- Optional leading and action slots preserve Recall selection controls and Queue/Recents actions without moving product behavior into the primitive.
- Compatibility class options are temporary migration seams for existing consumer tests and layout rules. New visual state belongs in `record-row.css`, not consumer stylesheets.

`record-row.css` owns the full-height thumbnail bleed and mask, source/name/meta hierarchy, selection and encryption treatments, stored-original dot, privacy veil, focus, narrow Gallery sizing, and reduced-motion behavior. Consumer styles may own list layout and product-specific action placement but must not reimplement those visual states.

Critique and interaction contracts live in Storybook under **Design System / RecordRow**. Acceptance coverage is mapped under `design-system-record-row` in `tests/e2e/coverage-map.json`.

### FieldRow API

`extension/src/ui/components/field-row.ts` owns the typed, state-free `createFieldRow` factory. The Field Editor passes each production `FieldEditorRowViewModel` plus its existing callbacks; the factory owns shared markup and presentation without taking parser, URL-model, projection, navigation, or persistence ownership.

- State is explicit through `data-state`: `error` outranks `active`, which outranks `success`, `unchanged`, and `default`. Compatibility classes remain only for behavioral tests and migration seams.
- The production control order is value, radix, digit width, decrement, increment, reset, Trail inclusion, then split controls. Native inputs and buttons preserve keyboard order, accessible names, caret behavior, and commit-before-command behavior.
- The Field Editor summary exposes the active field and position/count when expanded or collapsed. Privacy mode substitutes `Private field` and never copies URL-derived labels or values into text, titles, placeholders, or accessible names.
- Numeric display radix changes presentation only; source field type and stored value remain unchanged. Split, reset, step, Trail inclusion, and delimiter/empty commits continue through the existing named callbacks.

`fields.css` is the sole visual owner for FieldRow, active summary, field controls, state surfaces, privacy masking, narrow reflow, focus, and reduced motion. It is imported by `design-system.css`; do not also import it directly from `panel.css` or reintroduce competing field rules there.

Critique and interaction contracts live in Storybook under **Design System / FieldRow** and **Extension UI / Field Editor**. They cover the state matrix, many candidates, navigable and non-navigable inclusion, failed/unchanged states, split fields, privacy, collapsed summary, narrow layout, actions, and keyboard focus order. Acceptance coverage is mapped under `url-template-learning` in `tests/e2e/coverage-map.json` and closes the focused critique work in [#249](https://github.com/qwts/image-trail/issues/249).

### Settings and Help composition

`extension/src/ui/components/settings-primitive-contracts.ts` is the bounded migration seam for Settings and Help. It applies the shared button, input, select, toggle, provider-status, waiting, and integration semantics to the existing native elements after each view is composed. It must not replace controls, listeners, state, persistence, provider behavior, file handling, focus, or scroll ownership.

- `settings-view.ts` owns the six Settings groups and their remembered open state. Group headings and bodies use the shared Settings classes while retaining native `<details>` behavior.
- Existing settings factories continue to own their labels, notes, values, actions, and dispatch. The adapter supplies visual semantics; it does not become a second form component system.
- Encryption uses the shared Badge and Card contracts. pCloud and other provider readouts use the shared StatusPill class and semantic tone mapping while retaining their existing connection and restore behavior.
- File inputs remain native and visually pair with a shared file-action label. Destructive actions remain in a separately bordered danger region.
- Help uses the same compact group rhythm and the shared Kbd primitive. Its static content remains privacy-inert.

`settings-surface.css` owns Settings group geometry, labels, native control composition, action groups, file pickers, readouts, focus, narrow reflow, and reduced motion. `settings-integrations.css` owns encryption, provider, restore-preview, template, danger, shortcut, and Help states. New Settings/Help visual behavior belongs in those sheets, not in `panel.css`.

Critique and interaction contracts live across the production Settings stories plus **Extension UI / Help**. Acceptance coverage is mapped under `design-system-settings-help` in `tests/e2e/coverage-map.json`.

### Gallery composition

Gallery remains an independent extension page backed by the durable bookmark and album message repositories. `gallery-view.ts` owns record cards and album membership affordances; `gallery-controls-view.ts` owns the header, search, paging, albums, and semantic status composition. Both are state-free view factories. `gallery.ts` retains loading, debounce, repository, preview, notification, and focus ownership.

- The page root opts into the shared primitive scope without importing panel layout, context navigation, destination navigation, or rail behavior.
- Header, paging, search, page limit, album CRUD, album selection, status, add/remove actions, and empty/error groups use shared Button, IconButton, Input, Card, SectionHeader, StatusPill, and RecordRow contracts.
- Gallery uses canonical `--it-*` tokens directly. `gallery.css` owns page/grid/popover geometry only and must not add a parallel palette or global control theme.
- `All Images` remains the default. Search and album views read durable queue records in queue order; viewing, filtering, album membership, and drag/drop must not update `queueUpdatedAt`.
- Gallery has no Recents surface and never hydrates encrypted original bytes to render. Original preview is requested only after explicit activation of a captured record.
- Locked and privacy states use display-safe records and shared visual semantics. The page must not expose private URL-derived copy in text, titles, placeholders, or accessible names.

Critique and interaction contracts live in Storybook under **Design System / Gallery**. Packaged-extension coverage lives in `tests/e2e/gallery-design-system.spec.ts`; the full manual and release-screenshot procedure is [Gallery Design System](acceptance-tests/gallery-design-system.md).

### Extension-page destinations

Dashboard, Gallery, Recall, and Settings share a locally bundled React page shell adapted from the handoff UI kit. The shell owns presentation and source-tab lifecycle only. Durable repositories, validated runtime messages, and local page controllers remain framework-independent; no `PanelState`, generic action proxy, prototype global, or host-page `localStorage` crosses the boundary.

The complete field/action ownership matrix, routes, source lifecycle, refresh and duplicate-tab rules, locked/privacy behavior, bounded reads, and acceptance evidence live in [Extension-page destinations](extension-page-destinations.md). Production code lives under `extension/src/destinations/` plus the retained independent Gallery controller.

## Iconography and imagery

- No icon font, SVG set, PNG icon set, emoji, or invented brand logo.
- The wordmark is plain `Image Trail`, system UI, 700/14px.
- Canonical text glyphs: `⚙`, `?`, `−`, `✕`, `⧉`, `◀`, `▶`, `‹`, `›`, `•`, and `▾`.
- Additional action glyphs in the handoff are `◉`, `⏵`, `⏸`, `⌖`, and `↩`.
- Status always combines color with text, a dot, or a pill.
- User thumbnails are the only imagery. Record thumbnails bleed from the left and fade beneath labels using a mask gradient.

## High-fidelity references

The supplied handoff archive contains:

- `screenshots/01-panel.png` and `03-capture-flash.png`: docked panel and capture-feedback reference;
- `screenshots/02-mocked-tab.png`, `04-dashboard.png`, `05-gallery.png`, and `06-recall.png`: destination references;
- `screenshots/07-settings.png` and `11a-settings-display.png` through `15-settings-system.png`: Settings shell and the five required groups;
- `screenshots/08-context-gallery.png` and `09-context-feed.png`: context-rail references;
- `screenshots/10-help.png` and `11-detached-windows.png`: Help and detached-window references;
- `tokens/*.css`: canonical values;
- `ui_kits/workspace/*`: behavior and composition reference only;
- `_ds_bundle.js`: compiled prototype component bundle.

The approved archive received 2026-07-14 has SHA-256 `5696d46897fcf6ca9ee50064c83d36b95c35a7c8448576df402eccefb6741e3d`. `tests/e2e/visual-acceptance.json` is the versioned inventory and ownership map for all 16 screenshots; `npm run test:e2e:coverage` rejects missing, reordered, or unowned references and verifies every automated acceptance path exists.

Ownership is complete without another issue: #540 owns the attached panel, capture feedback, Settings, Help, detached windows, and standard/narrow artifacts; #518 owns the real extension-page shell; #508 owns destination surfaces; #506 owns context rails and their reflow interaction. Deferred entries remain explicit in the manifest until those issues land.

The prototype must not be copied into the extension. React is allowed only through the local production boundary in [ADR-0002](adr/0002-react-ui-renderer-boundary.md); do not ship CDN runtime code, Babel-in-browser, prototype persistence, remote placeholder images, globals, or host-page `localStorage`.

Known handoff defects:

- the README points to `qwtm/image-trail`; the repository is `qwts/image-trail`;
- the README references `components/**/*.d.ts` and `components/**/*.prompt.md`, but those files are absent from the archive;
- prototype `:root` tokens alone do not reach the injected Shadow DOM;
- prototype `localStorage` persistence contradicts the extension-owned storage boundary.

## Adoption and acceptance

The completed dependency order is tokens, core primitives, panel shell, RecordRow, FieldRow, Settings/Help, then Gallery and final acceptance. Context navigation is specified separately in [Extension-page destinations](extension-page-destinations.md); advanced rail/reflow behavior remains a separate epic.

Each user-visible slice requires:

- a changeset and acceptance-coverage-map update;
- normal, focus, disabled, waiting, error, narrow, and reduced-motion coverage as applicable;
- privacy, locked, selected, and stored-original states where records appear;
- `npm run ci`, relevant Playwright E2E, and Storybook interaction coverage;
- a manual comparison with the supplied references.

For #540, `tests/e2e/design-baseline.spec.ts` produces deterministic packaged-extension artifacts at 924x540 and 360x740 for the panel shell, successful capture toast, Settings and each group, Help, and detached Settings. These artifacts assert stable geometry and semantics rather than committing platform-sensitive pixel snapshots. The build-info overlay is a local diagnostic and is removed from acceptance captures.

Product invariants remain unchanged: Recents are transient; pins/bookmarks are durable; queue order is `queueUpdatedAt`; Recall pages the queue producer; original blobs remain separate and encrypted.
