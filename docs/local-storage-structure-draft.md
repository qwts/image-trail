# Local Storage Structure Draft

## Purpose

Local/plain extension storage is for non-sensitive settings that should remain lightweight and easy to load before IndexedDB unlock. Sensitive settings can be moved into encrypted IndexedDB through the lock flow.

This is an early draft. Content scripts must not use host-page `localStorage` for extension settings because that makes settings vary by site origin. Plain local settings should be extension-owned, currently loaded and saved through service-worker messages backed by `chrome.storage.local`.

## Storage Rule

Application code should not directly read or write raw local storage keys.

Use:

```text
src/data/local-settings.ts
src/data/local-settings-migrations.ts
src/content/local-settings-store.ts
```

This keeps schema changes, defaults, validation, migration behavior, and extension-owned storage boundaries centralized.

## Local Settings Key

Draft top-level key:

```text
imageBookmarkletExtension.localSettings.v1
```

The stored value should be a single versioned object.

## Draft Shape

```json
{
  "schemaVersion": 1,
  "updatedAt": "ISO timestamp",
  "ui": {
    "theme": "dark",
    "panelWidth": 370,
    "panelSide": "left",
    "panelCollapsed": false,
    "sectionState": {
      "imageDescription": true,
      "fullUrl": false,
      "domain": false,
      "fields": true,
      "controls": false,
      "styling": false,
      "bookmarks": true,
      "history": true
    }
  },
  "historyView": {
    "runtimeWindowMinutes": 30,
    "activeViewMaxItems": 200,
    "sortMode": "recent",
    "sortDirection": "desc",
    "showThumbnails": true,
    "filterMode": "runtime-only",
    "lastKeywordSearch": ""
  },
  "navigation": {
    "direction": "up",
    "step": "1",
    "minimumRequestIntervalMs": 250,
    "manualQueueMode": "coalesce",
    "globalRequestCap": {
      "count": 120,
      "windowMs": 60000
    }
  },
  "automation": {
    "slideshowPauseMs": 1200,
    "auto404Enabled": false,
    "auto404Count": 0,
    "auto404DelayMs": 300,
    "preloadAroundCurrent": false,
    "preloadRadius": 1,
    "autoDownload": false
  },
  "preview": {
    "applyImmediatelyWhenSingleImage": true,
    "previewReplacesStyling": true,
    "pageBackground": "#000000",
    "imageObjectFit": "contain",
    "imageWidth": "100vw",
    "imageHeight": "100vh"
  },
  "fields": {
    "eagerDateDetection": true,
    "showHiddenFields": false,
    "defaultFieldVisibility": "useful-only",
    "fieldPatternRefs": [],
    "fieldAliasRefs": []
  },
  "llm": {
    "endpoint": "http://127.0.0.1:1234/v1/chat/completions",
    "model": "gemma-4-e4b",
    "maxTokens": "220",
    "autoFetchOnQueryChange": false,
    "autoFetchTitleOnLoad": false,
    "autoFetchDescriptionOnPreload": false,
    "locked": false,
    "lockedSettingRef": ""
  },
  "privacy": {
    "storeOriginalImagesByDefault": false,
    "defaultMaxOriginalBytes": 26214400,
    "hardMaxOriginalBytes": 104857600,
    "thumbnailMaxWidth": 256,
    "thumbnailMaxHeight": 256,
    "thumbnailMaxBytes": 262144,
    "showStorageUsageIndicator": true,
    "plaintextDomainIndexes": false,
    "allowFutureHostPermissions": true
  },
  "reactReadiness": {
    "renderer": "plain-dom",
    "revisitReactWhenPanelComplexityRequires": true
  }
}
```

## What Can Stay Plaintext

Plaintext local settings are acceptable for:

- Theme.
- Panel size and section state.
- Sort direction and visible history preferences.
- Navigation step/direction.
- Request throttle values.
- Visible bookmark/pin queue soft max. This controls how many durable queue records appear in the main panel; Recall starts after that visible window and pages remaining durable pins/bookmarks.
- Pin save storage preference. This is a write-path preference (`encrypted` or `plaintext`), not a claim about where existing pins are stored.
- Preview styling values.
- Non-sensitive automation defaults.
- Storage size caps and usage indicator preference.
- React/Vite readiness marker.

