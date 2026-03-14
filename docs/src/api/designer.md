# 🔌 Designer API Reference

---

## 📡 Preview Endpoint

The designer sends `POST /designer-preview` to render a report layout into HTML.

```http
POST /designer-preview
Content-Type: application/json
```

### 📤 Request Body

```json
{
  "layout": {
    "name": "Sales Report",
    "pageSize": "A4",
    "orientation": "portrait",
    "pageWidth": 794,
    "sections": [
      { "id": "rh1", "stype": "rh", "label": "Report Header", "height": 60, "canGrow": false },
      { "id": "d1",  "stype": "det", "label": "Detail",       "height": 20, "canGrow": true  }
    ],
    "elements": [
      {
        "id": "el1", "type": "text", "sectionId": "rh1",
        "x": 10, "y": 10, "w": 200, "h": 24,
        "content": "Sales Report",
        "fontFamily": "Arial", "fontSize": 16, "bold": true,
        "color": "#000000"
      }
    ]
  },
  "data": {
    "items": [
      { "id": 1, "name": "Widget", "qty": 10, "price": 25.00 }
    ]
  },
  "params": {
    "company": "Acme Corp"
  }
}
```

### 📥 Response

Returns a rendered **`text/html`** string suitable for display in an `<iframe>` or conversion to PDF.

> 💡 For PDF output, pipe the response HTML into headless Chrome (`--print-to-pdf`) or `wkhtmltopdf`.

---

## 📋 Layout JSON Schema

### 🗂️ Root Object

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | — | Report display name |
| `pageSize` | `"A4"` \| `"A3"` \| `"Letter"` \| `"Legal"` | `"A4"` | Paper size |
| `orientation` | `"portrait"` \| `"landscape"` | `"portrait"` | Page orientation |
| `pageWidth` | `number` | `794` | Page width in pixels (794 = A4 portrait) |
| `sections` | `Section[]` | — | Ordered list of report sections |
| `elements` | `Element[]` | — | All elements across all sections |
| `groups` | `Group[]` | `[]` | Group-by fields |
| `sortBy` | `Sort[]` | `[]` | Sort fields |
| `filters` | `Filter[]` | `[]` | Record selection conditions |
| `parameters` | `Parameter[]` | `[]` | Report parameters |
| `formulas` | `object` | `{}` | Named formula expressions |
| `runningTotals` | `RunningTotal[]` | `[]` | Running total fields |

---

### 📐 Sections

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `stype` | `"rh"` \| `"ph"` \| `"gh"` \| `"det"` \| `"gf"` \| `"pf"` \| `"rf"` | Section type |
| `label` | `string` | Display label |
| `height` | `number` | Height in pixels |
| `canGrow` | `boolean` | Section expands to fit content |
| `suppress` | `boolean` | Section is hidden in output |

**Section type reference:**

| `stype` | Name | Printed |
|---------|------|---------|
| `rh` | Report Header | Once, at start |
| `ph` | Page Header | Top of every page |
| `gh` | Group Header | Before each group |
| `det` | Detail | Once per data row |
| `gf` | Group Footer | After each group |
| `pf` | Page Footer | Bottom of every page |
| `rf` | Report Footer | Once, at end |

---

### 🧩 Elements

All elements share these **base fields**:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | Unique identifier |
| `type` | `string` | See element types below |
| `sectionId` | `string` | Parent section `id` |
| `x` | `number` | Left offset in pixels |
| `y` | `number` | Top offset in pixels |
| `w` | `number` | Width in pixels |
| `h` | `number` | Height in pixels |
| `zIndex` | `number` | Stacking order |
| `locked` | `boolean` | Prevents drag/resize in designer |
| `visibleIf` | `string` | Formula expression for conditional visibility |

**Element types:**

| `type` | Description |
|--------|-------------|
| `text` | Static label |
| `field` | Bound data field |
| `line` | Horizontal or vertical rule |
| `rect` | Rectangle / background shape |
| `image` | Embedded PNG / JPG |
| `chart` | Bar, line, pie chart |
| `table` | Multi-column data table |
| `subreport` | Embedded sub-report |
| `crosstab` | Cross-tabulation grid |
| `barcode` | Code128, QR, EAN13 |
| `richtext` | Formatted HTML content |
| `map` | Geographic map element |

---

### ✏️ Text / Field Fields

| Field | Type | Description |
|-------|------|-------------|
| `content` | `string` | Static text (`type=text`) |
| `fieldPath` | `string` | Data path, e.g. `items.name` |
| `fontFamily` | `string` | Font name |
| `fontSize` | `number` | Font size in pt |
| `bold` | `boolean` | Bold weight |
| `italic` | `boolean` | Italic style |
| `underline` | `boolean` | Underline decoration |
| `color` | `string` | Hex color, e.g. `#000000` |
| `bgColor` | `string` | Hex or `"transparent"` |
| `align` | `"left"` \| `"center"` \| `"right"` \| `"justify"` | Text alignment |
| `fieldFmt` | `string` | Format key: `currency`, `int`, `float2`, `pct`, `date` |
| `canGrow` | `boolean` | Expand height to fit content |

---

> 📘 For the full render engine schema and formula language reference, see the render engine test suite in `tests/`.
