// ─────────────────────────────────────────────────────────────────────────────
// app.js  –  Main Application Controller
// Initialises all modules and wires up tool-mode element creation.
// ─────────────────────────────────────────────────────────────────────────────
RF.App = {

  init() {
    // 1. Initialize history first (before any mutations)
    RF.History.clear();

    // 2. Render toolbar (requires DOM)
    RF.Toolbar.init();

    // 3. Render sections + canvas
    const surface = document.getElementById('canvas-surface');
    if (surface) RF.Sections.render(surface);

    // 4. Init canvas (grid, rulers, guides, zoom/pan)
    RF.Canvas.init();

    // 5. Init panels
    RF.FieldExplorer.init();
    RF.PropertyInspector.init();

    // 6. Keyboard shortcuts
    RF.Keyboard.init();

    // 7. Tool-mode element creation (click on section body)
    this._attachToolCreation();

    // 8. Drag-from-explorer drop zones
    this._attachDropZones();

    // 9. React to full layout changes (undo/redo)
    RF.EventBus.on('layout:changed', () => {
      // Sync elements that exist already vs DOM
      // (Full re-render happens explicitly on undo/redo)
    });

    // 10. Status bar
    RF.EventBus.on('status', msg => {
      const sb = document.getElementById('statusbar-msg');
      if (sb) sb.textContent = msg;
    });

    // 11. Coord display on mouse move
    document.getElementById('canvas-surface')?.addEventListener('mousemove', e => {
      const pt = RF.Utils.canvasPoint(e, RF.AppState);
      const coord = document.getElementById('statusbar-coord');
      if (coord) coord.textContent = `X:${Math.round(pt.x)}  Y:${Math.round(pt.y)}`;
    });

    // Initial snapshot
    RF.History.snapshot('init');
    RF.EventBus.emit('status', 'ReportForge Designer ready');
  },

  // ── Tool-mode creation (click on section body to insert element) ──────────
  _attachToolCreation() {
    document.getElementById('canvas-surface')?.addEventListener('mousedown', e => {
      const tool = RF.AppState.activeTool;
      if (tool === 'select') return;
      if (e.button !== 0) return;

      const secBody = e.target.closest('.rf-sec-body');
      if (!secBody) return;
      if (e.target.classList.contains('rf-element')) return;

      e.preventDefault(); e.stopPropagation();

      const sectionId = secBody.dataset.secid;
      const canPt     = RF.Utils.canvasPoint(e, RF.AppState);
      const bRect     = secBody.getBoundingClientRect();
      const sRect     = document.getElementById('canvas-surface').getBoundingClientRect();
      const bx        = (bRect.left - sRect.left) / RF.AppState.zoom;
      const by        = (bRect.top  - sRect.top)  / RF.AppState.zoom;
      const lx        = RF.Utils.clamp(canPt.x - bx, 0, RF.AppState.layout.pageWidth - 40);
      const ly        = RF.Utils.clamp(canPt.y - by, 0, (RF.AppState.getSectionById(sectionId)?.height||40) - 4);
      const snapped   = RF.Snap.snapPoint(lx, ly);

      // Start drag-to-size
      this._dragCreate(e, tool, sectionId, snapped.x, snapped.y, bx, by);
    });
  },

  _dragCreate(startEv, type, sectionId, startX, startY, bx, by) {
    const defs = RF.ElementDefaults[type] || {};
    let   el   = null;
    let   div  = null;

    const onMove = e => {
      const canPt = RF.Utils.canvasPoint(e, RF.AppState);
      const lx    = canPt.x - bx;
      const ly    = canPt.y - by;
      const w     = Math.max(8, Math.abs(lx - startX));
      const h     = Math.max(4, Math.abs(ly - startY));
      const nx    = Math.min(lx, startX);
      const ny    = Math.min(ly, startY);

      if (!el) {
        RF.History.snapshot('before-create');
        el  = RF.ElementFactory.create(type, sectionId, nx, ny, { w, h });
        if (!el) return;
        div = RF.ElementFactory.renderDOM(el);
        document.getElementById(`secbody-${sectionId}`)?.appendChild(div);
        RF.Sections._attachElementEvents(div);
      } else {
        el.x = Math.round(RF.Utils.clamp(nx, 0, RF.AppState.layout.pageWidth - 8));
        el.y = Math.round(Math.max(0, ny));
        el.w = Math.round(w);
        el.h = Math.round(h);
        RF.ElementFactory.applyStyle(div, el);
      }
    };

    const onUp = e => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
      if (!el) {
        // Just a click — create with default size
        RF.History.snapshot('before-create');
        el = RF.ElementFactory.create(type, sectionId, startX, startY, {});
        if (!el) return;
        RF.Sections.attachNewElement(el);
      } else {
        RF.Selection.select(el.id);
      }
      RF.Toolbar.setTool('select', document.querySelector('[data-tool="select"]'));
      RF.AppState.isDirty = true;
      RF.EventBus.emit('layout:changed');
      RF.EventBus.emit('status', `Created ${type}: ${el.id}`);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  },

  // ── Drop zones (field explorer → canvas) ─────────────────────────────────
  _attachDropZones() {
    // Re-attach whenever layout is re-rendered
    const attach = () => {
      document.querySelectorAll('.rf-sec-body').forEach(body => {
        body.addEventListener('dragover',  e => e.preventDefault());
        body.addEventListener('drop',      e => RF.FieldExplorer.handleDrop(e, body.dataset.secid));
      });
    };

    attach();
    RF.EventBus.on('layout:changed', attach);
  },

  // ── Preview (calls existing RF API) ──────────────────────────────────────
  openPreview() {
    const layout  = RF.clone(RF.AppState.layout);
    const payload = { layout, data: {items:[], empresa:{razon_social:'Preview Corp'}} };

    // Open preview window
    const win = window.open('', '_blank',
      'width=900,height=700,menubar=no,toolbar=no');
    win.document.write(`<!DOCTYPE html><html><head><title>Preview</title>
      <style>body{margin:0;background:#555;display:flex;justify-content:center;padding:20px}
        iframe{border:none;box-shadow:0 4px 20px rgba(0,0,0,.4)}</style></head>
      <body><div id="loading" style="color:#fff;padding:40px;font-family:sans-serif">
        ⏳ Rendering preview…</div>
      <script>
        fetch('/designer-preview', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify(${JSON.stringify(payload)})
        })
        .then(r=>r.text())
        .then(html=>{
          document.body.innerHTML='';
          const iframe=document.createElement('iframe');
          iframe.style.cssText='width:800px;height:650px;border:none;';
          document.body.appendChild(iframe);
          iframe.contentDocument.open();
          iframe.contentDocument.write(html);
          iframe.contentDocument.close();
        })
        .catch(err=>{
          document.getElementById('loading').textContent='Preview error: '+err.message;
        });
      <\/script></body></html>`);
    win.document.close();
  },
};

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => RF.App.init());
