/**
 * RulerEngine — ReportForge v19
 * ─────────────────────────────────────────────────────────────────
 * Complete rewrite of the ruler rendering pipeline.
 *
 * Key improvements over v18:
 *  - Strict coordinate space separation
 *  - DPR-correct canvas via ctx.scale(dpr, dpr)
 *  - Tick positions via RF.Geometry.scale(modelUnit)
 *  - Cursor crosshair overlay
 *  - Section bands from model data (no BCR reads in tight loops)
 *  - rAF-batched updates
 *
 * Coordinate spaces used here:
 *   MODEL    → document units (what DS stores)
 *   VIEW     → DOM pixels (MODEL × zoom)
 *   SCREEN   → physical pixels (VIEW × devicePixelRatio)
 *
 * Architecture rule:
 *   All tick positions: RF.Geometry.scale(modelValue)
 *   Never: modelValue * DS.zoom
 */
'use strict';

window.RulerEngine = (() => {
  // ── Constants ────────────────────────────────────────────────────
  const H_RULER_H  = 16;   // CSS px height of horizontal ruler
  const V_GUTTER_W = 14;   // CSS px width of section-label gutter
  const V_TICK_W   = 8;    // CSS px width of tick column
  const V_TOTAL_W  = V_GUTTER_W + V_TICK_W;  // = 22px

  // Section stype → background colour
  const SECTION_COLORS = {
    rh: '#FFFDE7', ph: '#E8F5E9', det: '#FFF',
    pf: '#E3F2FD', rf: '#FCE4EC', gh: '#F3E5F5', gf: '#FFF3E0',
  };

  // Cursor position in MODEL SPACE (updated by updateCursor)
  let _cursorModel = { x: -1, y: -1 };

  // rAF handle
  let _rafId = null;

  // ── Helpers ──────────────────────────────────────────────────────

  /** Choose major tick step based on current zoom */
  function _tickStep() {
    const z = RF.Geometry.zoom();
    if (z >= 3.0) return 5;
    if (z >= 1.5) return 10;
    return 20;
  }

  /** Resolve DPR-safe canvas dimensions and set up context */
  function _setupCanvas(canvas, cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    canvas.style.width  = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    // Reset transform each frame — prevents accumulation on repeated renders
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  }

  // ── Horizontal ruler ─────────────────────────────────────────────

  function _renderH() {
    const canvas = document.getElementById('ruler-h-inner');
    const ws     = document.getElementById('workspace');
    const cl     = document.getElementById('canvas-layer');
    if (!canvas || !ws || !cl) return;

    const cssW = ws.clientWidth;
    const cssH = H_RULER_H;
    const ctx  = _setupCanvas(canvas, cssW, cssH);

    // Canvas left offset relative to workspace (live BCR — one read, cached)
    RF.Geometry.invalidate();
    const clR = cl.getBoundingClientRect();
    const wsR = ws.getBoundingClientRect();
    const offX   = Math.round(clR.left - wsR.left);
    const canvasW = Math.round(clR.width);

    // ── Background ─────────────────────────────────────────────────
    ctx.fillStyle = '#C0C0C0';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(offX, 0, canvasW, cssH);

    // ── Bottom separator ────────────────────────────────────────────
    ctx.strokeStyle = '#888888';
    ctx.lineWidth   = 0.5;
    ctx.beginPath();
    ctx.moveTo(0, cssH - 0.5);
    ctx.lineTo(cssW, cssH - 0.5);
    ctx.stroke();

    // ── Tick marks ─────────────────────────────────────────────────
    ctx.strokeStyle = '#000000';
    ctx.fillStyle   = '#222222';
    ctx.font        = '9px Segoe UI,Tahoma,sans-serif';
    ctx.lineWidth   = 1;

    const step = _tickStep();
    for (let i = 0; i <= CFG.PAGE_W; i += step) {
      // MODEL → VIEW: tick position in DOM px
      const x = offX + RF.Geometry.scale(i);
      if (x < offX - 0.5 || x > offX + canvasW + 0.5) continue;

      const isMajor = (i % (step * 5) === 0);
      const tickH   = isMajor ? 9 : 5;

      ctx.beginPath();
      ctx.moveTo(x, cssH - tickH);
      ctx.lineTo(x, cssH);
      ctx.stroke();

      if (isMajor && i > 0) {
        ctx.fillText(i, x - 6, cssH - tickH - 1);
      }
    }

    // ── Cursor crosshair ─────────────────────────────────────────────
    if (_cursorModel.x >= 0) {
      const cx = offX + RF.Geometry.scale(_cursorModel.x);
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

  // ── Vertical ruler ───────────────────────────────────────────────

  function _renderV() {
    const canvas = document.getElementById('ruler-v-inner');
    const cl     = document.getElementById('canvas-layer');
    if (!canvas || !cl) return;

    // Position canvas top relative to canvas-layer top
    const vTop = RF.Geometry.rulerVTop();
    canvas.style.top = vTop + 'px';

    const cssH = Math.round(cl.getBoundingClientRect().height);
    const cssW = V_TOTAL_W;
    const ctx  = _setupCanvas(canvas, cssW, cssH);

    // ── White base ─────────────────────────────────────────────────
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, cssW, cssH);

    // ── Section gutter ─────────────────────────────────────────────
    ctx.font = '8px Segoe UI,Tahoma,sans-serif';

    if (typeof DS !== 'undefined') {
      DS.sections.forEach(sec => {
        const secDiv = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
        const band   = RF.Geometry.sectionBand(secDiv);
        // MODEL → VIEW for band dimensions
        const bandY = band ? band.y : RF.Geometry.scale(DS.getSectionTop(sec.id));
        const bandH = band ? band.h : RF.Geometry.scale(sec.height);

        // Section background
        ctx.fillStyle = SECTION_COLORS[sec.stype] || '#F5F5F5';
        ctx.fillRect(0, bandY, V_GUTTER_W, bandH);

        // Section abbreviation — rotated, centered
        ctx.fillStyle = '#555555';
        ctx.save();
        ctx.translate(V_GUTTER_W / 2, bandY + bandH / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(sec.abbr, 0, 0);
        ctx.restore();

        // Section divider
        ctx.strokeStyle = '#CCCCCC';
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.moveTo(0, bandY + bandH);
        ctx.lineTo(V_TOTAL_W, bandY + bandH);
        ctx.stroke();
      });
    }

    // ── Gutter/tick separator ──────────────────────────────────────
    ctx.strokeStyle = '#AAAAAA';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(V_GUTTER_W, 0);
    ctx.lineTo(V_GUTTER_W, cssH);
    ctx.stroke();

    // ── Tick marks ─────────────────────────────────────────────────
    ctx.strokeStyle = '#000000';
    ctx.fillStyle   = '#222222';
    ctx.font        = '9px Segoe UI,Tahoma,sans-serif';

    const step       = _tickStep();
    const modelTotal = RF.Geometry.unscale(cssH);

    for (let i = 0; i <= modelTotal; i += step) {
      const y = RF.Geometry.scale(i);  // MODEL → VIEW
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

    // ── Cursor crosshair ──────────────────────────────────────────
    if (_cursorModel.y >= 0) {
      const cy = RF.Geometry.scale(_cursorModel.y);
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

  // ── rAF scheduling ──────────────────────────────────────────────

  function scheduleRender() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.visual(() => {
        RF.Geometry.invalidate();
        _renderH();
        _renderV();
      }, 'RulerEngine.render');
    } else {
      if (_rafId) return;
      _rafId = requestAnimationFrame(() => {
        _rafId = null;
        RF.Geometry.invalidate();
        _renderH();
        _renderV();
      });
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  return {
    /** Full re-render both rulers (batched) */
    render() { scheduleRender(); },

    /** Synchronous render (use during initial boot only) */
    renderSync() {
      RF.Geometry.invalidate();
      _renderH();
      _renderV();
    },

    /**
     * Update cursor position (MODEL SPACE).
     * Call from mouse-move handler with model coords.
     */
    updateCursor(modelX, modelY) {
      _cursorModel = { x: modelX, y: modelY };
      scheduleRender();
    },

    /** Clear cursor crosshair */
    clearCursor() {
      _cursorModel = { x: -1, y: -1 };
      scheduleRender();
    },

    /**
     * Constants exposed for external layout code.
     */
    H_RULER_H,
    V_TOTAL_W,
    V_GUTTER_W,
    V_TICK_W,
  };
})();

if (typeof module !== 'undefined') module.exports = window.RulerEngine;
