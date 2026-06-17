# Proposed Extension File Structure

## Goals

- Keep the working bookmarklet preserved as a fallback/debug artifact.
- Keep the extension core framework-independent so React/Vite can be adopted later without rewriting parser, storage, crypto, or image-navigation logic.
- Use TypeScript for extension source while keeping generated runtime JavaScript simple and reviewable.
- Separate page DOM interaction from extension UI rendering.
- Separate runtime/session state from encrypted durable IndexedDB state.
- Avoid bundlers and external runtime dependencies for the first implementation unless UI complexity later justifies React/Vite.

## Top-Level Layout

```text
image-bookmarklet/
  bookmarklet/
    ...
  deprecated/
    bookmarklet/
      ...
  docs/
    brave-extension-port-plan.md
    proposed-extension-file-structure.md
  extension/
    package.json
    tsconfig.json
    manifest.json
    src/
    dist/
    public/
```

## Source And Runtime Layout

TypeScript source should live under `extension/src/`. The extension manifest should load compiled JavaScript from `extension/dist/`. Static assets can live under `extension/public/` or `extension/assets/`.

```text
extension/
  package.json
  tsconfig.json
  manifest.json
  src/
    background/
    content/
    core/
    data/
    ui/
    assets/
    test-fixtures/
  dist/
    background/
    content/
    core/
    data/
    ui/
```

The first build step should be TypeScript compilation only. Vite should wait until React or another real UI need justifies it.

## Source Layout

```text
extension/src/
  background/
    service-worker.ts
    messages.ts
    permissions.ts
    downloads.ts
  content/
    content-script.ts
    page-adapter.ts
    target-image.ts
    page-style.ts
    dom-observer.ts
    keyboard.ts
    request-throttle.ts
  core/
    app-controller.ts
    actions.ts
    state.ts
    types.ts
    url/
      parse-url.ts
      rebuild-url.ts
      tokenize-fields.ts
      field-patterns.ts
      field-aliases.ts
      types.ts
    image/
      image-navigation.ts
      image-metadata.ts
      thumbnails.ts
      fingerprints.ts
      types.ts
    automation/
      navigation-queue.ts
      slideshow.ts
      retry-404.ts
      types.ts
    llm/
      schemas.ts
      prompts.ts
      metadata-client.ts
      types.ts
  data/
    db.ts
    schema.ts
    migrations.ts
    local-settings.ts
    local-settings-migrations.ts
    types.ts
    repositories/
      keys-repository.ts
      history-repository.ts
      bookmarks-repository.ts
      settings-repository.ts
      downloads-repository.ts
    crypto/
      webcrypto.ts
      envelope.ts
      keyring.ts
      password-wrap.ts
      lock.ts
      webauthn-wrap.placeholder.ts
      types.ts
    runtime/
      runtime-history.ts
      undo-stack.ts
      session-unlock.ts
    import-export/
      history-export.ts
      history-import.ts
      key-export.ts
      key-import.ts
      encrypted-file-format.ts
  ui/
    panel.ts
    render.ts
    types.ts
    components/
      status-view.ts
      url-editor-view.ts
      fields-view.ts
      controls-view.ts
      history-view.ts
      bookmarks-view.ts
      lock-view.ts
      import-export-view.ts
      target-picker-view.ts
    styles/
      panel.css
    react-ready/
      README.md
  assets/
    icons/
  test-fixtures/
    urls.ts
    sample-history.json
```

## Runtime Layout

```text
extension/dist/
  background/
    service-worker.js
    messages.js
    permissions.js
    downloads.js
  content/
    content-script.js
    page-adapter.js
    target-image.js
    page-style.js
    dom-observer.js
    keyboard.js
    request-throttle.js
  core/
    app-controller.js
    actions.js
    state.js
    url/
      parse-url.js
      rebuild-url.js
      tokenize-fields.js
      field-patterns.js
      field-aliases.js
    image/
      image-navigation.js
      image-metadata.js
      thumbnails.js
      fingerprints.js
    automation/
      navigation-queue.js
      slideshow.js
      retry-404.js
    llm/
      schemas.js
      prompts.js
      metadata-client.js
  data/
    db.js
    schema.js
    migrations.js
    local-settings.js
    local-settings-migrations.js
    repositories/
      keys-repository.js
      history-repository.js
      bookmarks-repository.js
      settings-repository.js
      downloads-repository.js
    crypto/
      webcrypto.js
      envelope.js
      keyring.js
      password-wrap.js
      lock.js
      webauthn-wrap.placeholder.js
    runtime/
      runtime-history.js
      undo-stack.js
      session-unlock.js
    import-export/
      history-export.js
      history-import.js
      key-export.js
      key-import.js
      encrypted-file-format.js
  ui/
    panel.js
    render.js
    components/
      status-view.js
      url-editor-view.js
      fields-view.js
      controls-view.js
      history-view.js
      bookmarks-view.js
      lock-view.js
      import-export-view.js
      target-picker-view.js
    styles/
      panel.css
    react-ready/
      README.md
  assets/
    icons/
  test-fixtures/
    urls.js
    sample-history.json
```

## Module Responsibilities

### `background/`

- Owns MV3 service worker entry points.
- Handles browser action click, content-script injection, extension-level messaging, optional host permission requests, and download orchestration.
- May perform extension-context fetches when needed for CORS-sensitive image/metadata flows.
- Must not own DOM state, unlocked key state, or long-running automation as its only durable source of truth.

### `content/`

- Owns active-page integration.
- Injects/toggles the panel.
- Finds and binds target images.
- Applies image URLs to DOM elements.
- Handles immediate preview styling when exactly one image exists on injection.
- Observes DOM changes for late-loaded images and target-pick mode.
- Handles keyboard shortcuts and routes actions through the core controller.
- Enforces request throttling for both automation and rapid manual navigation.

