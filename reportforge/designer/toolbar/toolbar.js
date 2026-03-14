// ─────────────────────────────────────────────────────────────────────────────
// toolbar/toolbar.js  –  Main Toolbar  (features 16–27 buttons + tools)
// ─────────────────────────────────────────────────────────────────────────────
RF.Toolbar = {

  init() {
    this._render();
    RF.EventBus
      .on('history:changed',    s => this._updateHistoryBtns(s))
      .on('selection:changed',  () => this._updateAlignBtns())
      .on('layout:changed',     () => this._updateZoomLabel());
  },

  _render() {
    const tb = document.getElementById('toolbar');
    if (!tb) return;
    tb.innerHTML = `
    <!-- File -->
    <div class="tb-group">
      <button class="tb-btn" onclick="RF.Serializer.newLayout()" title="New (Ctrl+N)">
        <svg viewBox="0 0 16 16"><path d="M4 1h6l4 4v10H4V1z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10 1v4h4" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>New</span>
      </button>
      <button class="tb-btn" onclick="RF.Serializer.openFile()" title="Open">
        <svg viewBox="0 0 16 16"><path d="M2 4h5l2 2h5v8H2V4z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Open</span>
      </button>
      <button class="tb-btn" onclick="RF.Serializer.download()" title="Save (Ctrl+S)">
        <svg viewBox="0 0 16 16"><path d="M3 1h8l3 3v11H3V1z" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="5" y="9" width="6" height="5" fill="none" stroke="currentColor" stroke-width="1"/><rect x="5" y="1" width="6" height="4" fill="none" stroke="currentColor" stroke-width="1"/></svg>
        <span>Save</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Tools -->
    <div class="tb-group">
      <button class="tb-btn tb-tool active" data-tool="select" title="Select (V)" onclick="RF.Toolbar.setTool('select',this)">
        <svg viewBox="0 0 16 16"><path d="M3 2l10 6-5 1-2 5L3 2z" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Select</span>
      </button>
      <button class="tb-btn tb-tool" data-tool="text" title="Text (T)" onclick="RF.Toolbar.setTool('text',this)">
        <svg viewBox="0 0 16 16"><text x="2" y="13" font-size="13" font-weight="bold" fill="currentColor">T</text></svg>
        <span>Text</span>
      </button>
      <button class="tb-btn tb-tool" data-tool="field" title="Field (F)" onclick="RF.Toolbar.setTool('field',this)">
        <svg viewBox="0 0 16 16"><rect x="1" y="5" width="14" height="6" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><text x="3" y="11" font-size="7" fill="currentColor">{f}</text></svg>
        <span>Field</span>
      </button>
      <button class="tb-btn tb-tool" data-tool="line" title="Line (L)" onclick="RF.Toolbar.setTool('line',this)">
        <svg viewBox="0 0 16 16"><line x1="2" y1="14" x2="14" y2="2" stroke="currentColor" stroke-width="1.5"/></svg>
        <span>Line</span>
      </button>
      <button class="tb-btn tb-tool" data-tool="rect" title="Rectangle (R)" onclick="RF.Toolbar.setTool('rect',this)">
        <svg viewBox="0 0 16 16"><rect x="2" y="4" width="12" height="8" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Rect</span>
      </button>
      <button class="tb-btn tb-tool" data-tool="image" title="Image (I)" onclick="RF.Toolbar.setTool('image',this)">
        <svg viewBox="0 0 16 16"><rect x="1" y="3" width="14" height="10" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M1 10l4-4 3 3 2-2 5 5" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>
        <span>Image</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Undo / Redo -->
    <div class="tb-group">
      <button id="btn-undo" class="tb-btn" disabled onclick="RF.History.undo();RF.Sections.fullRender()" title="Undo (Ctrl+Z)">
        <svg viewBox="0 0 16 16"><path d="M2 6L6 2l4 4M6 2v6a5 5 0 005 5h1" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        <span>Undo</span>
      </button>
      <button id="btn-redo" class="tb-btn" disabled onclick="RF.History.redo();RF.Sections.fullRender()" title="Redo (Ctrl+Y)">
        <svg viewBox="0 0 16 16"><path d="M14 6L10 2 6 6M10 2v6a5 5 0 01-5 5H4" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
        <span>Redo</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Edit -->
    <div class="tb-group">
      <button class="tb-btn" onclick="RF.Keyboard._copy()" title="Copy (Ctrl+C)">
        <svg viewBox="0 0 16 16"><rect x="5" y="1" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="2" y="4" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Copy</span>
      </button>
      <button class="tb-btn" onclick="RF.Keyboard._paste()" title="Paste (Ctrl+V)">
        <svg viewBox="0 0 16 16"><rect x="2" y="4" width="9" height="11" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M6 1h4v3H6V1z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Paste</span>
      </button>
      <button class="tb-btn" onclick="RF.Keyboard._duplicate()" title="Duplicate (Ctrl+D)">
        <svg viewBox="0 0 16 16"><rect x="4" y="4" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="1" y="1" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Dup</span>
      </button>
      <button class="tb-btn tb-danger" onclick="const ids=[...RF.AppState.selectedIds];if(ids.length){RF.History.snapshot('before-delete');RF.ElementFactory.deleteElements(ids)}" title="Delete (Del)">
        <svg viewBox="0 0 16 16"><path d="M3 4h10M5 4V2h6v2M6 7v5M10 7v5" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M4 4l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>
        <span>Delete</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Alignment -->
    <div class="tb-group" id="align-btns">
      <button class="tb-btn tb-align" onclick="RF.Alignment.alignLeft()"    title="Align Left">⊢</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.alignHCenter()" title="Align H.Center">⊟</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.alignRight()"   title="Align Right">⊣</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.alignTop()"     title="Align Top">⊤</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.alignVCenter()" title="Align V.Center">⊞</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.alignBottom()"  title="Align Bottom">⊥</button>
      <div class="tb-sep"></div>
      <button class="tb-btn tb-align" onclick="RF.Alignment.distributeHorizontal()" title="Distribute H">↔</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.distributeVertical()"   title="Distribute V">↕</button>
      <button class="tb-btn tb-align" onclick="RF.Alignment.equalSpacing()"         title="Equal spacing">⟺</button>
    </div>
    <div class="tb-sep"></div>

    <!-- Zoom -->
    <div class="tb-group">
      <button class="tb-btn" onclick="RF.Canvas.setZoom(RF.AppState.zoom*0.8)" title="Zoom Out">
        <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.3"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
      <button id="zoom-label" class="tb-zoom-lbl" onclick="RF.Canvas.setZoom(1)">100%</button>
      <button class="tb-btn" onclick="RF.Canvas.setZoom(RF.AppState.zoom*1.25)" title="Zoom In">
        <svg viewBox="0 0 16 16"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.3"/><line x1="7" y1="4" x2="7" y2="10" stroke="currentColor" stroke-width="1.3"/><line x1="4" y1="7" x2="10" y2="7" stroke="currentColor" stroke-width="1.3"/><line x1="11" y1="11" x2="15" y2="15" stroke="currentColor" stroke-width="1.3"/></svg>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- View toggles -->
    <div class="tb-group">
      <button id="btn-grid" class="tb-btn tb-toggle active" onclick="RF.Toolbar.toggleGrid()" title="Toggle Grid">
        <svg viewBox="0 0 16 16"><path d="M0 5h16M0 11h16M5 0v16M11 0v16" stroke="currentColor" stroke-width=".8"/></svg>
        <span>Grid</span>
      </button>
      <button id="btn-snap" class="tb-btn tb-toggle active" onclick="RF.Toolbar.toggleSnap()" title="Toggle Snap">
        <svg viewBox="0 0 16 16"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Snap</span>
      </button>
    </div>
    <div class="tb-sep"></div>

    <!-- Preview -->
    <div class="tb-group">
      <button class="tb-btn tb-preview" onclick="RF.App.openPreview()" title="Preview report">
        <svg viewBox="0 0 16 16"><path d="M1 8C3 4 5 2 8 2s5 2 7 6c-2 4-4 6-7 6S3 12 1 8z" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="2.5" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>
        <span>Preview</span>
      </button>
    </div>

    <!-- Report name -->
    <div class="tb-name" style="margin-left:auto;display:flex;align-items:center;gap:6px">
      <input id="report-name" value="${RF.AppState.layout.name}"
        oninput="RF.AppState.layout.name=this.value;RF.AppState.isDirty=true"
        style="background:transparent;border:none;border-bottom:1px solid #444;color:#DDD;font-size:13px;padding:2px 4px;width:160px">
    </div>
    `;
  },

  setTool(tool, btn) {
    RF.AppState.activeTool = tool;
    document.querySelectorAll('.tb-tool').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    document.getElementById('canvas-scroll').style.cursor =
      tool === 'select' ? 'default' : 'crosshair';
    RF.EventBus.emit('status', `Tool: ${tool}`);
  },

  toggleGrid() {
    RF.AppState.showGrid = !RF.AppState.showGrid;
    document.getElementById('btn-grid')?.classList.toggle('active', RF.AppState.showGrid);
    RF.Canvas.drawGrid();
  },

  toggleSnap() {
    RF.AppState.snapToGrid = !RF.AppState.snapToGrid;
    document.getElementById('btn-snap')?.classList.toggle('active', RF.AppState.snapToGrid);
    RF.EventBus.emit('status', `Snap: ${RF.AppState.snapToGrid ? 'on' : 'off'}`);
  },

  _updateHistoryBtns(s) {
    const u = document.getElementById('btn-undo');
    const r = document.getElementById('btn-redo');
    if (u) u.disabled = !s.canUndo;
    if (r) r.disabled = !s.canRedo;
  },

  _updateAlignBtns() {
    const n = RF.AppState.selectedIds.size;
    document.querySelectorAll('.tb-align').forEach(b => {
      b.disabled = n < 2;
      b.style.opacity = n < 2 ? '0.3' : '1';
    });
  },

  _updateZoomLabel() {
    const lbl = document.getElementById('zoom-label');
    if (lbl) lbl.textContent = Math.round(RF.AppState.zoom * 100) + '%';
  },
};
