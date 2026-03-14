import RF from './rf.js';

// =============================================================================
// RF.App — application controller
// Consolidates: original v3 RF.App + v4 boot patch 1 + v4 boot patch 2.
// The init() method calls every module's .init() in the correct order.
// =============================================================================
RF.App = {
  _clipboard: [],

  init() {
    RF.Core.DocumentModel.init();
    RF.H.clear();
    RF.Classic.Toolbar.init();
    RF.Classic.Menu.init();
    RF.RP.fullRender();
    RF.Classic.Canvas.init();
    RF.UX.Guides.init();
    RF.Classic.Explorer.init();
    RF.Classic.Inspector.init();

    // Feature modules
    RF.Modules.FormulaEditor.init();
    RF.Modules.Parameters.init();
    RF.Modules.Groups.init();
    RF.Modules.Filters.init();
    RF.Modules.ConditionalFmt.init();
    RF.Modules.SectionExpert.init();
    RF.Modules.Tables.init();
    RF.Modules.Charts.init();
    RF.Modules.Subreports.init();
    RF.Modules.ObjectExplorer.init();
    RF.Modules.Preview.init();

    this._initKeyboard();
    this._initToolCreation();
    this._initDropZones();
    this._initStatusBar();
    RF.H.snapshot('init');
    RF.emit(RF.E.STATUS, 'ReportForge Designer v3 ready — drag fields from explorer to canvas');
  },

  // ── Status bar ────────────────────────────────────────────────────────────
  _initStatusBar() {
    RF.on(RF.E.STATUS, msg => {
      const el=document.getElementById('sb-msg'); if(el) el.textContent=msg;
    });
    RF.on(RF.E.SEL_CHANGED, () => {
      const n=RF.Core.DocumentModel.selectedIds.size;
      const el=document.getElementById('sb-sel'); if(el) el.textContent=n?`${n} sel`:'';
    });
    RF.on(RF.E.LAYOUT_CHANGED, () => {
      const el=document.getElementById('sb-dirty');
      if(el) el.textContent=RF.Core.DocumentModel.isDirty?'● Unsaved':'';
    });
    document.getElementById('canvas-surface')?.addEventListener('pointermove', e => {
      const surf=document.getElementById('canvas-surface');
      const rect=surf.getBoundingClientRect(), DM=RF.Core.DocumentModel;
      const el=document.getElementById('sb-coord');
      if(el) el.textContent=`X:${Math.round((e.clientX-rect.left)/DM.zoom)}  Y:${Math.round((e.clientY-rect.top)/DM.zoom)}`;
    });
  },

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  _initKeyboard() {
    document.addEventListener('keydown', e => {
      // Don't fire when typing in inputs
      const tag=document.activeElement?.tagName;
      const editing=tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT';

      const DM=RF.Core.DocumentModel;
      const mod=e.ctrlKey||e.metaKey;

      if (mod && !editing) {
        switch(e.key.toLowerCase()) {
          case 'z': e.preventDefault(); RF.H.undo(); RF.RP.fullRender(); return;
          case 'y': case 'Z': e.preventDefault(); RF.H.redo(); RF.RP.fullRender(); return;
          case 'c': e.preventDefault(); this.copy(); return;
          case 'v': e.preventDefault(); this.paste(); return;
          case 'd': e.preventDefault(); this.duplicate(); return;
          case 'a': e.preventDefault(); RF.Sel.selectAll(); return;
          case 's': e.preventDefault(); RF.LT.download(); return;
          case 'n': e.preventDefault(); RF.LT.newLayout(); return;
        }
      }

      if (!editing) {
        switch(e.key) {
          case 'Delete': case 'Backspace': e.preventDefault(); this.deleteSelected(); return;
          case 'F5': e.preventDefault(); RF.Classic.Menu?._switchTab('preview'); return;
          case 'Escape':
            if (RF.UX.FormatPainter.isActive) { RF.UX.FormatPainter.deactivate(); return; }
            RF.Classic.Menu?._switchTab('design');
            RF.Classic.Toolbar.setTool('select', document.querySelector('[data-tool="select"]'));
            RF.Sel.clear();
            return;
          // Tool hotkeys
          case 'v': case 'V': RF.Classic.Toolbar.setTool('select',document.querySelector('[data-tool="select"]')); return;
          case 't': case 'T': RF.Classic.Toolbar.setTool('text',  document.querySelector('[data-tool="text"]'));   return;
          case 'f': case 'F': RF.Classic.Toolbar.setTool('field', document.querySelector('[data-tool="field"]'));  return;
          case 'l': case 'L': RF.Classic.Toolbar.setTool('line',  document.querySelector('[data-tool="line"]'));   return;
          case 'r': case 'R': RF.Classic.Toolbar.setTool('rect',  document.querySelector('[data-tool="rect"]'));   return;
          case 'i': case 'I': RF.Classic.Toolbar.setTool('image', document.querySelector('[data-tool="image"]'));  return;
        }
        // Arrow keys — move selected elements
        const STEP=e.shiftKey?10:1;
        if (e.key==='ArrowLeft')  { e.preventDefault(); RF.UX.DragTools.keyMove(-STEP,0); RF.RP.reconcile(); }
        if (e.key==='ArrowRight') { e.preventDefault(); RF.UX.DragTools.keyMove( STEP,0); RF.RP.reconcile(); }
        if (e.key==='ArrowUp')    { e.preventDefault(); RF.UX.DragTools.keyMove(0,-STEP); RF.RP.reconcile(); }
        if (e.key==='ArrowDown')  { e.preventDefault(); RF.UX.DragTools.keyMove(0, STEP); RF.RP.reconcile(); }
      }

      // Ctrl+G = Group, Ctrl+Shift+G = Ungroup
      if (mod && e.key==='g' && !e.shiftKey) { e.preventDefault(); RF.UX.ObjectGroup?.group(); return; }
      if (mod && e.shiftKey && e.key==='G')  { e.preventDefault();
        const _sel=RF.Core.DocumentModel.selectedElements;
        if(_sel.length===1&&_sel[0].groupId) RF.UX.ObjectGroup?.ungroupEl(_sel[0].id); return; }

      // Ctrl+Shift+O = Object Explorer
      if (mod && e.shiftKey && e.key==='O') { e.preventDefault(); RF.Modules.ObjectExplorer?.toggle(); return; }

      // Ctrl+[ / Ctrl+] = z-order
      if (mod && e.key==='[') { e.preventDefault(); [...RF.Core.DocumentModel.selectedIds].forEach(id=>RF.Core.DocumentModel.reorderElement(id,'backward')); RF.RP.reconcile(); return; }
      if (mod && e.key===']') { e.preventDefault(); [...RF.Core.DocumentModel.selectedIds].forEach(id=>RF.Core.DocumentModel.reorderElement(id,'forward')); RF.RP.reconcile(); return; }
    });


  },

  // ── Clipboard ─────────────────────────────────────────────────────────────
  copy() {
    const sel=RF.Core.DocumentModel.selectedElements;
    if(!sel.length) return;
    this._clipboard=RF.clone(sel);
    this._pasteCount=0;
    RF.emit(RF.E.STATUS,`Copied ${sel.length} element(s)`);
  },

  _pasteCount: 0,
  paste() {
    if(!this._clipboard.length) return;
    RF.H.snapshot('before-paste');
    const DM=RF.Core.DocumentModel;
    this._pasteCount++;
    const offset = this._pasteCount * 4;
    const newIds=[];
    this._clipboard.forEach(src=>{
      const el=RF.clone(src);
      el.id=RF.uid('el'); el.x+=offset; el.y+=offset;
      DM.layout.elements.push(el); newIds.push(el.id);
    });
    DM.selectedIds=new Set(newIds);
    DM.isDirty=true;
    RF.RP.reconcile();
    RF.emit(RF.E.STATUS,`Pasted ${newIds.length} element(s)`);
  },

  duplicate() {
    const DM=RF.Core.DocumentModel;
    if(!DM.selectedIds.size) return;
    RF.H.snapshot('before-dup');
    DM.duplicateElements([...DM.selectedIds]);
    RF.RP.reconcile();
    RF.emit(RF.E.STATUS,'Duplicated');
  },

  deleteSelected() {
    const DM=RF.Core.DocumentModel;
    if(!DM.selectedIds.size) return;
    RF.H.snapshot('before-delete');
    DM.deleteElements([...DM.selectedIds]);
    RF.RP.reconcile();
  },

  lockSelected()   { RF.Core.DocumentModel.selectedElements.forEach(el=>RF.Core.DocumentModel.updateElement(el.id,{locked:true}));  RF.RP.reconcile(); },
  unlockSelected() { RF.Core.DocumentModel.selectedElements.forEach(el=>RF.Core.DocumentModel.updateElement(el.id,{locked:false})); RF.RP.reconcile(); },

  // ── Tool creation (draw on canvas) ───────────────────────────────────────
  _initToolCreation() {
    document.getElementById('canvas-surface')?.addEventListener('pointerdown', e => {
      const tool=RF.Core.DocumentModel.activeTool;
      if (tool==='select'||e.button!==0) return;
      const secBody=e.target.closest('.rf-sec-body');
      if (!secBody||e.target.classList.contains('rf-el')||e.target.dataset.handle) return;
      e.preventDefault(); e.stopPropagation();
      const DM=RF.Core.DocumentModel, sId=secBody.dataset.secid;
      const surf=document.getElementById('canvas-surface');
      const sRect=surf.getBoundingClientRect(), bRect=secBody.getBoundingClientRect();
      const bx=(bRect.left-sRect.left)/DM.zoom, by=(bRect.top-sRect.top)/DM.zoom;
      const pt={x:(e.clientX-sRect.left)/DM.zoom, y:(e.clientY-sRect.top)/DM.zoom};
      const lx=RF.clamp(pt.x-bx,0,DM.layout.pageWidth-40);
      const ly=RF.clamp(pt.y-by,0,(DM.getSectionById(sId)?.height||40)-4);
      const snp=RF.UX.Snapping.snapPoint(lx,ly);
      this._dragCreate(e, tool, sId, snp.x, snp.y, bx, by);
    });
  },

  _dragCreate(startEv, type, sectionId, startX, startY, bx, by) {
    let el=null, div=null;
    const DM=RF.Core.DocumentModel;
    const surf=document.getElementById('canvas-surface');

    const onMove=e=>{
      const sRect=surf.getBoundingClientRect();
      const pt={x:(e.clientX-sRect.left)/DM.zoom,y:(e.clientY-sRect.top)/DM.zoom};
      const lx=pt.x-bx, ly=pt.y-by;
      const w=Math.max(8,Math.abs(lx-startX)), h=Math.max(4,Math.abs(ly-startY));
      const nx=Math.min(lx,startX), ny=Math.min(ly,startY);
      if (!el) {
        RF.H.snapshot('before-create');
        el=DM.createElement(type,sectionId,nx,ny,{w,h});
        if(!el) return;
        div=RF.Classic.Elements.renderDOM(el);
        document.getElementById(`secbody-${sectionId}`)?.appendChild(div);
        RF.Classic.Sections.attachElementEvents(div);
      } else {
        el.x=Math.round(RF.clamp(nx,0,DM.layout.pageWidth-8));
        el.y=Math.round(Math.max(0,ny)); el.w=Math.round(w); el.h=Math.round(h);
        RF.Classic.Elements.applyStyle(div,el);
      }
    };

    const onUp=()=>{
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      if(!el){
        RF.H.snapshot('before-create');
        el=DM.createElement(type,sectionId,startX,startY,{});
        if(!el) return;
        RF.Classic.Sections.attachNewElement(el);
      } else {
        RF.Sel.select(el.id);
        // Open designer modal for complex types
        if (type==='chart')     RF.emit('charts:open',    el.id);
        if (type==='table')     RF.emit('tables:open',    el.id);
        if (type==='subreport') RF.emit('subreports:open',el.id);
      }
      RF.Classic.Toolbar.setTool('select',document.querySelector('[data-tool="select"]'));
      DM.isDirty=true;
      RF.emit(RF.E.LAYOUT_CHANGED);
      RF.emit(RF.E.STATUS,`Created ${type}: ${el?.id}`);
    };

    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  },

  // ── Drop zones (field explorer → canvas sections) ─────────────────────────
  _initDropZones() {
    RF.on(RF.E.LAYOUT_CHANGED, ()=>this._attachDropToSections());
    this._attachDropToSections();
  },

  _attachDropToSections() {
    document.querySelectorAll('.rf-sec-body').forEach(body=>{
      if (body.dataset.dropInit) return;
      body.dataset.dropInit='1';
      body.addEventListener('dragover',  e=>{ e.preventDefault(); e.dataTransfer.dropEffect='copy'; body.dataset.dragging='1'; });
      body.addEventListener('dragleave', ()=>{ delete body.dataset.dragging; });
      body.addEventListener('drop',      e=>{ delete body.dataset.dragging; RF.Classic.Explorer.handleDrop(e, body.dataset.secid); });
    });
  },
};


