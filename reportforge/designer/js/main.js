/**
 * main.js — ReportForge Designer entry point.
 *
 * Imports every module in topological dependency order, then boots.
 * This is the only <script type="module"> tag in index.html.
 *
 * Dependency layers:
 *   0  rf.js            namespace + event bus + utilities
 *   1  core/            DocumentModel → History → Selection → RenderPipeline → LayoutTools
 *   2  ux/base          Snapping → Guides → Alignment → FormatPainter → DragTools
 *   3  classic/base     Elements → Canvas → Sections → Inspector → Explorer → Toolbar
 *   4  modules/         all feature dialogs (depend only on Core + Classic)
 *   5  ux/v4            ObjectGroup → PanelSplitter → ContextMenu → FieldDragGhost → PanelTabs
 *   6  classic/v4       SectionsV4 → StatusBarV4 → ToolbarV4
 *   7  modules/v4       FormulaEditorV4 → FormulaDebugger → PreviewNav → running-totals…
 *   8  app.js           RF.App (consolidated init)
 */

// 0 ── namespace ───────────────────────────────────────────────────────────────
import RF from './rf.js';

// 1 ── core  [document-model → history → selection → render-pipeline → layout-tools] ────────────────────────────────────────────────────────────────────
import './core/document-model.js';
import './core/history.js';
import './core/selection.js';
import './core/render-pipeline.js';
import './core/layout-tools.js';

// 2 ── ux/base  [snapping → guides → alignment → format-painter → drag-tools] ─────────────────────────────────────────────────────────────────
import './ux/snapping.js';
import './ux/guides.js';
import './ux/alignment.js';
import './ux/format-painter.js';
import './ux/drag-tools.js';

// 3 ── classic/base  [elements → canvas → sections → inspector → explorer → toolbar] ────────────────────────────────────────────────────────────
import './classic/elements.js';
import './classic/canvas.js';
import './classic/sections.js';
import './classic/inspector.js';
import './classic/explorer.js';
import './classic/toolbar.js';
import './classic/menu.js';

// 4 ── modules/base  [all v3 feature dialogs] ────────────────────────────────────────────────────────────
import './modules/formula-editor.js';
import './modules/parameters.js';
import './modules/groups.js';
import './modules/filters.js';
import './modules/tables.js';
import './modules/charts.js';
import './modules/subreports.js';
import './modules/conditional-fmt.js';
import './modules/section-expert.js';
import './modules/object-explorer.js';
import './modules/preview.js';

// 5 ── ux/v4  [object-group → panel-splitter → context-menu → field-drag-ghost → panel-tabs] ──────────────────────────────────────────────────────────────────
import './ux/object-group.js';
import './ux/panel-splitter.js';
import './ux/context-menu.js';
import './ux/field-drag-ghost.js';
import './ux/panel-tabs.js';

// 6 ── classic/v4  [sections-v4 → status-bar-v4 → toolbar-v4] ─────────────────────────────────────────────────────────────
import './classic/sections-v4.js';
import './classic/status-bar-v4.js';
import './classic/toolbar-v4.js';

// 7 ── modules/v4  [formula-editor-v4, formula-debugger, preview-nav, running-totals…] ─────────────────────────────────────────────────────────────
import './modules/formula-editor-v4.js';
import './modules/formula-debugger.js';
import './modules/preview-nav.js';
import './modules/running-totals.js';
import './modules/crosstab.js';
import './modules/topn.js';
import './modules/multi-section.js';
import './modules/report-explorer.js';
import './modules/repository-explorer.js';
import './modules/sql-editor.js';
import './modules/barcode-editor.js';
import './modules/rich-text-editor.js';
import './modules/map-editor.js';

// 8 ── app  [consolidated RF.App with v3 + v4 init] ─────────────────────────────────────────────────────────────────────
import './app.js';

// ── boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => RF.App.init());