### `core/`

- Contains framework-independent business logic.
- Owns URL parsing/rebuilding, editable field tokenization, field aliases, advanced field patterns, image navigation decisions, automation state machines, and LLM request shaping.
- Should not directly import DOM APIs except through small adapters when unavoidable.
- Should not depend on React or Vite.
- Should use TypeScript types for URL token models, action payloads, parser output, automation state, and message contracts.

### `data/`

- Owns IndexedDB schema, migrations, repositories, encryption envelopes, key wrapping, lock/unlock flows, runtime history, and session-only undo.
- Separates encrypted durable storage from runtime-visible session history.
- Keeps recent 30-minute history in runtime memory while storing encrypted durable records in IndexedDB.
- Provides recall/decrypt operations that bring selected encrypted records into the active history view.
- Owns local settings schema and migrations for any plaintext extension-local settings.
- Should use TypeScript interfaces/discriminated unions for schema versions, encrypted envelopes, key wrapping methods, migration records, and repository inputs/outputs.

## Schema And Migration Strategy

- IndexedDB and local settings must both have explicit schema versions.
- `src/data/schema.ts` should define the current IndexedDB database name, version, object stores, indexes, and record shapes.
- `src/data/migrations.ts` should contain ordered IndexedDB upgrade steps. Each upgrade should be idempotent where possible and should avoid decrypting all records during structural migrations unless absolutely required.
- `src/data/local-settings.ts` should wrap all access to `chrome.storage.local`, extension local storage, or any other plaintext settings store so callers never read/write raw keys directly.
- `src/data/local-settings-migrations.ts` should own versioned migrations for plaintext settings such as theme, sorting, panel layout, UI preferences, and non-sensitive algorithm choices.
- Encrypted record formats need their own payload version inside the encrypted envelope so data can evolve independently from the IndexedDB object-store version.
- Key records need versioned wrapping metadata so future key rotation, password wrapping changes, or WebAuthn/YubiKey wrapping can be introduced without rewriting unrelated records.
- Migration failures should leave the previous readable state intact when possible and surface a clear recovery/status message.
- Any migration that changes encryption, wrapping, or export file formats should include a manual backup/export recommendation before running.

### `ui/`

- Owns the injected panel rendering.
- First implementation can use plain DOM rendering.
- UI components should render from explicit state and call named action functions.
- UI should not contain parser, crypto, IndexedDB, image navigation, or service-worker logic.
- `ui/react-ready/README.md` can later document which plain-DOM views map to React components if React/Vite is adopted.

## First Implementation Subset

The initial vertical slice should only create the files needed for:

- `manifest.json`
- `package.json`
- `tsconfig.json`
- `src/background/service-worker.ts`
- `src/content/content-script.ts`
- `src/content/page-adapter.ts`
- `src/content/target-image.ts`
- `src/content/page-style.ts`
- `src/content/dom-observer.ts`
- `src/content/keyboard.ts`
- `src/content/request-throttle.ts`
- `src/core/app-controller.ts`
- `src/core/actions.ts`
- `src/core/state.ts`
- `src/core/types.ts`
- `src/core/url/parse-url.ts`
- `src/core/url/rebuild-url.ts`
- `src/core/url/tokenize-fields.ts`
- `src/core/url/types.ts`
- `src/data/db.ts`
- `src/data/schema.ts`
- `src/data/migrations.ts`
- `src/data/local-settings.ts`
- `src/data/local-settings-migrations.ts`
- `src/data/types.ts`
- `src/data/crypto/webcrypto.ts`
- `src/data/crypto/envelope.ts`
- `src/data/crypto/keyring.ts`
- `src/data/crypto/types.ts`
- `src/data/repositories/keys-repository.ts`
- `src/data/repositories/history-repository.ts`
- `src/data/runtime/runtime-history.ts`
- `src/data/runtime/undo-stack.ts`
- `src/ui/panel.ts`
- `src/ui/render.ts`
- `src/ui/styles/panel.css`

Other files should be added only when their feature phase begins.

## TypeScript Build Boundary

- TypeScript is for source safety, not for adding runtime complexity.
- The initial build should emit browser-compatible ES modules into `dist/`.
- No bundling should be required for the first pass unless Chrome extension module-loading constraints force a small, explicit adjustment.
- Type definitions should be strongest around storage records, encrypted envelopes, migration inputs/outputs, message contracts, and URL token models.
- Avoid clever type-level programming. Prefer readable interfaces, discriminated unions, and explicit conversion/validation at storage boundaries.

## React/Vite Adoption Point

React/Vite should be revisited when the panel needs enough UI structure to justify it, such as:

- Key-management unlock flows.
- Encrypted-history recall/search.
- Batch selection and editing.
- Import/export dialogs.
- Thumbnail gallery behavior.
- Complex sorting/filtering controls.

If adopted, React should replace `ui/` rendering only. The `core/`, `data/`, `content/`, and `background/` boundaries should remain intact.

Potential later layout:

```text
extension/
  package.json
  vite.config.js
  src/
    background/
    content/
    core/
    data/
    ui/
      react/
        App.jsx
        components/
```

The build output should stay reviewable and avoid bundling unnecessary dependencies.

## Naming Notes

- Use `bookmarks` in new extension code even if the bookmarklet called them `favorites`; preserve `favorites` only when importing old data or matching old UI labels.
- Use `history` for durable encrypted records and `runtimeHistory` for the active session-visible list.
- Use `targetImage` for the page image being controlled.
- Use `fieldPattern` for domain/folder-specific split rules.
- Use `fieldAlias` for user-facing labels that map back to real URL fields.
