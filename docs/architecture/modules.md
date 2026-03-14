# Module Map

## File tree

```
js/
├── rf.js                          # Global namespace RF, event bus, utilities
├── main.js                        # Import graph entry, DOMContentLoaded boot
├── app.js                         # RF.App — orchestrates all init() calls
│
├── core/
│   ├── document-model.js          # RF.Core.DocumentModel — layout state
│   ├── history.js                 # RF.Core.HistoryEngine — undo/redo stack
│   ├── selection.js               # RF.Core.SelectionSystem — selectedIds Set
│   ├── render-pipeline.js         # RF.Core.RenderPipeline — fullRender / reconcile
│   └── layout-tools.js            # RF.Core.LayoutTools — load/save/export JSON
│
├── ux/
│   ├── snapping.js                # RF.UX.Snapping — grid + element snap
│   ├── guides.js                  # RF.UX.Guides — user guide lines
│   ├── alignment.js               # RF.UX.Alignment — align, distribute, equal
│   ├── format-painter.js          # RF.UX.FormatPainter — copy style across elements
│   ├── drag-tools.js              # RF.UX.DragTools — move, resize, marquee
│   ├── object-group.js            # RF.UX.ObjectGroup — group / ungroup
│   ├── panel-splitter.js          # RF.UX.PanelSplitter — resize side panels
│   ├── context-menu.js            # RF.UX.ContextMenu — right-click menus + showAt()
│   ├── field-drag-ghost.js        # RF.UX.FieldDragGhost — yellow ghost during drag
│   └── panel-tabs.js              # RF.UX.PanelTabs — Fields/Report/Repo tabs
│
├── classic/
│   ├── elements.js                # RF.Classic.Elements — render element DOM
│   ├── canvas.js                  # RF.Classic.Canvas — zoom, pan, rulers, grid
│   ├── sections.js                # RF.Classic.Sections — section bodies + label column
│   ├── inspector.js               # RF.Classic.Inspector — property grid panel
│   ├── explorer.js                # RF.Classic.Explorer — field tree panel
│   ├── toolbar.js                 # RF.Classic.Toolbar — toolbar rows 1 & 2
│   ├── menu.js                    # RF.Classic.Menu — full Windows menu bar
│   ├── sections-v4.js             # RF.Classic.SectionsV4 — collapse toggle patch
│   ├── status-bar-v4.js           # RF.Classic.StatusBarV4 — W×H, grid, snap, coords
│   └── toolbar-v4.js              # RF.Classic.ToolbarV4 — extra tool buttons
│
└── modules/
    ├── formula-editor.js           # RF.Modules.FormulaEditor
    ├── formula-editor-v4.js        # RF.Modules.FormulaEditorV4 — autocomplete patch
    ├── formula-debugger.js         # RF.Modules.FormulaDebugger
    ├── parameters.js               # RF.Modules.Parameters
    ├── groups.js                   # RF.Modules.Groups — group/sort expert
    ├── filters.js                  # RF.Modules.Filters — select expert
    ├── tables.js                   # RF.Modules.Tables — cross-tab tables
    ├── charts.js                   # RF.Modules.Charts — chart editor
    ├── subreports.js               # RF.Modules.Subreports
    ├── conditional-fmt.js          # RF.Modules.ConditionalFmt
    ├── section-expert.js           # RF.Modules.SectionExpert
    ├── object-explorer.js          # RF.Modules.ObjectExplorer
    ├── preview.js                  # RF.Modules.Preview — iframe preview
    ├── running-totals.js           # RF.Modules.RunningTotals
    ├── crosstab.js                 # RF.Modules.Crosstab
    ├── topn.js                     # RF.Modules.TopN
    ├── multi-section.js            # RF.Modules.MultiSection
    ├── report-explorer.js          # RF.Modules.ReportExplorer
    ├── repository-explorer.js      # RF.Modules.RepositoryExplorer
    ├── sql-editor.js               # RF.Modules.SQLEditor
    ├── barcode-editor.js           # RF.Modules.BarcodeEditor
    ├── rich-text-editor.js         # RF.Modules.RichTextEditor
    ├── map-editor.js               # RF.Modules.MapEditor
    └── preview-nav.js              # RF.Modules.PreviewNav
```

## CSS files

| File | Responsibility |
|------|---------------|
| `base.css` | CSS variables (light palette), reset, typography |
| `toolbar.css` | Toolbar rows, menu bar, canvas tabs |
| `panels.css` | Workspace layout, field explorer, inspector, status bar |
| `canvas.css` | Canvas area, section bodies, elements, handles, guides |
| `modals.css` | All dialog modals, formula editor, preview overlay |
| `v4.css` | Context menu, panel tabs, formula workshop, extended element types |
| `index.css` | Cascade entry point (`@import` all above) |
