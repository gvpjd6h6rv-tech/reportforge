# Report Sections

## Section model

Every ReportForge layout has an ordered list of sections. Each section has a **type** (stype), a **height** in pixels, and contains zero or more elements.

```json
{
  "sections": [
    { "id": "s1", "stype": "rh",  "label": "Report Header",  "height": 80  },
    { "id": "s2", "stype": "ph",  "label": "Page Header",    "height": 40  },
    { "id": "s3", "stype": "gh",  "label": "Group Header 1", "height": 30  },
    { "id": "s4", "stype": "det", "label": "Details",        "height": 20  },
    { "id": "s5", "stype": "gf",  "label": "Group Footer 1", "height": 30  },
    { "id": "s6", "stype": "pf",  "label": "Page Footer",    "height": 30  },
    { "id": "s7", "stype": "rf",  "label": "Report Footer",  "height": 60  }
  ]
}
```

## Section properties

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier |
| `stype` | enum | `rh` `ph` `gh` `det` `gf` `pf` `rf` |
| `label` | string | Display name |
| `height` | number | Height in pixels |
| `canGrow` | boolean | Section expands to fit content |
| `suppress` | boolean | Section hidden in output |
| `keepTogether` | boolean | Prevents page break inside |
| `newPageBefore` | boolean | Force page break before |
| `newPageAfter` | boolean | Force page break after |

## Section Expert

Open via **Report → Section Expert** or double-click a section label.

Configure suppress conditions, can-grow, new-page, background color, and underlay behavior per section.

## Resizing

Drag the 3 px gray handle below any section body to resize. Live height tooltip shown in status bar.
