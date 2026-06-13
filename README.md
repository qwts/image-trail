# image-bookmarklet

Bookmarklet for stepping image URLs, handling 404 traversal, and fetching LLM-generated metadata (`filename` and `description`) for the current loaded image.

## LLM Configuration

Use these values in your model/server setup so responses match what the bookmarklet expects when you click `Fetch Title` or `Fetch Description`.

### System Prompt (Title Fetch)

```text
Return only valid JSON matching the schema. Do not wrap JSON in markdown or add extra keys. Return only filename.
```

### User Rules (Title Fetch)

```text
Create a descriptivve download filename for this image and content.
Rules:
- filename: short snake_case filename without extension
- avoid generic words like image, photo, pic unless required by content
```

### JSON Schema (Title Fetch)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["filename"],
  "properties": {
    "filename": {
      "type": "string",
      "description": "Short snake_case filename without extension."
    }
  }
}
```

### System Prompt (Description Fetch)

```text
Return only valid JSON matching the schema. Do not wrap JSON in markdown or add extra keys. Return only description.
```

### User Rules (Description Fetch)

```text
Create a concise description for this image.
Rules:
- description: one concise sentence describing visible content
- include only visible content, no speculation
```

### JSON Schema (Description Fetch)

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["description"],
  "properties": {
    "description": {
      "type": "string",
      "description": "One concise sentence describing visible image content."
    }
  }
}
```

### Expected Request Shape (Both Modes)

The bookmarklet sends:

- `temperature: 0`
- `stream: false`
- `response_format.type: "json_schema"`
- `response_format.json_schema.name`:
  - `"image_title_metadata"` for title fetch
  - `"image_description_metadata"` for description fetch
- `response_format.json_schema.strict: true`
- model-configurable `max_tokens`
- a user message with:
  - mode-specific text rules (title-only or description-only)
  - one `image_url` item pointing to either a data URL (preferred) or the current image URL

### Fallback/Error Handling

- If a fetch fails for one field, cached value for that field is kept.
- If no cached value exists:
  - title falls back to URL-derived filename
  - description falls back to `"No description available."`

### LLM Control Toggles

Controls include:

- auto-fetch title+description on query change
- auto-fetch title on load
- auto-fetch description on preload/load

### Default Local Endpoint

```text
http://127.0.0.1:1234/v1/chat/completions
```
