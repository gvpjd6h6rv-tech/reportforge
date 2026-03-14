import RF from '../rf.js';

/**
 * classic/canvas.js — RF.Classic.Canvas
 * Layer   : Classic UI
 * Purpose : Canvas surface initialization: zoom, ruler canvases, section
 *           container mounting, coordinate transforms, and setZoom.
 * Deps    : RF.Core.DocumentModel, RF.UX.DragTools, RF.UX.Guides
 */

RF.Classic.Canvas = {
  _scroll: null, _surface: null, _rulerH: null, _rulerV: null,
  _marquee: null, _mq: { active:false },

  init() {
    this._scroll  = document.getElementById('canvas-scroll');
    this._surface = document.getElementById('canvas-surface');
    this._rulerH  = document.getElementById('ruler-h');
    this._rulerV  = document.getElementById('ruler-v');
    if (!this._surface) return;

    // Marquee element
    this._marquee = document.createElement('div');
    this._marquee.id = 'marquee';
    this._surface.appendChild(this._marquee);

    this._attachEvents();
    this._applyZoomPan();
    this.drawGrid();
    this.drawRulers();

    RF.on(RF.E.LAYOUT_CHANGED,  () => { this.drawGrid(); this.drawRulers(); });
    RF.on(RF.E.ZOOM_CHANGED,    () => { this._applyZoomPan(); this.drawRulers(); });
    RF.on(RF.E.SEL_CHANGED,     () => RF.Sel.syncDOM());
  },

  setZoom(z, cx, cy) {
    const DM  = RF.Core.DocumentModel;
    const old = DM.zoom;
    DM.zoom   = RF.clamp(z, 0.2, 5.0);
    if (cx !== undefined) {
      DM.panX = cx - (cx - DM.panX) * (DM.zoom/old);
      DM.panY = cy - (cy - DM.panY) * (DM.zoom/old);
    }
    this._applyZoomPan();
    this.drawRulers();
    RF.emit(RF.E.ZOOM_CHANGED);
    RF.emit(RF.E.STATUS, `Zoom: ${Math.round(DM.zoom*100)}%`);
  },

  _applyZoomPan() {
    const DM = RF.Core.DocumentModel;
    if (!this._surface) return;
    this._surface.style.transform       = `scale(${DM.zoom})`;
    this._surface.style.transformOrigin = '0 0';
    this._surface.style.marginLeft      = DM.panX+'px';
    this._surface.style.marginTop       = DM.panY+'px';
  },

  drawGrid() {
    const DM = RF.Core.DocumentModel;
    if (!DM.showGrid) { this._surface.style.backgroundImage='none'; return; }
    const g  = DM.gridSize;
    const sz = g * DM.zoom;
    const dot = `<svg xmlns='http://www.w3.org/2000/svg' width='${sz}' height='${sz}'><circle cx='${sz/2}' cy='${sz/2}' r='0.6' fill='%23C8C8C8'/></svg>`;
    this._surface.style.backgroundImage    = `url("data:image/svg+xml,${dot.replace(/\s+/g,' ')}")`;
    this._surface.style.backgroundSize     = `${sz}px ${sz}px`;
    this._surface.style.backgroundPosition = `${DM.panX%sz}px ${DM.panY%sz}px`;
  },

  drawRulers() {
    const DM = RF.Core.DocumentModel;
    if (!DM.showRulers) return;
    const z = DM.zoom;
    const rh = this._rulerH;
    if (rh) { const c=this._rulerCanvas(rh,rh.offsetWidth||800,18); this._drawHRuler(c,z,DM.panX); }
    const rv = this._rulerV;
    if (rv) { const c=this._rulerCanvas(rv,18,rv.offsetHeight||600); this._drawVRuler(c,z,DM.panY); }
  },

  _rulerCanvas(el, w, h) {
    let c = el.querySelector('canvas');
    if (!c) { c=document.createElement('canvas'); el.appendChild(c); }
    c.width=el.offsetWidth||w; c.height=el.offsetHeight||h;
    return c;
  },

  _drawHRuler(canvas, z, panX) {
    const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);
    const step=this._rulerStep(z);
    for (let px=0; px*z+panX<W; px+=step) {
      const sx=Math.round(px*z+panX); if(sx<0)continue;
      const maj=px%(step*5)===0;
      ctx.strokeStyle=maj?'#666666':'#AAAAAA'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(sx+.5,H); ctx.lineTo(sx+.5,maj?0:H-5); ctx.stroke();
      if(maj&&sx>4){ctx.fillStyle='#444444';ctx.font='9px Tahoma,sans-serif';ctx.fillText(px,sx+2,9);}
    }
  },

  _drawVRuler(canvas, z, panY) {
    const ctx=canvas.getContext('2d'), W=canvas.width, H=canvas.height;
    ctx.clearRect(0,0,W,H); ctx.fillStyle='#FFFFFF'; ctx.fillRect(0,0,W,H);
    ctx.save(); ctx.translate(W/2,0); ctx.rotate(-Math.PI/2);
    const step=this._rulerStep(z);
    for (let py=0; py*z+panY<H; py+=step) {
      const sy=Math.round(py*z+panY); if(sy<0)continue;
      const maj=py%(step*5)===0;
      ctx.strokeStyle=maj?'#666666':'#AAAAAA'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(-sy+.5,0); ctx.lineTo(-sy+.5,maj?W:W-4); ctx.stroke();
      if(maj&&sy>12){ctx.fillStyle='#444444';ctx.font='9px Tahoma,sans-serif';ctx.fillText(py,-sy+2,8);}
    }
    ctx.restore();
  },

  _rulerStep(z) {
    if(z>=3) return 5; if(z>=1.5) return 10; if(z>=0.8) return 20; if(z>=0.4) return 50; return 100;
  },

  _attachEvents() {
    const scroll = this._scroll;
    if (!scroll) return;

    // Ctrl+wheel → zoom
    scroll.addEventListener('wheel', e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const r = scroll.getBoundingClientRect();
      this.setZoom(RF.Core.DocumentModel.zoom * (e.deltaY<0?1.12:0.89), e.clientX-r.left, e.clientY-r.top);
    }, {passive:false});

    // Middle mouse → pan
    scroll.addEventListener('pointerdown', e => {
      if (e.button!==1) return; e.preventDefault();
      const sx=e.clientX, sy=e.clientY;
      const px=RF.Core.DocumentModel.panX, py=RF.Core.DocumentModel.panY;
      const onMove=ev=>{RF.Core.DocumentModel.panX=px+(ev.clientX-sx);RF.Core.DocumentModel.panY=py+(ev.clientY-sy);this._applyZoomPan();this.drawGrid();this.drawRulers();};
      const onUp=()=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);};
      document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
    });

    // Drag from ruler H → h guide
    this._rulerH?.addEventListener('pointerdown', e => {
      e.preventDefault();
      const g={id:RF.uid('g'),orientation:'h',position:0};
      RF.Core.DocumentModel.guides.push(g);
      const onMove=ev=>{const pt=this._canvasPt(ev);g.position=Math.round(pt.y);RF.UX.Guides.render();};
      const onUp=()=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);};
      document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
    });
    this._rulerV?.addEventListener('pointerdown', e => {
      e.preventDefault();
      const g={id:RF.uid('g'),orientation:'v',position:0};
      RF.Core.DocumentModel.guides.push(g);
      const onMove=ev=>{const pt=this._canvasPt(ev);g.position=Math.round(pt.x);RF.UX.Guides.render();};
      const onUp=()=>{document.removeEventListener('pointermove',onMove);document.removeEventListener('pointerup',onUp);};
      document.addEventListener('pointermove',onMove); document.addEventListener('pointerup',onUp);
    });

    // Marquee + click-deselect
    this._surface.addEventListener('pointerdown', e => this._surfaceMouseDown(e));
    this._surface.addEventListener('pointermove', e => this._surfaceMouseMove(e));
    this._surface.addEventListener('pointerup',   e => this._surfaceMouseUp(e));

    // Resize handle clicks
    this._surface.addEventListener('pointerdown', e => {
      if (e.target.dataset.handle) {
        const {handle,elid} = e.target.dataset;
        RF.UX.DragTools.startResize(e, handle, elid);
      }
    });
  },

  _surfaceMouseDown(e) {
    if (e.button!==0) return;
    const secBody = e.target.closest('.rf-sec-body');
    if (!secBody) return;
    if (e.target.classList.contains('rf-el') || e.target.dataset.handle) return;

    const tool = RF.Core.DocumentModel.activeTool;
    if (tool!=='select') return;  // tool creates via app._attachToolCreation

    e.preventDefault();
    const pt = this._canvasPt(e);
    this._mq = { active:true, startX:pt.x, startY:pt.y, sectionId:secBody.dataset.secid };
    Object.assign(this._marquee.style, {display:'block',left:pt.x+'px',top:pt.y+'px',width:'0',height:'0'});
  },

  _surfaceMouseMove(e) {
    if (!this._mq.active) return;
    const pt = this._canvasPt(e);
    const rx=Math.min(pt.x,this._mq.startX), ry=Math.min(pt.y,this._mq.startY);
    Object.assign(this._marquee.style,{left:rx+'px',top:ry+'px',width:Math.abs(pt.x-this._mq.startX)+'px',height:Math.abs(pt.y-this._mq.startY)+'px'});
  },

  _surfaceMouseUp(e) {
    if (!this._mq.active) return;
    this._mq.active = false;
    this._marquee.classList.add('u-hidden');
    const pt = this._canvasPt(e);
    const rw=Math.abs(pt.x-this._mq.startX), rh=Math.abs(pt.y-this._mq.startY);
    if (rw>4 && rh>4) {
      const body=document.getElementById(`secbody-${this._mq.sectionId}`);
      if (body) {
        const br=body.getBoundingClientRect(), sr=this._surface.getBoundingClientRect();
        const ox=(br.left-sr.left)/RF.Core.DocumentModel.zoom;
        const oy=(br.top -sr.top )/RF.Core.DocumentModel.zoom;
        RF.Sel.selectByRect(Math.min(pt.x,this._mq.startX)-ox, Math.min(pt.y,this._mq.startY)-oy, rw, rh, this._mq.sectionId);
      }
    } else {
      RF.Sel.clear();
    }
  },

  _canvasPt(e) {
    const r=this._surface?.getBoundingClientRect(), DM=RF.Core.DocumentModel;
    return {x:(e.clientX-r.left)/DM.zoom, y:(e.clientY-r.top)/DM.zoom};
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Classic.Sections — Section bands renderer + section resize.
// ═══════════════════════════════════════════════════════════════════════════════
