// ─────────────────────────────────────────────────────────────────────────────
// canvas/canvas.js  –  Canvas: grid, rulers, zoom, pan, guides, marquee
//                      Features 1–7, 10
// ─────────────────────────────────────────────────────────────────────────────
RF.Canvas = {

  _scrollEl:   null,
  _surfaceEl:  null,
  _rulerH:     null,
  _rulerV:     null,
  _guideLayer: null,
  _marquee:    null,
  _snapGuides: null,

  // Marquee state
  _mq: { active:false, startX:0, startY:0, sectionId:null },

  init() {
    this._scrollEl   = document.getElementById('canvas-scroll');
    this._surfaceEl  = document.getElementById('canvas-surface');
    this._rulerH     = document.getElementById('ruler-h');
    this._rulerV     = document.getElementById('ruler-v');

    if (!this._surfaceEl) return;

    // Guide layer
    this._guideLayer = document.createElement('div');
    this._guideLayer.id = 'guide-layer';
    this._guideLayer.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5000;';
    this._surfaceEl.appendChild(this._guideLayer);

    // Snap guide layer
    this._snapGuides = document.createElement('div');
    this._snapGuides.id = 'snap-guides';
    this._snapGuides.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5001;';
    this._surfaceEl.appendChild(this._snapGuides);

    // Marquee
    this._marquee = document.createElement('div');
    this._marquee.id = 'marquee';
    this._marquee.style.cssText = `
      position:absolute;display:none;
      border:1px solid #1A6FFF;background:rgba(26,111,255,.06);
      pointer-events:none;z-index:9000;
    `;
    this._surfaceEl.appendChild(this._marquee);

    this._attachEvents();
    this._applyZoomPan();
    this.drawGrid();
    this.drawRulers();
    this.renderGuides();

    // Subscribe to events
    RF.EventBus
      .on('layout:changed',   () => { this.drawGrid(); this.drawRulers(); this.renderGuides(); })
      .on('snap:guides',       g  => this._renderSnapGuides(g))
      .on('zoom:changed',      () => { this._applyZoomPan(); this.drawRulers(); })
      .on('guides:changed',    () => this.renderGuides())
      .on('selection:changed', () => RF.Selection.syncDOM());
  },

  // ── Zoom / Pan (features 1–2) ─────────────────────────────────────────────

  setZoom(z, cx, cy) {
    const s     = RF.AppState;
    const old   = s.zoom;
    s.zoom      = RF.Utils.clamp(z, 0.25, 4.0);
    // Adjust pan so zoom feels centered on the mouse
    if (cx !== undefined) {
      s.panX = cx - (cx - s.panX) * (s.zoom / old);
      s.panY = cy - (cy - s.panY) * (s.zoom / old);
    }
    this._applyZoomPan();
    this.drawRulers();
    RF.EventBus.emit('status', `Zoom: ${Math.round(s.zoom * 100)}%`);
  },

  _applyZoomPan() {
    const s = RF.AppState;
    if (!this._surfaceEl) return;
    this._surfaceEl.style.transform       = `scale(${s.zoom})`;
    this._surfaceEl.style.transformOrigin = '0 0';
    this._surfaceEl.style.marginLeft      = s.panX + 'px';
    this._surfaceEl.style.marginTop       = s.panY + 'px';
  },

  // ── Grid (features 3) ─────────────────────────────────────────────────────

  drawGrid() {
    const s = RF.AppState;
    if (!s.showGrid) {
      this._surfaceEl.style.backgroundImage = 'none';
      return;
    }
    const g  = s.gridSize;
    const sz = g * s.zoom;
    // SVG dot grid
    const dot = `
      <svg xmlns='http://www.w3.org/2000/svg' width='${sz}' height='${sz}'>
        <circle cx='${sz/2}' cy='${sz/2}' r='0.7' fill='%23B0B8C8'/>
      </svg>`;
    this._surfaceEl.style.backgroundImage  =
      `url("data:image/svg+xml,${dot.trim().replace(/\s+/g,' ')}") `;
    this._surfaceEl.style.backgroundSize   = `${sz}px ${sz}px`;
    this._surfaceEl.style.backgroundPosition = `${s.panX % sz}px ${s.panY % sz}px`;
  },

  // ── Rulers (feature 6) ────────────────────────────────────────────────────

  drawRulers() {
    if (!RF.AppState.showRulers) return;
    const s   = RF.AppState;
    const z   = s.zoom;
    const pw  = s.layout.pageWidth;

    // Horizontal ruler
    const rh = this._rulerH;
    if (rh) {
      const canvas = this._getOrCreateRulerCanvas(rh, rh.offsetWidth || 800, 20);
      this._drawHRuler(canvas, z, s.panX);
    }
    // Vertical ruler
    const rv = this._rulerV;
    if (rv) {
      const canvas = this._getOrCreateRulerCanvas(rv, 20, rv.offsetHeight || 600);
      this._drawVRuler(canvas, z, s.panY);
    }
  },

  _getOrCreateRulerCanvas(el, w, h) {
    let c = el.querySelector('canvas');
    if (!c) {
      c = document.createElement('canvas');
      el.appendChild(c);
    }
    c.width  = el.offsetWidth  || w;
    c.height = el.offsetHeight || h;
    return c;
  },

  _drawHRuler(canvas, zoom, panX) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle   = '#1C2038';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle   = '#8892A4';
    ctx.font        = '9px Arial';
    ctx.textAlign   = 'left';

    const step = this._rulerStep(zoom);
    const offX = panX;
    for (let px = 0; px * zoom + offX < W; px += step) {
      const sx = Math.round(px * zoom + offX);
      if (sx < 0) continue;
      const isMajor = px % (step * 5) === 0;
      ctx.strokeStyle = isMajor ? '#5A6280' : '#3A4060';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, H);
      ctx.lineTo(sx + 0.5, isMajor ? 0 : H - 5);
      ctx.stroke();
      if (isMajor && sx > 2) ctx.fillText(px, sx + 2, 10);
    }
  },

  _drawVRuler(canvas, zoom, panY) {
    const ctx = canvas.getContext('2d');
    const W   = canvas.width, H = canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle = '#1C2038';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#8892A4';
    ctx.font      = '9px Arial';
    ctx.save();
    ctx.translate(W/2, 0);
    ctx.rotate(-Math.PI/2);

    const step = this._rulerStep(zoom);
    for (let py = 0; py * zoom + panY < H; py += step) {
      const sy = Math.round(py * zoom + panY);
      if (sy < 0) continue;
      const isMajor = py % (step * 5) === 0;
      ctx.strokeStyle = isMajor ? '#5A6280' : '#3A4060';
      ctx.lineWidth   = 1;
      const ox = -sy;
      ctx.beginPath(); ctx.moveTo(ox + .5, 0); ctx.lineTo(ox + .5, isMajor ? W : W-4); ctx.stroke();
      if (isMajor && sy > 10) ctx.fillText(py, ox+2, 8);
    }
    ctx.restore();
  },

  _rulerStep(z) {
    if (z >= 2)   return 10;
    if (z >= 1)   return 20;
    if (z >= 0.5) return 50;
    return 100;
  },

  // ── Guides (feature 7) ────────────────────────────────────────────────────

  renderGuides() {
    if (!this._guideLayer) return;
    this._guideLayer.innerHTML = '';
    RF.AppState.guides.forEach(g => {
      const d = document.createElement('div');
      const s = RF.AppState;
      if (g.orientation === 'h') {
        d.style.cssText = `position:absolute;left:0;top:${g.position}px;
          width:100%;height:1px;background:rgba(0,180,255,.6);cursor:ns-resize;pointer-events:all;`;
      } else {
        d.style.cssText = `position:absolute;top:0;left:${g.position}px;
          height:100%;width:1px;background:rgba(0,180,255,.6);cursor:ew-resize;pointer-events:all;`;
      }
      d.dataset.guideid = g.id;
      d.addEventListener('mousedown', ev => this._startGuideDrag(ev, g));
      d.addEventListener('dblclick',  ()  => this._deleteGuide(g.id));
      this._guideLayer.appendChild(d);
    });
  },

  addGuide(orientation, position) {
    RF.AppState.guides.push({ id: RF.uid('g'), orientation, position });
    this.renderGuides();
  },

  _startGuideDrag(e, guide) {
    e.preventDefault(); e.stopPropagation();
    const onMove = ev => {
      const canPt = RF.Utils.canvasPoint(ev, RF.AppState);
      guide.position = Math.round(guide.orientation === 'h' ? canPt.y : canPt.x);
      this.renderGuides();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  },

  _deleteGuide(id) {
    RF.AppState.guides = RF.AppState.guides.filter(g => g.id !== id);
    this.renderGuides();
  },

  _renderSnapGuides(guides) {
    if (!this._snapGuides) return;
    this._snapGuides.innerHTML = '';
    (guides||[]).forEach(g => {
      const d = document.createElement('div');
      d.style.cssText = g.o === 'h'
        ? `position:absolute;left:0;top:${g.p}px;width:100%;height:1px;background:rgba(255,100,0,.7);`
        : `position:absolute;top:0;left:${g.p}px;height:100%;width:1px;background:rgba(255,100,0,.7);`;
      this._snapGuides.appendChild(d);
    });
    // Auto-clear after 800ms
    clearTimeout(this._sgTimer);
    this._sgTimer = setTimeout(() => { if (this._snapGuides) this._snapGuides.innerHTML=''; }, 800);
  },

  // ── Section body events (marquee + guide creation from ruler) ─────────────

  _attachEvents() {
    const scroll = this._scrollEl;
    if (!scroll) return;

    // Zoom via Ctrl+scroll (feature 1)
    scroll.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = scroll.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      this.setZoom(RF.AppState.zoom * (e.deltaY < 0 ? 1.1 : 0.9), cx, cy);
    }, { passive:false });

    // Pan via middle mouse (feature 2)
    scroll.addEventListener('mousedown', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY;
      const px = RF.AppState.panX, py = RF.AppState.panY;
      const onMove = ev => {
        RF.AppState.panX = px + (ev.clientX - sx);
        RF.AppState.panY = py + (ev.clientY - sy);
        this._applyZoomPan();
        this.drawGrid();
        this.drawRulers();
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Guide creation from ruler drag
    this._rulerH && this._rulerH.addEventListener('mousedown', e => {
      e.preventDefault();
      const startY = e.clientY;
      const guide  = { id: RF.uid('g'), orientation:'h', position: 0 };
      RF.AppState.guides.push(guide);
      const onMove = ev => {
        const canPt = RF.Utils.canvasPoint(ev, RF.AppState);
        guide.position = Math.round(canPt.y);
        this.renderGuides();
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    this._rulerV && this._rulerV.addEventListener('mousedown', e => {
      e.preventDefault();
      const guide  = { id: RF.uid('g'), orientation:'v', position: 0 };
      RF.AppState.guides.push(guide);
      const onMove = ev => {
        const canPt = RF.Utils.canvasPoint(ev, RF.AppState);
        guide.position = Math.round(canPt.x);
        this.renderGuides();
      };
      const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    // Attach marquee + click-to-deselect on section bodies
    this._surfaceEl.addEventListener('mousedown', e => this._onSurfaceMouseDown(e));
    this._surfaceEl.addEventListener('mousemove', e => this._onSurfaceMouseMove(e));
    this._surfaceEl.addEventListener('mouseup',   e => this._onSurfaceMouseUp(e));

    // Handle clicks on resize handles
    this._surfaceEl.addEventListener('mousedown', e => {
      if (e.target.dataset.handle) {
        const info = RF.SelectionHandles.getHandleInfo(e.target);
        RF.Resize.startResize(e, info.handle, info.elId);
      }
    });
  },

  // ── Marquee selection (feature 13) ────────────────────────────────────────
  _onSurfaceMouseDown(e) {
    if (e.button !== 0) return;
    // Only start marquee if clicking on a section body (not an element)
    const secBody = e.target.closest('.rf-sec-body');
    if (!secBody) return;
    if (e.target.classList.contains('rf-element')) return;
    if (e.target.dataset.handle) return;

    e.preventDefault();
    const canPt = RF.Utils.canvasPoint(e, RF.AppState);
    this._mq = { active:true, startX:canPt.x, startY:canPt.y, sectionId: secBody.dataset.secid };

    this._marquee.style.display = 'block';
    this._marquee.style.left    = canPt.x + 'px';
    this._marquee.style.top     = canPt.y + 'px';
    this._marquee.style.width   = '0px';
    this._marquee.style.height  = '0px';
  },

  _onSurfaceMouseMove(e) {
    if (!this._mq.active) return;
    const canPt = RF.Utils.canvasPoint(e, RF.AppState);
    const rx = Math.min(canPt.x, this._mq.startX);
    const ry = Math.min(canPt.y, this._mq.startY);
    const rw = Math.abs(canPt.x - this._mq.startX);
    const rh = Math.abs(canPt.y - this._mq.startY);
    this._marquee.style.left   = rx + 'px';
    this._marquee.style.top    = ry + 'px';
    this._marquee.style.width  = rw + 'px';
    this._marquee.style.height = rh + 'px';
  },

  _onSurfaceMouseUp(e) {
    if (!this._mq.active) return;
    this._mq.active = false;
    this._marquee.style.display = 'none';

    const canPt = RF.Utils.canvasPoint(e, RF.AppState);
    const rx = Math.min(canPt.x, this._mq.startX);
    const ry = Math.min(canPt.y, this._mq.startY);
    const rw = Math.abs(canPt.x - this._mq.startX);
    const rh = Math.abs(canPt.y - this._mq.startY);

    if (rw > 3 && rh > 3) {
      // Compute rect relative to section body
      const sec    = RF.AppState.getSectionById(this._mq.sectionId);
      const secEl  = document.getElementById(`secbody-${this._mq.sectionId}`);
      if (secEl && sec) {
        const bRect = secEl.getBoundingClientRect();
        const sRect = this._surfaceEl.getBoundingClientRect();
        const ox    = (bRect.left - sRect.left) / RF.AppState.zoom;
        const oy    = (bRect.top  - sRect.top)  / RF.AppState.zoom;
        RF.Selection.selectByRect(rx - ox, ry - oy, rw, rh, this._mq.sectionId);
      }
    } else {
      // Click on empty area → deselect
      RF.Selection.clear();
    }
  },
};
