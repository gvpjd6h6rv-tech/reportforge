# 🖥️ ReportForge Designer

A Crystal Reports-compatible visual report designer built as a browser-based SPA using ES Modules — no bundler required.

## ⚡ Quick Start

```bash
# With the full API server
uvicorn reportforge.server.main:app --port 8000
# → Open http://localhost:8000/designer/

# Standalone static mode
cd reportforge/designer && python3 -m http.server 8080
# → Open http://localhost:8080
```

---

## 🗺️ Application Layout

```
┌──────────────────────────────────────────────────────────────┐
│  Menu Bar  [File · Edit · View · Insert · Format · Report]   │
├──────────────────────────────────────────────────────────────┤
│  Toolbar   [New][Open][Save] │ [Undo][Redo] │ [Tools] [Zoom] │
├──────────────────────────────────────────────────────────────┤
│  Format    [Font ▾][Size] [B][I][U] [Align] [Page][Grid]     │
├───────────┬──────────────────────────────────┬───────────────┤
│           │ [Design]─[Preview]               │               │
│  Field    │  ┌──ruler──────────────────────┐ │  Property     │
│ Explorer  │  │ S │ Report Header           │ │  Inspector    │
│           │  │ e │ ─────────────────────── │ │               │
│ Database  │  │ c │ Page Header             │ │  [▲][▼][≡][AZ]│
│ Formula   │  │ . │ ─────────────────────── │ │  ─────────────│
│ Parameter │  │ L │ Detail                  │ │  Position/Size│
│ Running   │  │ a │ ─────────────────────── │ │  Font/Color   │
│ SQL       │  │ b │ Page Footer             │ │  Border/Vis   │
│ Special   │  └───┴─────────────────────────┘ │               │
├───────────┴──────────────────────────────────┴───────────────┤
│ Status: [msg] [N sel] [● Modified] [W×H] [Grid] [100%] [X Y] │
└──────────────────────────────────────────────────────────────┘
```

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+N` | 🆕 New report |
| `Ctrl+O` | 📂 Open layout JSON |
| `Ctrl+S` | 💾 Save / download |
| `Ctrl+Z` / `Ctrl+Y` | ↩️ Undo / ↪️ Redo |
| `Ctrl+C` / `Ctrl+V` | 📋 Copy / Paste (smart +4px offset) |
| `Ctrl+D` | ⊕ Duplicate |
| `Ctrl+A` | ☑️ Select all |
| `Ctrl+G` | 🗂️ Group selected |
| `Ctrl+[` / `Ctrl+]` | 📚 Z-order back / forward |
| `Ctrl+Wheel` | 🔍 Zoom in / out |
| `F5` | 👁️ Preview report |
| `Esc` | ✖️ Return to Design / cancel tool |
| `V` `T` `F` `L` `R` `I` | 🖱️ Tool hotkeys: Select / Text / Field / Line / Rect / Image |
| `Del` | 🗑️ Delete selected |
| `Arrow keys` | ↔️ Nudge 1px · `Shift` = 10px |

---

## 📐 Section Labels

The **22px left column** shows section abbreviations. Click to select, double-click for Section Expert, right-click for context menu.

| Label | Section | Description |
|-------|---------|-------------|
| `RH` | Report Header | Printed once at the start |
| `PH` | Page Header | Top of every page |
| `GH` | Group Header | Before each group |
| `D` | Detail | Once per data row |
| `GF` | Group Footer | After each group |
| `PF` | Page Footer | Bottom of every page |
| `RF` | Report Footer | Printed once at the end |

---

## 🧰 Tools

| Key | Tool | Cursor | Use |
|-----|------|--------|-----|
| `V` | Select | ↖ | Move, resize, multi-select (marquee) |
| `T` | Text | `I` | Place static text labels |
| `F` | Field | `+` | Drop bound data fields |
| `L` | Line | `╲` | Draw horizontal / vertical rules |
| `R` | Rectangle | `□` | Background shapes, borders |
| `I` | Image | `⊞` | Embed PNG/JPG images |

---

## 🎨 Property Inspector

When a single element is selected the inspector shows **Position/Size**, **Font**, **Alignment**, **Color**, **Border**, **Visibility**, and **Suppression** sections.

Select **multiple elements** to access bulk **Alignment**, **Distribution**, and **Sizing** controls.

> 💡 **Tip:** The inspector is non-destructive — re-selecting the same element updates values only, without rebuilding the entire property grid.
