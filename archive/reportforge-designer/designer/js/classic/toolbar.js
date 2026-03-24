import RF from '../rf.js';

/**
 * classic/toolbar.js — RF.Classic.Toolbar
 * Layer   : Classic UI
 * Purpose : Toolbar row 1. Tool buttons (select, draw, text, line, image),
 *           insert-element controls, zoom in/out, undo/redo, and align/format
 *           shortcuts.
 * Deps    : RF.Classic.Canvas, RF.Core.DocumentModel,
 *           RF.UX.Alignment, RF.UX.FormatPainter
 */

RF.Classic.Toolbar = {

  init() {
    this._render();
    this._render2();
    RF.on(RF.E.HISTORY_CHANGED,  s  => this._updateHistBtns(s));
    RF.on(RF.E.SEL_CHANGED,      ()  => this._updateAlignBtns());
    RF.on(RF.E.ZOOM_CHANGED,     ()  => this._updateZoom());
    RF.on(RF.E.LAYOUT_CHANGED,   ()  => { this._updateZoom(); this._updateDirty(); });
    RF.on(RF.E.TOOL_CHANGED,     ()  => this._updateTool());
  },

  _render() {
    const tb = document.getElementById('toolbar');
    if (!tb) return;
    tb.append(RF.html(`
    <!-- File -->
    <div class="tb-group">
      <button class="tb-btn" onclick="RF.LT.newLayout()" title="New (Ctrl+N)">
        <svg viewBox="0 0 16 16"><path d="M4 1h6l4 4v10H4V1z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 1v4h4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>New</span>
      </button>
      <button class="tb-btn" onclick="RF.LT.openFile()" title="Open">
        <svg viewBox="0 0 16 16"><path d="M2 4h5l2 2h5v8H2V4z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Open</span>
      </button>
      <button class="tb-btn" onclick="RF.LT.download()" title="Save (Ctrl+S)">
        <svg viewBox="0 0 16 16"><path d="M3 1h8l3 3v11H3V1z" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5" y="9" width="6" height="5" fill="none" stroke="currentColor"/><rect x="5" y="1" width="6" height="4" fill="none" stroke="currentColor"/></svg>
        <span>Save</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Tools -->
    <div class="tb-group" id="tool-group">
      ${[['select','V','cursor','<path d="M3 2l10 6-5 1-2 5L3 2z" fill="none" stroke="currentColor" stroke-width="1.3"/>'],
         ['text','T','text','<text x="2" y="13" font-size="13" font-weight="bold" fill="currentColor">T</text>'],
         ['field','F','field','<rect x="1" y="5" width="14" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="3" y="11" font-size="7" fill="currentColor">{f}</text>'],
         ['line','L','line','<line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="1.5"/>'],
         ['rect','R','rect','<rect x="2" y="4" width="12" height="8" fill="none" stroke="currentColor" stroke-width="1.3"/>'],
         ['image','I','image','<rect x="1" y="3" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1 10l4-4 3 3 2-2 5 5" fill="none" stroke="currentColor"/>'],
         ['chart','C','chart','<path d="M1 13V3h3v10zM6 13V6h3v7zM11 13V8h3v5z" fill="currentColor" opacity=".7"/>'],
       ].map(([t,k,lbl,svg])=>`)<button class="tb-btn tb-tool ${t==='select'?'active':''}" data-tool="${t}" title="${lbl} (${k})" onclick="RF.Classic.Toolbar.setTool('${t}',this)">
        <svg viewBox="0 0 16 16">${svg}</svg><span>${lbl}</span></button>`).join('')}
    </div>
    <div class="tb-sep"></div>

    <!-- Undo/Redo -->
    <div class="tb-group">
      <button id="btn-undo" class="tb-btn" disabled title="Undo (Ctrl+Z)" onclick="RF.H.undo();RF.RP.fullRender()">
        <svg viewBox="0 0 16 16"><path d="M2 6L6 2l4 4M6 2v6a5 5 0 005 5h1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><span>Undo</span>
      </button>
      <button id="btn-redo" class="tb-btn" disabled title="Redo (Ctrl+Y)" onclick="RF.H.redo();RF.RP.fullRender()">
        <svg viewBox="0 0 16 16"><path d="M14 6L10 2 6 6M10 2v6a5 5 0 01-5 5H4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg><span>Redo</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Edit -->
    <div class="tb-group">
      <button class="tb-btn" title="Copy (Ctrl+C)"      onclick="RF.App.copy()">
        <svg viewBox="0 0 16 16"><rect x="5" y="1" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="4" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Copy</span>
      </button>
      <button class="tb-btn" title="Paste (Ctrl+V)"     onclick="RF.App.paste()">
        <svg viewBox="0 0 16 16"><rect x="2" y="4" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 1h4v3H6V1z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Paste</span>
      </button>
      <button class="tb-btn" title="Duplicate (Ctrl+D)" onclick="RF.App.duplicate()">
        <svg viewBox="0 0 16 16"><rect x="4" y="4" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="1" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Dup</span>
      </button>
      <button class="tb-btn danger" title="Delete (Del)" onclick="RF.App.deleteSelected()">
        <svg viewBox="0 0 16 16"><path d="M3 4h10M5 4V2h6v2M6 7v5M10 7v5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 4l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg><span>Delete</span>
      </button>
      <button id="btn-fp" class="tb-btn" title="Format Painter" onclick="RF.UX.FormatPainter.activate()">
        <svg viewBox="0 0 16 16"><path d="M4 2l3 3-6 6 3 3 6-6 3 3 1-9z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Paint</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Alignment -->
    <div class="tb-group" id="align-btns">
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.alignLeft()"     title="Align Left">⊢</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.alignHCenter()"  title="H Center">⊟</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.alignRight()"    title="Align Right">⊣</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.alignTop()"      title="Align Top">⊤</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.alignVCenter()"  title="V Center">⊞</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.alignBottom()"   title="Align Bottom">⊥</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.distributeH()"   title="Distribute H">↔</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.distributeV()"   title="Distribute V">↕</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.equalSpacing()"  title="Equal Space">⟺</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.equalWidth()"    title="Equal Width">↔=</button>
      <button class="tb-btn tb-align" onclick="RF.UX.Alignment.equalHeight()"   title="Equal Height">↕=</button>
    </div>
    <div class="tb-sep"></div>

    <!-- Zoom -->
    <div class="tb-group">
      <button class="tb-btn" onclick="RF.Classic.Canvas.setZoom(RF.Core.DocumentModel.zoom*.8)" title="Zoom Out">
        <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.3"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
      <button id="zoom-btn" class="tb-zoom-btn" onclick="RF.Classic.Canvas.setZoom(1)">100%</button>
      <button class="tb-btn" onclick="RF.Classic.Canvas.setZoom(RF.Core.DocumentModel.zoom*1.25)" title="Zoom In">
        <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.3"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- View toggles -->
    <div class="tb-group">
      <button id="btn-grid" class="tb-btn active tb-toggle" onclick="RF.Classic.Toolbar.toggleGrid()"  title="Grid">
        <svg viewBox="0 0 16 16"><path d="M0 5h16M0 11h16M5 0v16M11 0v16" stroke="currentColor" stroke-width=".8"/></svg><span>Grid</span>
      </button>
      <button id="btn-snap" class="tb-btn active tb-toggle" onclick="RF.Classic.Toolbar.toggleSnap()"  title="Snap">
        <svg viewBox="0 0 16 16"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Snap</span>
      </button>
      <button id="btn-rulers" class="tb-btn active tb-toggle" onclick="RF.Classic.Toolbar.toggleRulers()" title="Rulers">
        <svg viewBox="0 0 16 16"><rect x="1" y="4" width="14" height="8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 4v3M7 4v2M10 4v3M13 4v2" stroke="currentColor" stroke-width="1"/></svg><span>Rulers</span>
      </button>
      <button id="btn-dist" class="tb-btn tb-toggle" onclick="RF.Classic.Toolbar.toggleDistances()" title="Distance Indicators">
        <svg viewBox="0 0 16 16"><path d="M2 8h12M2 8l3-2m-3 2l3 2M14 8l-3-2m3 2l-3 2" stroke="currentColor" stroke-width="1.1"/></svg><span>Dist</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Modules -->
    <div class="tb-group">
      <button class="tb-btn accent" onclick="RF.emit(RF.E.GROUPS_OPEN,null)"  title="Groups &amp; Sorting">
        <svg viewBox="0 0 16 16"><path d="M2 3h12M2 8h8M2 13h10" stroke="currentColor" stroke-width="1.3"/><path d="M12 6l2 2-2 2" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Groups</span>
      </button>
      <button class="tb-btn accent" onclick="RF.emit(RF.E.FILTERS_OPEN,null)" title="Filters">
        <svg viewBox="0 0 16 16"><path d="M1 3h14l-5 5v5l-4-2V8L1 3z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Filter</span>
      </button>
      <button class="tb-btn accent" onclick="RF.emit(RF.E.PARAMS_OPEN,null)"  title="Parameters">
        <svg viewBox="0 0 16 16"><text x="1" y="13" font-size="12" fill="currentColor" font-style="italic">{?}</text></svg><span>Params</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Preview -->
    <div class="tb-group">
      <button class="tb-btn accent" onclick="RF.emit(RF.E.PREVIEW_OPEN,null)" title="Preview report">
        <svg viewBox="0 0 16 16"><path d="M1 8C3 4 5 2 8 2s5 2 7 6c-2 4-4 6-7 6S3 12 1 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Preview</span>
      </button>
    </div>

    <!-- Report name -->
    <div class="spacer"></div>
    <input id="report-name" class="tb-report-name" value="${RF.Core.DocumentModel.layout.name}"
      oninput="RF.Core.DocumentModel.layout.name=this.value;RF.Core.DocumentModel.isDirty=true" title="Report name">
    `));
  },

  _render2() {
    const tb2 = document.getElementById('toolbar2');
    if (!tb2) return;
    // Static base content
    tb2.append(RF.html(`
      <div class="tb2-group" id="tb2-font-group">
        <select id="tb2-font" class="tb2-font-picker tb2-select" title="Font" onchange="RF.Classic.Toolbar._applyFont(this.value)">
          ${['Arial','Tahoma','Times New Roman','Courier New','Verdana','Georgia','Trebuchet MS'].map(f=>`)<option value="${f}">${f}</option>`).join('')}
        </select>
        <input id="tb2-size" class="tb2-font-size tb2-input" type="number" value="10" min="4" max="200"
          title="Font size" onchange="RF.Classic.Toolbar._applyFontSize(parseInt(this.value)||10)">
      </div>
      <div class="tb2-sep"></div>
      <div class="tb2-group">
        <button id="tb2-bold" class="tb2-fmt-btn tb2-fmt-b" title="Bold (Ctrl+B)"      onclick="RF.Classic.Toolbar._applyFmt('bold')"><b>B</b></button>
        <button id="tb2-italic" class="tb2-fmt-btn tb2-fmt-i" title="Italic (Ctrl+I)"    onclick="RF.Classic.Toolbar._applyFmt('italic')"><i>I</i></button>
        <button id="tb2-underline" class="tb2-fmt-btn tb2-fmt-u" title="Underline (Ctrl+U)" onclick="RF.Classic.Toolbar._applyFmt('underline')"><u>U</u></button>
      </div>
      <div class="tb2-sep"></div>
      <div class="tb2-group">
        <button class="tb2-btn" title="Align Left"   onclick="RF.UX.Alignment.alignLeft()">⊢</button>
        <button class="tb2-btn" title="Align Center" onclick="RF.UX.Alignment.alignHCenter()">⊟</button>
        <button class="tb2-btn" title="Align Right"  onclick="RF.UX.Alignment.alignRight()">⊣</button>
      </div>
      <div class="tb2-sep"></div>
      <div class="tb2-group">
        <span class="tb2-label">Page:</span>
        <select class="tb2-select" onchange="RF.Core.DocumentModel.layout.pageSize=this.value;RF.Core.DocumentModel.isDirty=true;RF.emit(RF.E.STATUS,'Page: '+this.value)">
          ${['A4','A3','Letter','Legal'].map(pg=>`<option ${RF.Core.DocumentModel.layout.pageSize===pg?'selected':''}>${pg}</option>`).join('')}
        </select>
        <select class="tb2-select" onchange="RF.Core.DocumentModel.layout.orientation=this.value;RF.Core.DocumentModel.isDirty=true">
          ${['portrait','landscape'].map(o=>`<option ${RF.Core.DocumentModel.layout.orientation===o?'selected':''}>${o}</option>`).join('')}
        </select>
      </div>
      <div class="tb2-sep"></div>
      <div class="tb2-group">
        <button class="tb2-btn" onclick="RF.Core.DocumentModel.reorderElement([...RF.Core.DocumentModel.selectedIds][0],'front');RF.RP.reconcile()">↑ Front</button>
        <button class="tb2-btn" onclick="RF.Core.DocumentModel.reorderElement([...RF.Core.DocumentModel.selectedIds][0],'back');RF.RP.reconcile()">↓ Back</button>
      </div>
      <div class="tb2-sep"></div>
      <div class="tb2-group">
        <button class="tb2-btn" onclick="RF.App.lockSelected()" title="Lock selected">🔒</button>
        <button class="tb2-btn" onclick="RF.App.unlockSelected()" title="Unlock selected">🔓</button>
      </div>
      <div class="tb2-sep"></div>
      <span id="tb2-sel-info" class="u-subtext"></span>
    `));
    // Update font/style controls when selection changes
    RF.on(RF.E.SEL_CHANGED, () => this._updateFmtBar());
  },

  _updateFmtBar() {
    const sel = RF.Core.DocumentModel.selectedElements;
    const info = document.getElementById('tb2-sel-info');
    if (info) info.textContent = sel.length ? `${sel.length} selected` : '';
    if (!sel.length) return;
    const el = sel[0];
    const font = el.fontFamily || 'Arial';
    const size = el.fontSize   || 10;
    const bold      = !!(el.fontBold || el.bold);
    const italic    = !!(el.fontItalic || el.italic);
    const underline = !!(el.fontUnderline || el.underline);
    const fPicker = document.getElementById('tb2-font');
    const fSize   = document.getElementById('tb2-size');
    if (fPicker) fPicker.value = font;
    if (fSize)   fSize.value   = size;
    document.getElementById('tb2-bold')?.classList.toggle('active', bold);
    document.getElementById('tb2-italic')?.classList.toggle('active', italic);
    document.getElementById('tb2-underline')?.classList.toggle('active', underline);
  },

  _applyFont(family) {
    RF.Core.DocumentModel.selectedElements.forEach(el => { el.fontFamily = family; });
    if (RF.Core.DocumentModel.selectedElements.length) {
      RF.RP.reconcile();
      RF.Core.DocumentModel.isDirty = true;
      RF.emit(RF.E.LAYOUT_CHANGED);
    }
  },

  _applyFontSize(size) {
    RF.Core.DocumentModel.selectedElements.forEach(el => { el.fontSize = size; });
    if (RF.Core.DocumentModel.selectedElements.length) {
      RF.RP.reconcile();
      RF.Core.DocumentModel.isDirty = true;
      RF.emit(RF.E.LAYOUT_CHANGED);
    }
  },

  _applyFmt(fmt) {
    const propMap = { bold:'fontBold', italic:'fontItalic', underline:'fontUnderline' };
    const prop = propMap[fmt];
    const els  = RF.Core.DocumentModel.selectedElements;
    if (!els.length) return;
    const cur = !!(els[0][prop]);
    els.forEach(el => { el[prop] = !cur; });
    RF.RP.reconcile();
    RF.Core.DocumentModel.isDirty = true;
    RF.emit(RF.E.LAYOUT_CHANGED);
    this._updateFmtBar();
  },


  setTool(tool, btn) {
    RF.Core.DocumentModel.activeTool = tool;
    document.querySelectorAll('.tb-tool').forEach(b=>b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('canvas-scroll').style.cursor = tool==='select'?'default':'crosshair';
    RF.emit(RF.E.TOOL_CHANGED, tool);
    RF.emit(RF.E.STATUS, `Tool: ${tool}  (Esc to return to Select)`);
  },

  toggleGrid()      { const DM=RF.Core.DocumentModel; DM.showGrid=!DM.showGrid; document.getElementById('btn-grid')?.classList.toggle('active',DM.showGrid); RF.Classic.Canvas.drawGrid(); },
  toggleSnap()      { const DM=RF.Core.DocumentModel; DM.snapToGrid=!DM.snapToGrid; document.getElementById('btn-snap')?.classList.toggle('active',DM.snapToGrid); RF.emit(RF.E.STATUS,`Snap: ${DM.snapToGrid?'on':'off'}`); },
  toggleRulers()    { const DM=RF.Core.DocumentModel; DM.showRulers=!DM.showRulers; document.getElementById('btn-rulers')?.classList.toggle('active',DM.showRulers); RF.Classic.Canvas.drawRulers(); },
  toggleDistances() { const DM=RF.Core.DocumentModel; DM.showDistances=!DM.showDistances; document.getElementById('btn-dist')?.classList.toggle('active',DM.showDistances); },

  _updateHistBtns(s) {
    const u=document.getElementById('btn-undo'), r=document.getElementById('btn-redo');
    if(u) u.disabled=!s.canUndo;
    if(r) r.disabled=!s.canRedo;
  },
  _updateAlignBtns() {
    const n=RF.Core.DocumentModel.selectedIds.size;
    document.querySelectorAll('.tb-align').forEach(b=>{b.disabled=n<2; b.classList.toggle('u-disabled-look', n<2);});
  },
  _updateZoom() {
    const btn=document.getElementById('zoom-btn');
    if(btn) btn.textContent=Math.round(RF.Core.DocumentModel.zoom*100)+'%';
    const sb=document.getElementById('sb-zoom');
    if(sb) sb.textContent=Math.round(RF.Core.DocumentModel.zoom*100)+'%';
  },
  _updateDirty() {
    const d=document.getElementById('sb-dirty');
    if(d) d.textContent=RF.Core.DocumentModel.isDirty?'● Unsaved':'';
  },
  _updateTool() {},
};


// ── Feature modules (v3) ───────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
// RF.Modules — Feature modules: Formula, Parameters, Groups, Sort, Filters,
//              Tables, Charts, Subreports, ConditionalFmt, Preview
// ═══════════════════════════════════════════════════════════════════════════════

// ── FormulaEditor ─────────────────────────────────────────────────────────────
