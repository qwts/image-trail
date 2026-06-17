# Milestone User Story Plan

## M00: Planning Baseline And Bookmarklet Map

Order: 0

As a developer, I want a clear map from the existing bookmarklet behavior to the extension architecture so the port preserves the important workflows. This milestone defines the implementation boundaries and acceptance-test baseline before new extension code is added.

## M01: MV3 Shell And Injected Panel

Order: 1

As a user, I want to click the browser action and see an in-page panel so I can start using the tool without a popup. This milestone creates the minimal Manifest V3 extension shell, service worker, content script, and panel toggle.

## M02: Target Image Selection And Page Integration

Order: 2

As a user, I want the extension to select the only image automatically or let me manually pick one so actions affect the intended image only. This milestone adds target detection, manual picking, image application, preview styling, and cleanup.

## M03: URL Parser And Navigation Core

Order: 3

As a user, I want the extension to understand and edit image URL fields so I can navigate image sequences like the bookmarklet does. This milestone ports URL parsing, rebuilding, field movement, same-origin URL updates, and request throttling into framework-independent core code.

## M04: Storage, Keys, And Local Settings Foundation

Order: 4

As a user, I want durable data to be encrypted and settings to load predictably so my image history and private configuration are protected. This milestone creates IndexedDB schema, migrations, key records, encrypted envelopes, and local settings wrappers.

## M05: Runtime History, Capture, And Bookmarks

Order: 5

As a user, I want recent image activity, explicit captures, and bookmarks to survive normal use without storing more than I chose. This milestone adds runtime history, encrypted durable history/bookmark records, bounded original capture, deletion behavior, and storage usage reporting.

## M06: Permission And Cross-Origin Capture Flow

Order: 6

As a user, I want cross-origin image capture failures to be understandable and recoverable without granting broad permissions up front. This milestone adds specific origin permission requests, clear capture failure reasons, retry behavior, and remote-only fallback records.

## M07: Recall, Import, Export, And Encrypted Downloads

Order: 7

As a user, I want to recover older encrypted records and move data between installs without exposing plaintext. This milestone adds recall/decrypt flows, bookmarklet JSON import, encrypted import/export, key wrapping, and encrypted download envelopes.

## M08: Automation And Keyboard Controls

Order: 8

As a user, I want fast keyboard and automation workflows while keeping image requests under control. This milestone restores shortcuts, slideshow behavior, 404 retry/advance, preload controls, auto-download options, and global request caps.

## M09: LLM Metadata Integration

Order: 9

As a user, I want optional local LLM metadata generation so images can receive useful titles and descriptions. This milestone ports endpoint/model settings, schema-constrained title and description requests, metadata caching, and encrypted metadata storage.

## M10: UI Scale-Up And React/Vite Decision

Order: 10

As a developer, I want to decide whether the panel has become complex enough to justify React/Vite without moving business logic into the UI. This milestone evaluates the UI scale-up point and, if adopted, limits React to panel rendering only.
