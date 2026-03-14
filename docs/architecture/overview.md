# Architecture Overview — ReportForge Enterprise

## Repository Structure

```
reportforge-complete/
├── designer/
│   └── crystal-reports-designer-v3.html    # Main designer (Classic + Modern UI)
├── reportforge/
│   ├── core/
│   │   └── render/
│   │       ├── expressions/    # Formula engine (Python)
│   │       ├── engines/        # HTML, PDF, enterprise render engines
│   │       └── export/         # CSV, DOCX, HTML exporters
│   ├── designer/
│   │   └── js/                 # ES module designer components
│   │       ├── core/           # DocumentModel, FormulaEngine, History, Selection
│   │       ├── classic/        # Classic UI: sections, elements, inspector
│   │       ├── modules/        # Preview, Formula editor, Groups, Filters, etc.
│   │       └── ux/             # Drag tools, alignment, snapping, context menu
│   ├── server/                 # REST API server
│   └── tests/                  # 864 unit + smoke tests
├── reportforge_server.py       # Standalone server entry point
├── validate_repo.sh            # Validation script (48 checks)
└── repo.sh                     # Full build + test + runtime validation
```

## CSS Architecture (Enterprise, 9 @layers)

```
@layer reset           — box-sizing, margin/padding reset
@layer tokens          — --rf-* design tokens + [data-ui=modern] overrides
@layer base            — html/body/input defaults with logical properties
@layer layout          — CSS Grid main layout, mathematical panel sizing
@layer components      — Container queries, interaction states, tooltips
@layer utilities       — u-hidden, u-flex, u-mono, etc.
@layer classic         — XP/Crystal Reports skin, performance isolation
@layer modern          — Flat modern skin ([data-ui=modern] rules)
@layer overrides       — Accessibility, print, static style fixes
```

## Dual UI System

```
<div id="app" data-ui="classic">   ← default
<div id="app" data-ui="modern">    ← toggled by DesignerUI.setMode()
```

- Same HTML structure
- Same JS logic (all engines)
- CSS layer `classic` applies to default
- CSS layer `modern` applies via `[data-ui="modern"]` attribute selectors
- No duplicated business logic

## Design Tokens

All visual values are CSS custom properties with `--rf-` prefix:

| Namespace | Purpose |
|---|---|
| `--rf-surface-0..4` | Surface/background scale |
| `--rf-border-*` | Border colors |
| `--rf-accent` | Primary interactive color |
| `--rf-sec-*` | Section band colors |
| `--rf-panel-l/r` | Panel widths (clamp-based) |
| `--rf-tbar-h` | Toolbar height (clamp-based) |
| `--rf-transition` | Animation timing |

Legacy `--xp-*` tokens are aliases pointing to `--rf-*` values.

## Formula Engine

Two implementations:
1. **Python** (`reportforge/core/render/expressions/`) — server-side validation + render
2. **JavaScript** (`FormulaEngine` in designer HTML) — client-side real-time validation

Both support: IIf, ToText, DateAdd, DateDiff, aggregates (Sum/Avg/Count/Min/Max),
local/global/shared variables, Today(), Now(), Pi(), Rnd(), etc.

## Server Routes

```
GET  /                 → designer HTML
GET  /health           → {"status":"ok"}
POST /designer-preview → HTML preview from layout JSON + data
POST /validate-formula → validate + eval formula expression  
POST /validate-layout  → validate layout schema
POST /render           → full report render
GET  /preview-barcode  → barcode SVG preview
```