// ── v4 Extensions: Core/UX/Classic patches ─────────────────────────────

// ── v4: Extend RF.E with new events ──────────────────────────────────────────
// ── v4 event constants (extends base RF.E defined in rf.js) ──────────────────
Object.assign(RF.E, {
  CTX_MENU:           'ctx:menu',
  GROUP_OPEN:         'group:open',
  UNGROUP:            'ungroup',
  RUNNING_TOTAL:      'rt:open',
  RT_OPEN:            'rt:open',
  TOPN_OPEN:          'topn:open',
  REPO_OPEN:          'repo:open',
  SECTION_COLLAPSE:   'section:collapse',
  OBJ_EXPLORER:       'objexp:toggle',
  CHART_OPEN:         'chart:open',
  SUBREPORT_OPEN:     'subreport:open',
  SECTION_EXPERT_OPEN:'section-expert:open',
});


// ── v4: Extended element types ────────────────────────────────────────────────

// =============================================================================
// RF.App._initV4 — consolidated v4 boot (formerly two IIFE patches)
// =============================================================================
RF.App._initV4 = function() {

  // ── v4 core modules ─────────────────────────────────────────────────────────
  RF.UX.ContextMenu.init();
  RF.Classic.SectionsV4.patchRender();
  RF.Modules.FormulaEditorV4.patchFormulaEditor();
  RF.Modules.RunningTotals.init();
  RF.Modules.Crosstab.init();
  RF.Modules.TopN.init();
  RF.Modules.MultiSection.init();
  RF.Classic.StatusBarV4.init();
  RF.Classic.ToolbarV4.init();
  RF.UX.PanelSplitter.init();

  // Re-render to apply section patches
  RF.RP.fullRender();
  RF.Classic.StatusBarV4._updateGrid();
  RF.Classic.StatusBarV4._updateSnap();

  // Wire snap/grid toggles to status bar
  const _origGrid = RF.Classic.Toolbar.toggleGrid.bind(RF.Classic.Toolbar);
  RF.Classic.Toolbar.toggleGrid = function() {
    _origGrid();
    RF.Classic.StatusBarV4._updateGrid();
  };
  const _origSnap = RF.Classic.Toolbar.toggleSnap.bind(RF.Classic.Toolbar);
  RF.Classic.Toolbar.toggleSnap = function() {
    _origSnap();
    RF.Classic.StatusBarV4._updateSnap();
  };

  // Patch Explorer to show running totals
  const DM = RF.Core.DocumentModel;
  if ((DM.layout.runningTotals||[]).length) {
    DM.fieldData.running = (DM.layout.runningTotals||[]).map(r=>`RunTotal.${r.name}`);
  }

  // Add section manager buttons to toolbar2
  const tb2 = document.getElementById('toolbar2');
  if (tb2 && !tb2.dataset.v4sec) {
    tb2.dataset.v4sec='1';
    tb2.insertAdjacentHTML('beforeend', `
      <div class="tb2-sep"></div>
      <button class="tb2-btn" onclick="RF.emit('multisec:open')" title="Section Manager">§§ Sections</button>
      <button class="tb2-btn" onclick="RF.emit(RF.E.TOPN_OPEN)" title="Record Selection / Top-N">⊿ Rec.Sel</button>
      <button class="tb2-btn" onclick="RF.emit(RF.E.RUNNING_TOTAL)" title="Running Totals">Σ Run.Totals</button>
    `);
  }

  // ── v4 editor modules ────────────────────────────────────────────────────────
  RF.Modules.ReportExplorer.init();
  RF.Modules.RepositoryExplorer.init();
  RF.Modules.SQLEditor.init();
  RF.Modules.FormulaDebugger.init();
  RF.Modules.BarcodeEditor.init();
  RF.Modules.RichTextEditor.init();
  RF.Modules.MapEditor.init();

  // Panel tabs + field drag ghost (init AFTER modules exist)
  setTimeout(() => {
    RF.UX.PanelTabs.init();
    RF.UX.FieldDragGhost.init();
  }, 50);

  // Wire context menu type-specific items
  RF.on('barcode:open',  elId => { RF.UX.ContextMenu.hide(); RF.Modules.BarcodeEditor.open(elId); });
  RF.on('richtext:open', elId => { RF.UX.ContextMenu.hide(); RF.Modules.RichTextEditor.open(elId); });
  RF.on('mapobj:open',   elId => { RF.UX.ContextMenu.hide(); RF.Modules.MapEditor.open(elId); });
  RF.on('formula:debug', ()   => RF.Modules.FormulaDebugger.open());
  RF.on('sql:open',      ()   => RF.Modules.SQLEditor.open());

  // Keyboard: F9=SQL, Ctrl+Shift+F=Formula Debugger, Ctrl+R=Repository
  document.addEventListener('keydown', e => {
    if (document.activeElement?.tagName==='INPUT' || document.activeElement?.tagName==='TEXTAREA') return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.key==='F9')                    { e.preventDefault(); RF.emit('sql:open'); }
    if (mod && e.shiftKey && e.key==='F'){ e.preventDefault(); RF.emit('formula:debug'); }
    if (mod && e.key==='r' && !e.shiftKey){ e.preventDefault(); RF.emit(RF.E.REPO_OPEN); }
  });

  // Inject SQL / Repo / Debug buttons into toolbar
  const tb = document.getElementById('toolbar');
  if (tb) {
    const sqBtn = document.createElement('button');
    sqBtn.className = 'tb-btn accent';
    sqBtn.title = 'SQL Expression Editor (F9)';
    sqBtn.append(RF.html('<svg viewBox="0 0 16 16"><text x="0" y="12" font-size="9" fill="currentColor">SQL</text></svg><span>SQL</span>'));
    sqBtn.addEventListener('click', () => RF.emit('sql:open'));

    const repoBtn = document.createElement('button');
    repoBtn.className = 'tb-btn accent';
    repoBtn.title = 'Repository Explorer (Ctrl+R)';
    repoBtn.append(RF.html('<svg viewBox="0 0 16 16"><text x="0" y="11" font-size="8" fill="currentColor">Repo</text></svg><span>Repo</span>'));
    repoBtn.addEventListener('click', () => RF.emit(RF.E.REPO_OPEN));

    const fdbBtn = document.createElement('button');
    fdbBtn.className = 'tb-btn accent';
    fdbBtn.title = 'Formula Debugger (Ctrl+Shift+F)';
    fdbBtn.append(RF.html('<svg viewBox="0 0 16 16"><text x="0" y="12" font-size="10" fill="currentColor">🐛</text></svg><span>Debug</span>'));
    fdbBtn.addEventListener('click', () => RF.emit('formula:debug'));

    tb.appendChild(sqBtn);
    tb.appendChild(repoBtn);
    tb.appendChild(fdbBtn);
  }

  RF.emit(RF.E.STATUS, 'ReportForge Designer v4 — Crystal Reports workflow ready');
};

// Extend RF.App.init to call _initV4 after base init
const _baseInit = RF.App.init.bind(RF.App);
RF.App.init = function() {
  _baseInit();
  RF.App._initV4();
};

export default RF.App;
