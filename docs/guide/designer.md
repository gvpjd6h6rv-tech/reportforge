# Designer UI

## Layout overview

```
┌─────────────────────────────────────────────────────────────┐
│  Menu Bar  File | Edit | View | Insert | Format | Report    │ 22px
├─────────────────────────────────────────────────────────────┤
│  Toolbar   [New][Open][Save] | [Select][Text]... | [Zoom]   │ 26px
├─────────────────────────────────────────────────────────────┤
│  Toolbar2  [Font ▼][Size] [B][I][U] | Page: A4 | Portrait   │ 26px
├──────────┬──────────────────────────┬────────────────────────┤
│ Field    │ Design │ Preview         │ Property               │
│ Explorer │                          │ Inspector              │
│          │  [22px]  [canvas area]   │                        │
│ Fields   │  label  ┌─────────────┐  │ Type: TEXT             │
│ Formulas │  col    │ Page body   │  │ ─────────────────────  │
│ Params   │         │             │  │ Position / Size        │
│ RunTotals│         │  elements   │  │ X: 100   Y: 50         │
│          │         │             │  │ W: 200   H: 20         │
│          │         └─────────────┘  │ ─────────────────────  │
│          │                          │ Font                   │
├──────────┴──────────────────────────┴────────────────────────┤
│ Status  │ 1 selected │ ● Unsaved │ W:200 H:20 │ 100% │ X:0  │ 22px
└─────────────────────────────────────────────────────────────┘
```

## Menu bar

| Menu   | Key actions |
|--------|------------|
| File   | New, Open, Save, Export |
| Edit   | Undo/Redo, Cut/Copy/Paste, Duplicate, Delete, Group |
| View   | Design/Preview tabs, Field Explorer, Rulers, Grid, Snap, Zoom |
| Insert | Text, Field, Line, Box, Image, Chart, Subreport |
| Format | Align, Distribute, Make Same Size |
| Report | Filters, Groups, Section Expert, Formula Workshop, Parameters |

## Toolbar (row 1)

Icon-only buttons: New · Open · Save · **|** · Select · Text · Field · Line · Rect · Image · Chart · **|** · Undo · Redo · **|** · Copy · Paste · Duplicate · Delete · **|** · Align × 8 · **|** · Zoom − · 100% · Zoom +

## Toolbar (row 2)

Font picker → Size → **B I U** → Align L/C/R → Page size → Orientation → Z-order → Lock

## Section label column

The 22 px column left of the canvas shows section labels in rotated text:

| Label | Section |
|-------|---------|
| RH | Report Header |
| PH | Page Header |
| GH | Group Header |
| D  | Detail |
| GF | Group Footer |
| PF | Page Footer |
| RF | Report Footer |

- **Click** → selects section
- **Double-click** → opens Section Expert
- **Right-click** → context menu (suppress, can-grow, insert, delete)

## Canvas interactions

| Action | Result |
|--------|--------|
| Click element | Select |
| Ctrl+Click | Multi-select |
| Drag element | Move |
| Drag handle | Resize |
| Ctrl+Wheel | Zoom |
| Space+Drag | Pan |
| Double-click text | Inline edit |
| Drag from Field Explorer | Insert field element |
