import RF from '../rf.js';

/**
 * classic/menu.js — RF.Classic.Menu
 * Layer   : Classic UI
 * Purpose : Full Windows-style menu bar (File/Edit/View/Insert/Format/Report/Window/Help).
 *           Renders #menubar, handles open/close, keyboard nav, and delegates actions
 *           to existing RF modules.
 * Deps    : RF.App, RF.LT, RF.Classic.Canvas, RF.Classic.Toolbar
 */

RF.Classic.Menu = {
  _open: null, // currently open top-level menu name

  init() {
    this._render();
    // Close menu on outside click
    document.addEventListener('pointerdown', e => {
      if (!e.target.closest('#menubar')) this._closeAll();
    });
    // Alt key activates first menu
    document.addEventListener('keydown', e => {
      if (e.key === 'Alt') { e.preventDefault(); this._focusFirst(); }
      if (e.key === 'Escape' && this._open) { this._closeAll(); }
    });
  },

  _menus() {
    const DM = RF.Core.DocumentModel;
    return [
      { id:'file', label:'File', items:[
        { label:'New',          kb:'Ctrl+N',  action:()=>RF.LT.newLayout() },
        { label:'Open…',        kb:'Ctrl+O',  action:()=>RF.LT.openFile() },
        { sep:true },
        { label:'Save',         kb:'Ctrl+S',  action:()=>RF.LT.download() },
        { label:'Save As…',                   action:()=>RF.LT.download() },
        { sep:true },
        { label:'Export…',                    action:()=>RF.emit(RF.E.PREVIEW_OPEN,null) },
        { sep:true },
        { label:'Exit',                       action:()=>{ if(confirm('Exit ReportForge?')) window.close(); } },
      ]},
      { id:'edit', label:'Edit', items:[
        { label:'Undo',         kb:'Ctrl+Z',  action:()=>{ RF.H.undo(); RF.RP.fullRender(); }, get disabled(){ return !RF.H._stack||RF.H._idx<=0; } },
        { label:'Redo',         kb:'Ctrl+Y',  action:()=>{ RF.H.redo(); RF.RP.fullRender(); } },
        { sep:true },
        { label:'Cut',          kb:'Ctrl+X',  action:()=>{ RF.App.copy(); RF.App.deleteSelected(); } },
        { label:'Copy',         kb:'Ctrl+C',  action:()=>RF.App.copy() },
        { label:'Paste',        kb:'Ctrl+V',  action:()=>RF.App.paste() },
        { label:'Duplicate',    kb:'Ctrl+D',  action:()=>RF.App.duplicate() },
        { sep:true },
        { label:'Delete',       kb:'Del',     action:()=>RF.App.deleteSelected() },
        { label:'Select All',   kb:'Ctrl+A',  action:()=>RF.Sel.selectAll() },
        { sep:true },
        { label:'Group',        kb:'Ctrl+G',  action:()=>RF.UX.ObjectGroup?.group() },
        { label:'Ungroup',      kb:'Ctrl+Shift+G', action:()=>RF.UX.ObjectGroup?.ungroup() },
      ]},
      { id:'view', label:'View', items:[
        { label:'Design',       kb:'',        action:()=>RF.emit(RF.E.STATUS,'Design mode') },
        { label:'Preview',      kb:'F5',      action:()=>RF.emit(RF.E.PREVIEW_OPEN,null) },
        { sep:true },
        { label:'Field Explorer',             action:()=>this._togglePanel('field-explorer'), get checked(){ return document.getElementById('field-explorer')?.style.display!=='none'; } },
        { label:'Property Inspector',         action:()=>this._togglePanel('property-inspector'), get checked(){ return document.getElementById('property-inspector')?.style.display!=='none'; } },
        { sep:true },
        { label:'Ruler',                      action:()=>RF.Classic.Toolbar.toggleRulers(), get checked(){ return DM.showRulers; } },
        { label:'Grid',                       action:()=>RF.Classic.Toolbar.toggleGrid(),   get checked(){ return DM.showGrid; } },
        { label:'Snap to Grid',               action:()=>RF.Classic.Toolbar.toggleSnap(),   get checked(){ return DM.snapToGrid; } },
        { sep:true },
        { label:'Zoom In',      kb:'Ctrl++',  action:()=>RF.Classic.Canvas.setZoom(DM.zoom*1.25) },
        { label:'Zoom Out',     kb:'Ctrl+-',  action:()=>RF.Classic.Canvas.setZoom(DM.zoom*0.8) },
        { label:'Zoom 100%',    kb:'Ctrl+0',  action:()=>RF.Classic.Canvas.setZoom(1) },
        { label:'Fit Page',                   action:()=>RF.Classic.Canvas.setZoom(0.75) },
      ]},
      { id:'insert', label:'Insert', items:[
        { label:'Text Object',  kb:'T',       action:()=>RF.Classic.Toolbar.setTool('text',  document.querySelector('[data-tool="text"]')) },
        { label:'Database Field',kb:'F',      action:()=>RF.Classic.Toolbar.setTool('field', document.querySelector('[data-tool="field"]')) },
        { sep:true },
        { label:'Line',         kb:'L',       action:()=>RF.Classic.Toolbar.setTool('line',  document.querySelector('[data-tool="line"]')) },
        { label:'Box',          kb:'R',       action:()=>RF.Classic.Toolbar.setTool('rect',  document.querySelector('[data-tool="rect"]')) },
        { label:'Image',        kb:'I',       action:()=>RF.Classic.Toolbar.setTool('image', document.querySelector('[data-tool="image"]')) },
        { sep:true },
        { label:'Chart…',                     action:()=>RF.emit(RF.E.CHART_OPEN,null) },
        { label:'Cross-Tab…',                 action:()=>RF.emit(RF.E.STATUS,'Cross-Tab not yet available') },
        { label:'Subreport…',                 action:()=>RF.emit(RF.E.SUBREPORT_OPEN,null) },
      ]},
      { id:'format', label:'Format', items:[
        { label:'Format Field…', kb:'F4',     action:()=>{ const sel=RF.Core.DocumentModel.selectedElements; if(sel.length) RF.emit(RF.E.INSPECTOR_REFRESH); } },
        { sep:true },
        { label:'Align Left',                 action:()=>RF.UX.Alignment.alignLeft() },
        { label:'Align Right',                action:()=>RF.UX.Alignment.alignRight() },
        { label:'Align Top',                  action:()=>RF.UX.Alignment.alignTop() },
        { label:'Align Bottom',               action:()=>RF.UX.Alignment.alignBottom() },
        { label:'Center Horizontally',        action:()=>RF.UX.Alignment.alignHCenter() },
        { label:'Center Vertically',          action:()=>RF.UX.Alignment.alignVCenter() },
        { sep:true },
        { label:'Make Same Width',            action:()=>RF.UX.Alignment.equalWidth?.() },
        { label:'Make Same Height',           action:()=>RF.UX.Alignment.equalHeight?.() },
        { label:'Distribute Horizontally',    action:()=>RF.UX.Alignment.distributeH() },
        { label:'Distribute Vertically',      action:()=>RF.UX.Alignment.distributeV() },
      ]},
      { id:'report', label:'Report', items:[
        { label:'Select Expert…',             action:()=>RF.emit(RF.E.FILTERS_OPEN,null) },
        { label:'Record Sort Expert…',        action:()=>RF.emit(RF.E.GROUPS_OPEN,null) },
        { label:'Group Expert…',              action:()=>RF.emit(RF.E.GROUPS_OPEN,null) },
        { sep:true },
        { label:'Formula Workshop…',          action:()=>RF.emit(RF.E.FORMULA_OPEN,{}) },
        { sep:true },
        { label:'Section Expert…',            action:()=>RF.emit(RF.E.SECTION_EXPERT_OPEN,null) },
        { label:'Running Total Expert…',      action:()=>RF.emit(RF.E.RT_OPEN,null) },
        { sep:true },
        { label:'Report Parameters…',         action:()=>RF.emit(RF.E.PARAMS_OPEN,null) },
        { label:'Conditional Formatting…',    action:()=>RF.emit(RF.E.COND_FMT_OPEN,null) },
      ]},
      { id:'help', label:'Help', items:[
        { label:'About ReportForge…',         action:()=>alert('ReportForge Designer\nCrystal Reports-compatible visual designer') },
      ]},
    ];
  },

  _render() {
    const bar = document.getElementById('menubar');
    if (!bar) return;
    RF.clear(bar);
    this._menus().forEach(menu => {
      const btn = document.createElement('div');
      btn.className   = 'mb-item';
      btn.dataset.mid = menu.id;
      btn.textContent = menu.label;
      btn.addEventListener('pointerdown', e => { e.preventDefault(); this._toggle(menu.id); });
      btn.addEventListener('pointerenter', () => { if (this._open && this._open !== menu.id) this._open_(menu.id); });
      bar.appendChild(btn);
    });
  },

  _toggle(id) {
    if (this._open === id) { this._closeAll(); return; }
    this._open_(id);
  },

  _open_(id) {
    this._closeAll(false);
    this._open = id;
    const btn  = document.querySelector(`.mb-item[data-mid="${id}"]`);
    if (!btn) return;
    btn.classList.add('mb-active');

    const menu = this._menus().find(m => m.id === id);
    if (!menu) return;

    const dd = document.createElement('div');
    dd.className = 'mb-dropdown';
    dd.id = 'mb-dd';

    menu.items.forEach(item => {
      if (item.sep) {
        const sep = document.createElement('div');
        sep.className = 'mb-sep';
        dd.appendChild(sep);
        return;
      }
      const row = document.createElement('div');
      row.className = 'mb-dd-item' + (item.disabled ? ' mb-disabled' : '') + (item.checked ? ' mb-checked' : '');
      row.append(RF.html(`<span class="mb-dd-label">${item.label}</span>${item.kb ? `)<span class="mb-dd-kb">${item.kb}</span>` : ''}`));
      if (!item.disabled) {
        row.addEventListener('pointerdown', e => {
          e.preventDefault();
          this._closeAll();
          item.action?.();
        });
        row.addEventListener('pointerenter', () => {
          dd.querySelectorAll('.mb-dd-item').forEach(r => r.classList.remove('mb-hover'));
          row.classList.add('mb-hover');
        });
      }
      dd.appendChild(row);
    });

    // Position dropdown below the button
    const rect = btn.getBoundingClientRect();
    dd.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.bottom}px;z-index:99999;`;
    document.body.appendChild(dd);
  },

  _closeAll(resetOpen = true) {
    document.getElementById('mb-dd')?.remove();
    document.querySelectorAll('.mb-item').forEach(b => b.classList.remove('mb-active'));
    if (resetOpen) this._open = null;
  },

  _focusFirst() {
    const first = document.querySelector('.mb-item');
    if (first) { this._toggle(first.dataset.mid); }
  },


  _switchTab(mode) {
    const designTab  = document.getElementById('tab-design');
    const previewTab = document.getElementById('tab-preview');
    const rulerH     = document.getElementById('ruler-h');
    const rulerV     = document.getElementById('ruler-v');
    const rulerCorner= document.getElementById('ruler-corner');
    const canvasScroll = document.getElementById('canvas-scroll');

    if (mode === 'preview') {
      designTab?.classList.remove('canvas-tab-active');
      previewTab?.classList.add('canvas-tab-active');
      RF.emit(RF.E.PREVIEW_OPEN, null);
    } else {
      previewTab?.classList.remove('canvas-tab-active');
      designTab?.classList.add('canvas-tab-active');
      RF.emit(RF.E.PREVIEW_CLOSE, null);
    }
  },
  _togglePanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('u-hidden');
    // Also toggle adjacent splitter
    const splitter = el.nextElementSibling?.classList.contains('panel-splitter') ? el.nextElementSibling
                   : el.previousElementSibling?.classList.contains('panel-splitter') ? el.previousElementSibling
                   : null;
    if (splitter) splitter.classList.toggle('u-hidden', el.classList.contains('u-hidden'));
  },
};
