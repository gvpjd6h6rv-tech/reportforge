// ─────────────────────────────────────────────────────────────────────────────
// interaction/drag.js  –  Drag elements  (feature 8)
// interaction/resize.js – Resize elements  (feature 9)
// ─────────────────────────────────────────────────────────────────────────────

RF.Drag = {
  _active:    false,
  _startX:    0,
  _startY:    0,
  _startPositions: null,  // { id: {x,y} }

  startDrag(e, elId) {
    e.preventDefault();
    e.stopPropagation();

    const s      = RF.AppState;
    const canPt  = RF.Utils.canvasPoint(e, s);

    // If clicking an unselected element, select it first
    if (!s.selectedIds.has(elId)) {
      RF.Selection.select(elId, e.ctrlKey || e.metaKey || e.shiftKey);
    }

    this._active = true;
    this._startX = canPt.x;
    this._startY = canPt.y;

    // Remember starting positions of all selected elements
    this._startPositions = {};
    s.selectedIds.forEach(id => {
      const el = s.getElementById(id);
      if (el) this._startPositions[id] = { x: el.x, y: el.y };
    });

    RF.History.snapshot('before-move');

    const onMove = ev => this._onMove(ev);
    const onUp   = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._onEnd(ev);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  },

  _onMove(e) {
    if (!this._active) return;
    const s     = RF.AppState;
    const canPt = RF.Utils.canvasPoint(e, s);
    const dx    = canPt.x - this._startX;
    const dy    = canPt.y - this._startY;

    s.selectedIds.forEach(id => {
      const el    = s.getElementById(id);
      const start = this._startPositions[id];
      if (!el || !start) return;

      // Get section bounds to clamp
      const sec   = s.getSectionById(el.sectionId);
      const snapped = RF.Snap.snapElement(start.x + dx, start.y + dy, el.w, el.h, id);

      el.x = RF.Utils.clamp(snapped.x, 0, s.layout.pageWidth - el.w);
      el.y = RF.Utils.clamp(snapped.y, 0, (sec?.height ?? 200) - el.h);

      // Update DOM immediately for smooth feedback
      const div = document.getElementById(`el-${id}`);
      if (div) { div.style.left = el.x + 'px'; div.style.top = el.y + 'px'; }
    });

    RF.SelectionHandles.sync();
    RF.EventBus.emit('element:moved');
    RF.EventBus.emit('inspector:refresh');
  },

  _onEnd(_e) {
    this._active = false;
    RF.Snap._clearGuides();
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('status',
      `Moved ${RF.AppState.selectedIds.size} element(s)`);
  },
};

// ── Resize ────────────────────────────────────────────────────────────────────
RF.Resize = {
  _active:  false,
  _handle:  null,
  _elId:    null,
  _startX:  0,
  _startY:  0,
  _origEl:  null,   // {x,y,w,h}

  startResize(e, handle, elId) {
    e.preventDefault();
    e.stopPropagation();

    this._active  = true;
    this._handle  = handle;
    this._elId    = elId;
    const el      = RF.AppState.getElementById(elId);
    if (!el) return;
    this._origEl  = { x:el.x, y:el.y, w:el.w, h:el.h };

    const canPt   = RF.Utils.canvasPoint(e, RF.AppState);
    this._startX  = canPt.x;
    this._startY  = canPt.y;

    RF.History.snapshot('before-resize');

    const onMove = ev => this._onMove(ev);
    const onUp   = ev => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this._onEnd();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  _onMove(e) {
    if (!this._active) return;
    const s     = RF.AppState;
    const canPt = RF.Utils.canvasPoint(e, s);
    const dx    = canPt.x - this._startX;
    const dy    = canPt.y - this._startY;
    const o     = this._origEl;
    const el    = s.getElementById(this._elId);
    if (!el) return;

    const MIN = 4;
    const h   = this._handle;

    let { x, y, w, width } = { x:o.x, y:o.y, w:o.w, h:o.h };
    let nx=o.x, ny=o.y, nw=o.w, nh=o.h;

    if (h.includes('r'))  nw = Math.max(MIN, o.w + dx);
    if (h.includes('l')) { nx = Math.min(o.x+o.w-MIN, o.x+dx); nw = o.w-dx; }
    if (h.includes('b'))  nh = Math.max(MIN, o.h + dy);
    if (h.includes('t')) { ny = Math.min(o.y+o.h-MIN, o.y+dy); nh = o.h-dy; }
    // tc/bc
    if (h === 'tc') { ny = Math.min(o.y+o.h-MIN, o.y+dy); nh = o.h-dy; }
    if (h === 'bc')   nh = Math.max(MIN, o.h+dy);

    // Snap
    const snapped = RF.Snap.snapPoint(nx, ny, this._elId);
    nx = snapped.x; ny = snapped.y;

    // Clamp to page width
    nw = RF.Utils.clamp(nw, MIN, s.layout.pageWidth - nx);
    nh = Math.max(MIN, nh);

    el.x = Math.round(nx);
    el.y = Math.round(ny);
    el.w = Math.round(nw);
    el.h = Math.round(nh);

    const div = document.getElementById(`el-${el.id}`);
    if (div) {
      div.style.left   = el.x + 'px';
      div.style.top    = el.y + 'px';
      div.style.width  = el.w + 'px';
      div.style.height = el.h + 'px';
    }
    RF.SelectionHandles.sync();
    RF.EventBus.emit('inspector:refresh');
  },

  _onEnd() {
    this._active = false;
    RF.AppState.isDirty = true;
    RF.EventBus.emit('layout:changed');
    RF.EventBus.emit('status', 'Resized element');
  },
};
