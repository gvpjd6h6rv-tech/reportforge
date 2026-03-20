# Designer Guide — ReportForge v18.0

## Interface Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Menu Bar  [File] [Edit] [Insert] [Format] [Report] [View]      │
├─────────────────────────────────────────────────────────────────┤
│  Main Toolbar  [New][Open][Save] | [Undo][Redo] | [Zoom] ...    │
├─────────────────────────────────────────────────────────────────┤
│  Format Toolbar  [Bold][Italic] | [Align] | [Color] ...         │
├───────────┬────────────────────────────────────────┬────────────┤
│  Sections │  ┌─ Ruler (H) ──────────────────────┐  │  Field     │
│  Panel    │  │  Canvas Area                     │  │  Explorer  │
│           │  │  ┌─ Report Header ─────────────┐ │  │           │
│           │  │  │  {elements}                 │ │  │           │
│           │  │  ├─ Page Header ───────────────┤ │  │           │
│           │  │  │  {elements}                 │ │  │           │
│  Ruler    │  │  ├─ Detail ────────────────────┤ │  ├────────────┤
│  (V)      │  │  │  {elements}                 │ │  │ Properties │
│           │  │  └──────────────────────────────┘ │  │  Panel     │
├───────────┴──┴──────────────────────────────────┴──┴────────────┤
│  Status Bar:  X: 100   Y: 50   Items: 9   100%   Design         │
└─────────────────────────────────────────────────────────────────┘
```

## Sections

ReportForge uses Crystal Reports–style banded sections:

| Section | Purpose |
|---------|---------|
| Report Header | Prints once at the beginning |
| Page Header | Prints at the top of each page |
| Group Header | Prints before each group |
| Detail | Repeats for each data record |
| Group Footer | Prints after each group |
| Page Footer | Prints at the bottom of each page |
| Report Footer | Prints once at the end |

**Managing sections:**
- Right-click a section label to insert, delete, or rename
- Drag the section border to resize
- Use Section Expert (Format → Section) for advanced options

## Elements

Insert elements from the toolbar or Insert menu:

| Element | Description |
|---------|-------------|
| Text | Static label or formatted text |
| Field | Data field from a dataset |
| Box | Rectangle / border shape |
| Line | Horizontal or vertical line |

**Selection:** Click to select, Shift+click for multi-select, Ctrl+A for all.

**Drag:** Click and drag to move. Position updates in real-time during drag. Snap grid is 8px.

**Resize:** Drag the L-shaped corner handles.

## Snap & Guides

- **Snap to grid:** 8px grid, toggle with Ctrl+Shift+G
- **Alignment guides:** appear automatically when dragging near aligned objects (works in both Design and Preview)
- **Manual guides:** Insert → Guide to add horizontal/vertical guides

## Zoom

Zoom range: 25% – 400%

- Mouse wheel + Ctrl: smooth ~10% increments
- + / − buttons: snaps to predefined steps (25%, 50%, 75%, 100%, 150%, 200%, 300%, 400%)
- Design and Preview maintain separate zoom levels

## Preview Mode

Click **Preview** or press F5 to switch to Preview mode. The canvas renders the document as it will print. All panels and toolbars remain visible. Drag operations and snap guides work in Preview mode too.

Click **Design** to return to edit mode.
