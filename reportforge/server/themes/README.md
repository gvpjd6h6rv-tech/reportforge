# ReportForge Tenant Themes

Each file in this directory configures a tenant's report appearance.

## File format: `{tenant_id}.json`

```json
{
  "theme": {
    "primaryColor":  "#1A3C5E",
    "accentColor":   "#F59E0B",
    "bgColor":       "#FFFFFF",
    "fontFamily":    "Arial",
    "fontSize":      9,
    "headerBg":      "#1A3C5E",
    "headerColor":   "#FFFFFF",
    "altRowBg":      "#EFF6FF",
    "borderColor":   "#BFDBFE",
    "logo":          "https://cdn.example.com/logo.png"
  },
  "params": {
    "company":  "My Company Ltd.",
    "currency": "USD",
    "locale":   "en-US"
  },
  "styles": {
    "heading1": {"fontSize": 16, "bold": true, "color": "#1A3C5E"}
  }
}
```

## Built-in themes (no file needed)

| Tenant ID  | Theme     |
|------------|-----------|
| `default`  | Dark navy |
| `ocean`    | Blue      |
| `forest`   | Green     |
| `corporate`| Slate     |

## Environment override

Set `RF_THEME_{TENANT_ID_UPPER}=ocean` to force a built-in theme.

## API

```bash
# Update theme via API (writes to this directory)
curl -X PUT http://localhost:8000/tenants/acme/theme \
  -d '{"theme": {...}, "params": {...}}'
```