## What Should Move To Encrypted IndexedDB

The lock flow should move sensitive or user-selected private settings into `lockedSettings` in IndexedDB.

Candidates:

- Domain-specific field patterns.
- Field aliases that reveal site structure or personal workflow.
- Private sorting/filtering presets.
- Sensitive LLM endpoint configuration.
- Any setting the user explicitly locks before stepping away.

Local settings can keep a reference:

```json
{
  "locked": true,
  "lockedSettingRef": "locked setting uuid"
}
```

## Migration Strategy

Local settings need their own schema version because they can change independently from IndexedDB.

Draft migration flow:

1. Read the local settings object.
2. If missing, create defaults at the current schema version.
3. If `schemaVersion` is older, run ordered migrations from old version to current version.
4. Validate the migrated shape.
5. Write the migrated object back.
6. If migration fails, preserve the old object and load safe defaults for the current session.

Migration examples:

```text
001-create-default-settings
002-add-request-throttle-settings
003-add-runtime-history-window-settings
004-add-locked-setting-refs
005-add-field-visibility-settings
006-add-pin-save-storage-preference
```

## Pin Save Storage Preference

`pinSaveStoragePreference` controls only future pin writes:

- `encrypted` means prefer protected pin metadata and encrypted thumbnail storage when encrypted blob storage is unlocked and usable.
- `plaintext` means save new pin relationship metadata through the compatibility path even when protected storage is unlocked. The bookmark relationship payload, including any thumbnail, is still sealed in its AES-GCM envelope.
- If encrypted is preferred but encryption is locked, unavailable, or a protected save fails, the pin still saves through the compatibility path and the panel should show fallback status. This fallback never writes raw thumbnail bytes to a plaintext IndexedDB field.

Thumbnail storage is always encrypted. Compatibility-path thumbnails live inside the bookmark envelope encrypted by the durable non-extractable bookmark key; protected-pin thumbnails live in the blob-key-encrypted thumbnail repository. The searchable-metadata thumbnail policy therefore has only one effective value, `encrypted`. Legacy settings that say `thumbnail: plaintext` are accepted as migration input and normalized to `encrypted` before persistence.

Changing this setting must not migrate, reseal, rewrite, delete, or rebalance existing pins. Reads, Recall paging, queue ordering, export, delete, and clear behavior continue to follow the durable pin records and relationship rows already in storage.

## Validation Rules

- Clamp panel widths to a safe range.
- Clamp `runtimeWindowMinutes` to a reasonable value.
- Clamp `activeViewMaxItems` to a safe visible cap.
- Clamp `visibleBookmarkSoftMax` to the supported visible queue range.
- Enforce bounded local capture. `defaultMaxOriginalBytes` should default to 25 MB and never exceed `hardMaxOriginalBytes`.
- Enforce `hardMaxOriginalBytes` at 100 MB unless a later migration intentionally changes the hard policy.
- Enforce small bounded thumbnail dimensions and byte size.
- Keep `showStorageUsageIndicator` enabled by default.
- Enforce a minimum request interval greater than zero.
- Enforce a global request cap for automation and rapid manual navigation.
- Default unknown enum values back to safe defaults.
- Do not silently unlock encrypted settings. Missing unlock state should show locked placeholders.

## Lock Flow

When the user chooses to lock local settings:

1. Select settings or setting groups to lock.
2. Derive or unlock a wrapping key from a symmetric PIN/password.
3. Write encrypted payloads to IndexedDB `lockedSettings`.
4. Replace plaintext values with locked references in local settings.
5. Clear plaintext values from memory where practical.
6. Require unlock before viewing or editing those settings again.

Unlock state is session-only.

## Backup And Recovery

- Local settings export can be plaintext if it excludes locked values.
- Locked values should export through encrypted export flows.
- If local settings are corrupted, the extension should start with defaults and offer to inspect/reset the broken settings object.
- Local settings migrations should never delete encrypted IndexedDB data.
