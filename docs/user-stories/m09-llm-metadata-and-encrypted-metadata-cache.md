# M09: LLM Metadata And Encrypted Metadata Cache

**Order:** 9  
**Type:** Port / deferable

---

## User Story

As a user, I want optional local LLM metadata generation so images can receive useful titles, filenames, labels, and descriptions.

## Source Context

This milestone ports endpoint/model settings, schema-constrained title and description requests, fallback behavior, metadata caching, and encrypted metadata persistence.

---

## Scope

- Port local OpenAI-compatible endpoint settings.
- Port model and max-token configuration.
- Preserve strict JSON-schema response expectations.
- Support title/filename metadata requests.
- Support description metadata requests.
- Use current image data URL when safely available and fall back to current image URL when needed.
- Cache metadata by URL and mode.
- Store generated metadata in encrypted records.
- Preserve auto-fetch toggles only after manual metadata generation is stable.

## Out Of Scope

- Hosted remote model defaults.
- Server-side metadata jobs.
- Vector embeddings.
- Semantic search UI.
- Automatic metadata generation for large batches unless explicitly enabled later.

## Exit Criteria

- User can configure a local-compatible endpoint and model.
- Manual title/description generation works for supported images.
- Invalid model responses are rejected safely.
- Metadata cache updates history/bookmark display fields.
- Generated metadata persists in encrypted durable storage.
- CORS/canvas/data-URL limitations surface clear fallback status.

## Primary Modules

- `extension/src/core/llm/schemas.ts`
- `extension/src/core/llm/prompts.ts`
- `extension/src/core/llm/metadata-client.ts`
- `extension/src/core/llm/types.ts`
- `extension/src/core/image/image-metadata.ts`
- `extension/src/data/repositories/history-repository.ts`
- `extension/src/data/repositories/bookmarks-repository.ts`
- `extension/src/data/local-settings.ts`

---

## Acceptance Scenarios

TBD

## Implementation Notes

TBD

## Test Notes

TBD

## Open Questions

TBD
