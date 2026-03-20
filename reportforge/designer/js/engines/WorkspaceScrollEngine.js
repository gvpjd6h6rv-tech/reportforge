import RF from '../rf.js';

RF.Engines.WorkspaceScrollEngine = {
  WRITES: Object.freeze(['#canvas-surface.transform', '#canvas-surface.marginLeft', '#canvas-surface.marginTop']),
  _scroll: null,
  _surface: null,
  _rulerH: null,
  _rulerV: null,
  _marquee: null,
  _mq: { active: false },

  init() {
    this._scroll = RF.DOM.viewport();
    this._surface = RF.DOM.canvasLayer();
    this._rulerH = RF.DOM.rulerH();
    this._rulerV = RF.DOM.rulerV();
    if (!this._surface) return;

    this._ensureMarquee();
    this._attachEvents();
    RF.Engines.CanvasLayoutEngine.sync();
    this.syncViewport();
    this.drawGrid();
    this.drawRulers();

    RF.on(RF.E.ZOOM_CHANGED, () => {
      this.syncViewport();
      this.drawRulers();
    });
    RF.on(RF.E.SEL_CHANGED, () => RF.Core.SelectionSystem.syncDOM());
  },

  setZoom(z, cx, cy) {
    const DM = RF.Core.DocumentModel;
    const old = DM.zoom;
    DM.zoom = RF.clamp(z, 0.2, 5.0);
    if (cx !== undefined && cy !== undefined) {
      DM.panX = cx - (cx - DM.panX) * (DM.zoom / old);
      DM.panY = cy - (cy - DM.panY) * (DM.zoom / old);
    }
    this.syncViewport();
    this.drawRulers();
    RF.emit(RF.E.ZOOM_CHANGED);
    RF.emit(RF.E.STATUS, `Zoom: ${Math.round(DM.zoom * 100)}%`);
  },

  syncViewport() {
    const DM = RF.Core.DocumentModel;
    if (!this._surface) return;
    this._surface.style.transform = `scale(${DM.zoom})`;
    this._surface.style.transformOrigin = '0 0';
    this._surface.style.marginLeft = `${DM.panX}px`;
    this._surface.style.marginTop = `${DM.panY}px`;
  },

  drawGrid() {
    const DM = RF.Core.DocumentModel;
    if (!this._surface) return;
    if (!DM.showGrid) {
      this._surface.style.backgroundImage = 'none';
      return;
    }
    const size = DM.gridSize * DM.zoom;
    const dot = `<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><circle cx='${size / 2}' cy='${size / 2}' r='0.6' fill='%23C8C8C8'/></svg>`;
    this._surface.style.backgroundImage = `url("data:image/svg+xml,${dot.replace(/\s+/g, ' ')}")`;
    this._surface.style.backgroundSize = `${size}px ${size}px`;
    this._surface.style.backgroundPosition = `${DM.panX % size}px ${DM.panY % size}px`;
  },

  drawRulers() {
    const DM = RF.Core.DocumentModel;
    if (!DM.showRulers) return;
    const rh = this._rulerH;
    if (rh) {
      const canvas = this._rulerCanvas(rh, rh.offsetWidth || 800, 18);
      this._drawHRuler(canvas, DM.zoom, DM.panX);
    }
    const rv = this._rulerV;
    if (rv) {
      const canvas = this._rulerCanvas(rv, 18, rv.offsetHeight || 600);
      this._drawVRuler(canvas, DM.zoom, DM.panY);
    }
  },

  _ensureMarquee() {
    this._marquee = RF.DOM.marquee();
    if (this._marquee || !this._surface) return;
    this._marquee = document.createElement('div');
    this._marquee.id = RF.DOM.IDS.marquee;
    this._surface.appendChild(this._marquee);
  },

  _rulerCanvas(host, defaultWidth, defaultHeight) {
    let canvas = host.querySelector('canvas');
    if (!canvas) {
      canvas = document.createElement('canvas');
      host.appendChild(canvas);
    }
    canvas.width = host.offsetWidth || defaultWidth;
    canvas.height = host.offsetHeight || defaultHeight;
    return canvas;
  },

  _drawHRuler(canvas, zoom, panX) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    const step = this._rulerStep(zoom);
    for (let px = 0; px * zoom + panX < width; px += step) {
      const sx = Math.round(px * zoom + panX);
      if (sx < 0) continue;
      const major = px % (step * 5) === 0;
      ctx.strokeStyle = major ? '#666666' : '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, height);
      ctx.lineTo(sx + 0.5, major ? 0 : height - 5);
      ctx.stroke();
      if (major && sx > 4) {
        ctx.fillStyle = '#444444';
        ctx.font = '9px Tahoma,sans-serif';
        ctx.fillText(px, sx + 2, 9);
      }
    }
  },

  _drawVRuler(canvas, zoom, panY) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, 0);
    ctx.rotate(-Math.PI / 2);
    const step = this._rulerStep(zoom);
    for (let py = 0; py * zoom + panY < height; py += step) {
      const sy = Math.round(py * zoom + panY);
      if (sy < 0) continue;
      const major = py % (step * 5) === 0;
      ctx.strokeStyle = major ? '#666666' : '#AAAAAA';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-sy + 0.5, 0);
      ctx.lineTo(-sy + 0.5, major ? width : width - 4);
      ctx.stroke();
      if (major && sy > 12) {
        ctx.fillStyle = '#444444';
        ctx.font = '9px Tahoma,sans-serif';
        ctx.fillText(py, -sy + 2, 8);
      }
    }
    ctx.restore();
  },

  _rulerStep(zoom) {
    if (zoom >= 3) return 5;
    if (zoom >= 1.5) return 10;
    if (zoom >= 0.8) return 20;
    if (zoom >= 0.4) return 50;
    return 100;
  },

  _attachEvents() {
    const scroll = this._scroll;
    if (!scroll || scroll.dataset.workspaceScrollBound === '1') return;
    scroll.dataset.workspaceScrollBound = '1';

    scroll.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const rect = scroll.getBoundingClientRect();
      this.setZoom(
        RF.Core.DocumentModel.zoom * (e.deltaY < 0 ? 1.12 : 0.89),
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    }, { passive: false });

    scroll.addEventListener('pointerdown', e => {
      if (e.button !== 1) return;
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPanX = RF.Core.DocumentModel.panX;
      const startPanY = RF.Core.DocumentModel.panY;
      const onMove = ev => {
        RF.Core.DocumentModel.panX = startPanX + (ev.clientX - startX);
        RF.Core.DocumentModel.panY = startPanY + (ev.clientY - startY);
        this.syncViewport();
        this.drawGrid();
        this.drawRulers();
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    this._rulerH?.addEventListener('pointerdown', e => {
      e.preventDefault();
      const guide = { id: RF.uid('g'), orientation: 'h', position: 0 };
      RF.Core.DocumentModel.guides.push(guide);
      const onMove = ev => {
        guide.position = Math.round(RF.Geometry.clientToCanvas(ev).y);
        RF.UX.Guides.render();
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    this._rulerV?.addEventListener('pointerdown', e => {
      e.preventDefault();
      const guide = { id: RF.uid('g'), orientation: 'v', position: 0 };
      RF.Core.DocumentModel.guides.push(guide);
      const onMove = ev => {
        guide.position = Math.round(RF.Geometry.clientToCanvas(ev).x);
        RF.UX.Guides.render();
      };
      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
      };
      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    });

    this._surface?.addEventListener('pointerdown', e => this._surfaceMouseDown(e));
    this._surface?.addEventListener('pointermove', e => this._surfaceMouseMove(e));
    this._surface?.addEventListener('pointerup', e => this._surfaceMouseUp(e));
    this._surface?.addEventListener('pointerdown', e => {
      if (!e.target.dataset.handle) return;
      RF.UX.DragTools.startResize(e, e.target.dataset.handle, e.target.dataset.elid);
    });
  },

  _surfaceMouseDown(e) {
    if (e.button !== 0) return;
    const sectionBody = e.target.closest('.rf-sec-body');
    if (!sectionBody) return;
    if (e.target.classList.contains('rf-el') || e.target.dataset.handle) return;
    if (RF.Core.DocumentModel.activeTool !== 'select') return;

    e.preventDefault();
    const point = RF.Geometry.clientToCanvas(e);
    this._mq = {
      active: true,
      startX: point.x,
      startY: point.y,
      sectionId: sectionBody.dataset.secid,
    };
    Object.assign(this._marquee.style, {
      display: 'block',
      left: `${point.x}px`,
      top: `${point.y}px`,
      width: '0px',
      height: '0px',
    });
  },

  _surfaceMouseMove(e) {
    if (!this._mq.active) return;
    const point = RF.Geometry.clientToCanvas(e);
    const left = Math.min(point.x, this._mq.startX);
    const top = Math.min(point.y, this._mq.startY);
    Object.assign(this._marquee.style, {
      left: `${left}px`,
      top: `${top}px`,
      width: `${Math.abs(point.x - this._mq.startX)}px`,
      height: `${Math.abs(point.y - this._mq.startY)}px`,
    });
  },

  _surfaceMouseUp(e) {
    if (!this._mq.active) return;
    this._mq.active = false;
    this._marquee.classList.add('u-hidden');
    this._marquee.style.display = 'none';

    const point = RF.Geometry.clientToCanvas(e);
    const width = Math.abs(point.x - this._mq.startX);
    const height = Math.abs(point.y - this._mq.startY);
    if (width > 4 && height > 4) {
      const sectionPoint = RF.Geometry.clientToSection(e, this._mq.sectionId);
      const startSection = RF.Geometry.canvasToSection(
        { x: this._mq.startX, y: this._mq.startY },
        this._mq.sectionId,
      );
      RF.Core.SelectionSystem.selectByRect(
        Math.min(sectionPoint.x, startSection.x),
        Math.min(sectionPoint.y, startSection.y),
        width,
        height,
        this._mq.sectionId,
      );
      return;
    }
    RF.Core.SelectionSystem.clear();
  },
};

RF.Classic.Canvas = RF.Engines.WorkspaceScrollEngine;

export default RF;
