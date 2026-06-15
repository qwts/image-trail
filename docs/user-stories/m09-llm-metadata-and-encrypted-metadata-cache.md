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

- User can configure local OpenAI-compatible endpoint/model/max-token settings without hosted defaults.
- Manual title/filename and description generation sends schema-constrained requests and rejects invalid JSON/schema responses.
- Image input prefers safe data URL, falls back to fetched blob data URL, then raw URL with clear status.
- Metadata cache is keyed by URL/fingerprint and mode so title and description do not overwrite each other.
- Generated metadata updates history/bookmark display fields and persists encrypted.
- Fetch/model/CORS/canvas failures preserve cached values or URL-derived fallback.
- Auto-fetch toggles are disabled until manual flow is stable and then run only at documented lifecycle points.

## Planning Discipline To Apply Before Build

- **Shift-left validation:** confirm contracts, threat model notes, edge cases, and regression checks before implementation begins. Add fixtures or manual checks before wiring broad UI behavior.
- **DRY and explicit interfaces:** centralize repeated schemas, actions, repository calls, status codes, and DOM cleanup primitives rather than copying logic into views.
- **Single responsibility:** keep parser, storage, crypto, target DOM integration, background permissions, and UI rendering in their own bounded modules.
- **React-ready modularity:** views should render from serializable state and dispatch named actions; no view should own parser, crypto, persistence, network governance, or target-image business rules.
- **Change isolation:** volatile browser APIs, storage formats, permission prompts, LLM endpoints, and future React/Vite rendering must sit behind adapters.
- **Secure/testable defaults:** default to least privilege, bounded storage/request behavior, typed validation, and pure core functions that can be tested without DOM, network, or extension APIs.

## Implementation Notes

- Use Client Adapter plus Schema Validator patterns; isolate endpoint request shape from UI.
- Keep prompts and JSON schemas in `core/llm` as testable constants.
- Do not couple LLM metadata to thumbnails; use an image-input provider abstraction to avoid wrong-image cache bugs.
- Store settings classification carefully: endpoint/model may be plaintext settings, generated metadata is encrypted durable data.
- Make all LLM calls cancellable/time-bounded and visible in status.

## Test Notes

- Configure a local-compatible endpoint and generate title from a supported image.
- Return invalid schema from a mock endpoint and verify rejection/no cache overwrite.
- Force canvas/data URL failure and verify fallback status.
- Reload and verify encrypted metadata is read through repository display flow.

## Acceptance Criteria Coverage Review

### Missing Before This Planning Pass

- The original story had placeholder acceptance scenarios, implementation notes, test notes, and open questions.
- Shift-left validation expectations were not stated at the story level.
- DRY/modularity, single-responsibility, secure-by-default, testability, observability/status, and React-ready boundaries were implicit rather than traceable.
- The story did not explicitly identify which acceptance criteria close parity or planning gaps for later implementation.

### Added In This Planning Pass

- Filled acceptance scenarios with concrete pass/fail criteria grounded in the docs, bookmarklet behavior map, and extension acceptance baseline.
- Added planning discipline notes that must be reviewed before implementation begins.
- Added implementation notes naming the software patterns, adapters, contracts, and module boundaries to preserve.
- Added test notes so manual or automated checks can be prepared before code is integrated.
- Added open questions for decisions that should be resolved before or during implementation rather than discovered late.

### Coverage Status

- All previously missing placeholder sections in this story are now filled.
- Any remaining uncertainty is captured under **Open Questions** instead of hidden in the implementation plan.

## Open Questions

- Should API keys be supported, and if so are they encrypted settings from day one?
- What timeout/retry policy should local endpoints use?
