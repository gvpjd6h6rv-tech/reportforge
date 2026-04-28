/**
 * RulerEngineRenderer — shared ruler drawing helpers.
 * Pure rendering logic and canvas setup live here; public state stays in RulerEngine.js.
 */
'use strict';

window.RulerEngineRenderer = (() => {
  const H_RULER_H  = 16;
  const V_GUTTER_W = 14;
  const V_TICK_W   = 8;
  const V_TOTAL_W  = V_GUTTER_W + V_TICK_W;

  const SECTION_COLORS = {
    rh: '#FFFDE7', ph: '#E8F5E9', det: '#FFF',
    pf: '#E3F2FD', rf: '#FCE4EC', gh: '#F3E5F5', gf: '#FFF3E0',
  };

  function _tickStep() {
    const z = RF.Geometry.zoom();
    if (z >= 3.0) return 5;
    if (z >= 1.5) return 10;
    return 20;
  }

  function _setupCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  function renderHorizontal(cursorModel) {
    const canvas = document.getElementById('ruler-h-inner');
    const ws     = document.getElementById('workspace');
    const cl     = document.getElementById('canvas-layer');
    if (!canvas || !ws || !cl) return;

    const cssW = ws.clientWidth;
    const cssH = H_RULER_H;
    const ctx   = _setupCanvas(canvas, cssW, cssH);

    RF.Geometry.invalidate();
    const clR = cl.getBoundingClientRect();
    const wsR = ws.getBoundingClientRect();
    const offX   = Math.round(clR.left - wsR.left);
    const canvasW = Math.round(clR.width);

    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(offX, 0, canvasW, cssH);

    ctx.strokeStyle = '#888888';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cssH - 0.5);
    ctx.lineTo(cssW, cssH - 0.5);
    ctx.stroke();

    ctx.strokeStyle = '#000000';
    ctx.fillStyle   = '#222222';
    ctx.font        = '9px Segoe UI,Tahoma,sans-serif';
    ctx.lineWidth   = 1;

    const step = _tickStep();
    for (let i = 0; i <= CFG.PAGE_W; i += step) {
      const x = offX + RF.Geometry.scale(i);
      if (x < offX - 0.5 || x > offX + canvasW + 0.5) continue;
      const isMajor = (i % (step * 5) === 0);
      const tickH   = isMajor ? 9 : 5;
      ctx.beginPath();
      ctx.moveTo(x, cssH - tickH);
      ctx.lineTo(x, cssH);
      ctx.stroke();
      if (isMajor && i > 0) ctx.fillText(i, x - 6, cssH - tickH - 1);
    }

    if (cursorModel.x >= 0) {
      const cx = offX + RF.Geometry.scale(cursorModel.x);
      if (cx >= offX && cx <= offX + canvasW) {
        ctx.strokeStyle = 'rgba(0,100,220,0.6)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, cssH);
        ctx.stroke();
      }
    }
  }

  function renderVertical(cursorModel) {
    const canvas = document.getElementById('ruler-v-inner');
    const cl     = document.getElementById('canvas-layer');
    if (!canvas || !cl) return;

    const vTop = RF.Geometry.rulerVTop();
    canvas.style.top = vTop + 'px';

    const cssH = Math.round(cl.getBoundingClientRect().height);
    const cssW = V_TOTAL_W;
    const ctx  = _setupCanvas(canvas, cssW, cssH);

    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.font = '8px Segoe UI,Tahoma,sans-serif';

    if (typeof DS !== 'undefined') {
      DS.sections.forEach(sec => {
        const secDiv = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
        const band   = RF.Geometry.sectionBand(secDiv);
        const bandY = band ? band.y : RF.Geometry.scale(DS.getSectionTop(sec.id));
        const bandH = band ? band.h : RF.Geometry.scale(sec.height);

        ctx.fillStyle = SECTION_COLORS[sec.stype] || '#F5F5F5';
        ctx.fillRect(0, bandY, V_GUTTER_W, bandH);

        ctx.fillStyle = '#555555';
        ctx.save();
        ctx.translate(V_GUTTER_W / 2, bandY + bandH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sec.abbr, 0, 0);
        ctx.restore();

        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, bandY + bandH);
        ctx.lineTo(V_TOTAL_W, bandY + bandH);
        ctx.stroke();
      });
    }

    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(V_GUTTER_W, 0);
    ctx.lineTo(V_GUTTER_W, cssH);
    ctx.stroke();

    ctx.strokeStyle = '#000000';
    ctx.fillStyle   = '#222222';
    ctx.font        = '9px Segoe UI,Tahoma,sans-serif';

    const step       = _tickStep();
    const modelTotal = RF.Geometry.unscale(cssH);
    for (let i = 0; i <= modelTotal; i += step) {
      const y = RF.Geometry.scale(i);
      if (y > cssH + 0.5) break;
      const isMajor = (i % (step * 5) === 0);
      const tickLen = isMajor ? V_TICK_W : Math.floor(V_TICK_W / 2);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(V_GUTTER_W, y);
      ctx.lineTo(V_GUTTER_W + tickLen, y);
      ctx.stroke();
      if (isMajor && i > 0) {
        ctx.save();
        ctx.translate(V_GUTTER_W + V_TICK_W / 2, y);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(i, 0, 0);
        ctx.restore();
      }
    }

    if (cursorModel.y >= 0) {
      const cy = RF.Geometry.scale(cursorModel.y);
      if (cy >= 0 && cy <= cssH) {
        ctx.strokeStyle = 'rgba(0,100,220,0.6)';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(V_GUTTER_W, cy);
        ctx.lineTo(V_TOTAL_W, cy);
        ctx.stroke();
      }
    }
  }

  return {
    H_RULER_H,
    V_TOTAL_W,
    V_GUTTER_W,
    V_TICK_W,
    renderHorizontal,
    renderVertical,
  };
})();

