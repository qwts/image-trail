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
Create a highly descriptive, low-collision download filename for this image.
Rules:
- filename: snake_case, no extension, 6-14 words, descriptive and specific
- if people are visible, prioritize them first: apparent age group, skin tone/color, apparent gender presentation, and what they are doing
- include scene/action context to reduce collisions (setting, activity, notable objects)
- avoid vague names like image/photo/pic unless nothing else is visible
- example style: a_white_woman_rides_rollercoaster_at_night
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
Create a descriptive caption for this image focused on visible people and context.
Rules:
- description: 1-2 sentences, concrete and specific
- if people are visible, include apparent age group, skin tone/color, apparent gender presentation, and what they are doing
- include scene/action context (setting, activity, notable objects)
- include only visible content and avoid unsupported speculation
- if unsure, use neutral wording like person/people
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

## Selection-Based Metafield Split

In the **Fields** panel, each field row now includes a `+ split` button.

How it works:

- highlight part of a field value inside its input (for example `3612b6b86` from `349485459563612b6b86.jpg`)
- click `+ split`
- the selected text becomes its own editable field token (metafield), while staying part of the same original URL segment/query value

Behavior notes:

- full URL text syncs immediately after split
- image reload behavior stays unchanged (reload on Enter, or when using increment/decrement controls)
- numeric `-` / `+` controls continue to work on the currently active numeric/hex token
