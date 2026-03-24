import RF from '../rf.js';

/**
 * ux/drag-tools.js — RF.UX.DragTools
 * Layer   : UX
 * Purpose : Mouse event handlers for element move and resize. Includes the
 *           v4 aspect-ratio-locked resize (Shift key) and live preview outline.
 * Deps    : RF.Core.DocumentModel, RF.UX.Snapping
 */

RF.UX.DragTools = {

  // ── Drag elements ─────────────────────────────────────────────────────────
  startDrag(e, elId) {
    e.preventDefault(); e.stopPropagation();
    const DM     = RF.Core.DocumentModel;
    const el     = DM.getElementById(elId);
    if (!el || el.locked) return;

    // Format painter intercept
    if (RF.UX.FormatPainter.isActive) {
      RF.UX.FormatPainter.apply(elId);
      return;
    }

    const canPt  = RF.Geometry.clientToCanvas(e);
    if (!DM.selectedIds.has(elId)) RF.Sel.select(elId, e.ctrlKey||e.metaKey||e.shiftKey);

    // Alt-drag: duplicate first
    const isAltDup = e.altKey;
    if (isAltDup) {
      RF.H.snapshot('before-alt-dup');
      const newIds = DM.duplicateElements([...DM.selectedIds]);
      RF.RP.reconcile();
    }

    RF.H.snapshot('before-move');
    const startPositions = {};
    DM.selectedIds.forEach(id => {
      const el2 = DM.getElementById(id);
      if (el2) startPositions[id] = {x:el2.x, y:el2.y};
    });
    const sx = canPt.x, sy = canPt.y;

    const onMove = ev => {
      const pt  = RF.Geometry.clientToCanvas(ev);
      const dx  = pt.x - sx, dy = pt.y - sy;

      DM.selectedIds.forEach(id => {
        const el2  = DM.getElementById(id);
        const orig = startPositions[id];
        const sec  = el2 && DM.getSectionById(el2.sectionId);
        if (!el2 || !orig || !sec) return;
        const snapped = RF.UX.Snapping.snapElement(orig.x+dx, orig.y+dy, el2.w, el2.h, id);
        el2.x = RF.clamp(snapped.x, 0, DM.layout.pageWidth - el2.w);
        el2.y = RF.clamp(snapped.y, 0, sec.height - el2.h);
        const div = document.getElementById(`el-${id}`);
        if (div) { div.style.left = el2.x+'px'; div.style.top = el2.y+'px'; }
      });
      RF.Sel.syncDOM();
      if (DM.showDistances) this._renderDistances(DM.getElementById([...DM.selectedIds][0]));
      RF.emit(RF.E.INSPECTOR_REFRESH);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      RF.UX.Snapping.clearGuides();
      this._clearDistances();
      DM.isDirty = true;
      RF.emit(RF.E.LAYOUT_CHANGED);
      RF.emit(RF.E.STATUS, `Moved ${DM.selectedIds.size} element(s)`);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  },

  // ── Resize ────────────────────────────────────────────────────────────────
  startResize(e, handle, elId) {
    e.preventDefault(); e.stopPropagation();
    const DM   = RF.Core.DocumentModel;
    const el   = DM.getElementById(elId);
    if (!el) return;
    const aspectRatio = el.w / el.h;
    const body = RF.DOM.sectionBody(el.sectionId);
    let preview = null;
    if (body) {
      preview = document.createElement('div');
      preview.className = 'resize-preview';
      preview.style.cssText = `left:${el.x}px;top:${el.y}px;width:${el.w}px;height:${el.h}px`;
      body.appendChild(preview);
    }
    RF.H.snapshot('before-resize');
    const orig = {x:el.x,y:el.y,w:el.w,h:el.h};
    const startPoint = RF.Geometry.clientToCanvas(e);
    const sx   = startPoint.x;
    const sy   = startPoint.y;
    const MIN  = 4;

    const onMove = ev => {
      const pt  = RF.Geometry.clientToCanvas(ev);
      const dx  = pt.x-sx, dy = pt.y-sy;
      let {x:nx,y:ny,w:nw,h:nh} = orig;
      if (handle.includes('r'))  nw = Math.max(MIN, orig.w+dx);
      if (handle.includes('l')) { nx = Math.min(orig.x+orig.w-MIN, orig.x+dx); nw = orig.w-dx; }
      if (handle.includes('b'))  nh = Math.max(MIN, orig.h+dy);
      if (handle.includes('t')) { ny = Math.min(orig.y+orig.h-MIN, orig.y+dy); nh = orig.h-dy; }
      if (handle==='tc') { ny=Math.min(orig.y+orig.h-MIN,orig.y+dy); nh=orig.h-dy; }
      if (handle==='bc') nh=Math.max(MIN,orig.h+dy);
      if (ev.shiftKey && (handle === 'br' || handle === 'tr' || handle === 'bl' || handle === 'tl')) {
        if (Math.abs(dx) > Math.abs(dy)) nh = Math.round(nw / aspectRatio);
        else nw = Math.round(nh * aspectRatio);
      }
      if (preview) {
        preview.style.left = `${Math.round(nx)}px`;
        preview.style.top = `${Math.round(ny)}px`;
        preview.style.width = `${Math.max(MIN, Math.round(nw))}px`;
        preview.style.height = `${Math.max(MIN, Math.round(nh))}px`;
      }
      const snp = RF.UX.Snapping.snapPoint(nx,ny,elId);
      DM.resizeElement(elId, {x:snp.x,y:snp.y,w:Math.min(nw,DM.layout.pageWidth-snp.x),h:Math.max(MIN,nh)});
      const div = document.getElementById(`el-${elId}`);
      if (div) { div.style.left=el.x+'px'; div.style.top=el.y+'px'; div.style.width=el.w+'px'; div.style.height=el.h+'px'; }
      RF.Sel.syncDOM();
    };
    const onUp = () => {
      document.removeEventListener('pointermove',onMove);
      document.removeEventListener('pointerup',onUp);
      preview?.remove();
      DM.isDirty=true;
      RF.emit(RF.E.LAYOUT_CHANGED);
      RF.emit(RF.E.STATUS,`Resized: ${el.w}×${el.h}`);
    };
    document.addEventListener('pointermove',onMove);
    document.addEventListener('pointerup',onUp);
  },

  // ── Distance indicators ───────────────────────────────────────────────────
  _distLayer: null,

  _renderDistances(el) {
    if (!el) return;
    if (!this._distLayer) {
      this._distLayer = document.createElement('div');
      this._distLayer.id = 'dist-layer';
      this._distLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:9600;';
      document.getElementById('canvas-surface')?.appendChild(this._distLayer);
    }
    RF.clear(this._distLayer);
    const others = RF.Core.DocumentModel.layout.elements
      .filter(o => o.sectionId===el.sectionId && o.id!==el.id);
    if (!others.length) return;
    // Nearest on each side
    const right  = others.filter(o=>o.x>el.x+el.w).sort((a,b)=>a.x-b.x)[0];
    const bottom = others.filter(o=>o.y>el.y+el.h).sort((a,b)=>a.y-b.y)[0];
    if (right) {
      const dist = right.x - (el.x+el.w);
      this._addDistLine('h', el.x+el.w, el.y+el.h/2, dist, dist+'px');
    }
    if (bottom) {
      const dist = bottom.y - (el.y+el.h);
      this._addDistLine('v', el.x+el.w/2, el.y+el.h, dist, dist+'px');
    }
  },

  _addDistLine(dir, x, y, len, label) {
    const d = document.createElement('div');
    d.className = 'dist-line ' + dir;
    if (dir==='h') { d.style.left=x+'px'; d.style.top=y+'px'; d.style.width=len+'px'; }
    else           { d.style.left=x+'px'; d.style.top=y+'px'; d.style.height=len+'px'; }
    const lbl = document.createElement('div');
    lbl.className = 'dist-label';
    lbl.textContent = label;
    lbl.style.cssText = dir==='h' ? 'top:-14px;left:50%;transform:translateX(-50%)' : 'left:4px;top:50%;transform:translateY(-50%)';
    d.appendChild(lbl);
    this._distLayer.appendChild(d);
  },

  _clearDistances() {
    if (this._distLayer) RF.clear(this._distLayer);
  },

  // ── Keyboard move ─────────────────────────────────────────────────────────
  keyMove(dx, dy) {
    const DM = RF.Core.DocumentModel;
    const moved = DM.selectedElements.filter(el=>!el.locked);
    if (!moved.length) return;
    RF.H.snapshot('before-arrow');
    moved.forEach(el => {
      const sec = DM.getSectionById(el.sectionId);
      el.x = RF.clamp(el.x+dx, 0, DM.layout.pageWidth-el.w);
      el.y = RF.clamp(el.y+dy, 0, (sec?.height||200)-el.h);
      const div = document.getElementById(`el-${el.id}`);
      if (div) { div.style.left=el.x+'px'; div.style.top=el.y+'px'; }
    });
    RF.Sel.syncDOM();
    DM.isDirty = true;
    RF.emit(RF.E.INSPECTOR_REFRESH);
  },

  _canvasPt(e) { return RF.Geometry.clientToCanvas(e); },
};
