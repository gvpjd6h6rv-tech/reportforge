# REST API

Base URL: `http://localhost:8000`

## Designer

### `GET /designer/`

Serves the visual designer HTML application.

### `POST /designer-preview`

Renders a layout to HTML for live preview inside the designer iframe.

**Request body:**
```json
{
  "layout": { ... layout object ... },
  "data": {
    "items": [ { "id": 1, "name": "Widget", "qty": 10, "total": 250.00 } ]
  },
  "params": { "company": "Acme Corp" }
}
```

**Response:** `text/html` — rendered report page

## Render

### `POST /render`

Render a layout file or inline layout to any output format.

**Request body:**
```json
{
  "layout": "path/to/report.rfd.json",
  "data": { "items": [...] },
  "format": "html",
  "params": {}
}
```

Or inline:
```json
{
  "layout": { "name": "...", "sections": [...], "elements": [...] },
  "data": { "items": [...] },
  "format": "pdf"
}
```

**Formats:** `html` · `pdf` · `xlsx` · `csv` · `png`

**Response:** rendered content with appropriate `Content-Type`

### `GET /health`

Returns `{"status": "ok", "engine": true}`.

## OpenAPI docs

Interactive docs available at **http://localhost:8000/docs**

## Error codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 422 | Invalid layout JSON or render error |
| 503 | Render engine not available |
