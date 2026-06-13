# image-bookmarklet

Bookmarklet for stepping image URLs, handling 404 traversal, and fetching LLM-generated metadata (`filename` + `description`) for the current loaded image.

## LLM Configuration

Use these values in your model/server setup so responses match what the bookmarklet expects when you click `Fetch Name+Desc`.

### System Prompt

```text
Return only valid JSON matching the schema.
```

### JSON Schema

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["filename", "description"],
  "properties": {
    "filename": {
      "type": "string",
      "description": "Concise descriptive filename without extension."
    },
    "description": {
      "type": "string",
      "description": "One concise sentence describing visible image content."
    }
  }
}
```

### Expected Request Shape (Reference)

The bookmarklet sends:

- `temperature: 0`
- `stream: false`
- `response_format.type: "json_schema"`
- `response_format.json_schema.name: "image_download_metadata"`
- `response_format.json_schema.strict: true`
- model-configurable `max_tokens`
- a user message with:
  - text rules (`filename` snake_case, concise description, avoid vague terms)
  - one `image_url` item pointing to either a data URL (preferred) or the current image URL

### Default Local Endpoint

```text
http://127.0.0.1:1234/v1/chat/completions
```
