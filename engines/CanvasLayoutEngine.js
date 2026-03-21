/**
 * CanvasLayoutEngine (CanvasEngineV19) — ReportForge v19.6
 * ─────────────────────────────────────────────────────────────────
 * FULL implementation — zero dependency on monolithic CanvasEngine.
 * Owns:
 *   buildElementDiv()      — create element DOM node
 *   renderElement()        — insert into section
 *   renderAll()            — full canvas rebuild
 *   updateElement()        — re-apply styles to existing div
 *   updateElementPosition()— re-apply position only
 *   update() / updateSync()— canvas-layer size management
 *
 * Architecture rule: all geometry via RF.Geometry — never * DS.zoom.
 */
'use strict';

const CanvasLayoutEngine = (() => {
  // ── Canvas size management ────────────────────────────────────────
  function _applyCLSize() {
    const cl = document.getElementById('canvas-layer');
    if (!cl || typeof DS === 'undefined') return;
    console.log('🔥 REAL CanvasLayoutEngine._applyCLSize before', DS.sections.map(sec => ({ id: sec.id, h: sec.height })));

    const contentH = DS.sections.reduce((s, sec) => s + RF.Geometry.scale(sec.height), 0);

    console.log('🔥 REAL CanvasLayoutEngine.contentH', contentH);
    cl.style.width     = `${RF.Geometry.scale(CFG.PAGE_W)}px`;
    cl.style.minHeight = '0px';
    cl.style.height    = `${contentH}px`;
    cl.style.maxHeight = `${contentH}px`;

    requestAnimationFrame(() => {
      const rows = [...document.querySelectorAll('.cr-section[data-section-id]')].map(div => ({
        id: div.dataset.sectionId,
        top: div.getBoundingClientRect().top,
        h: div.getBoundingClientRect().height,
        styleH: div.style.height
      }));
      console.log('🔥 POST CANVAS SECTIONS', rows);
    });
  }
  function _scheduleSize() {
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.layout(_applyCLSize, 'CanvasLayoutEngine.size');
    } else {
      requestAnimationFrame(_applyCLSize);
    }
  }

  // ── Element div builder ──────────────────────────────────────────
  function buildElementDiv(el) {
    const div = document.createElement('div');
    div.className    = 'cr-element';
    div.dataset.id   = el.id;
    div.dataset.type = el.type;

    // Position + size (MODEL → VIEW via RF.Geometry)
    const p  = RF.Geometry.modelToView(el.x, el.y);
    div.style.left   = `${p.x}px`;
    div.style.top    = `${p.y}px`;
    div.style.width  = `${RF.Geometry.scale(el.w)}px`;
    div.style.height = `${RF.Geometry.scale(el.h)}px`;

    // Typography
    div.style.fontFamily      = el.fontFamily || 'Arial';
    div.style.fontSize        = `${RF.Geometry.scale(el.fontSize * 96 / 72)}px`;
    div.style.fontWeight      = el.bold      ? 'bold'      : 'normal';
    div.style.fontStyle       = el.italic    ? 'italic'    : 'normal';
    div.style.textDecoration  = el.underline ? 'underline' : 'none';
    div.style.textAlign       = el.align || 'left';
    div.style.zIndex          = el.zIndex || 0;

    // Corner markers
    ['tl','tr','bl','br'].forEach(pos => {
      const m = document.createElement('span');
      m.className = 'el-corner ' + pos;
      div.appendChild(m);
    });

    if (el.type === 'field') {
      div.style.color      = el.color;
      div.style.background = el.bgColor === 'transparent' ? 'var(--cr-field-bg)' : el.bgColor;
      if (el.borderWidth > 0)
        div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
      const icon  = document.createElement('span');
      icon.className   = 'el-field-icon';
      icon.textContent = '⬚';
      const span  = document.createElement('span');
      span.className   = 'el-content';
      span.textContent = el.fieldPath ? `{${el.fieldPath}}` : '';
      div.appendChild(icon);
      div.appendChild(span);

    } else if (el.type === 'text') {
      div.style.color      = el.color;
      div.style.background = el.bgColor === 'transparent' ? 'var(--cr-text-bg)' : el.bgColor;
      if (el.borderWidth > 0)
        div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
      const span  = document.createElement('span');
      span.className        = 'el-content';
      span.textContent      = el.content || 'Texto';
      span.contentEditable  = 'false';
      div.appendChild(span);

    } else if (el.type === 'line') {
      div.style.background = 'transparent';
      div.style.border     = 'none';
      div.style.overflow   = 'visible';
      const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:absolute;overflow:visible;pointer-events:none';
      svg.setAttribute('width',  el.w);
      svg.setAttribute('height', Math.max(el.h, 1));
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      const lc   = el.borderColor === 'transparent' ? '#000' : (el.borderColor || '#000');
      const mid  = Math.max(el.h / 2, 1);
      line.setAttribute('x1', 0); line.setAttribute('y1', mid);
      line.setAttribute('x2', el.w); line.setAttribute('y2', mid);
      line.setAttribute('stroke', lc);
      line.setAttribute('stroke-width', el.lineWidth || 1);
      svg.appendChild(line);
      const span = document.createElement('span');
      span.className = 'el-content';
      div.appendChild(svg);
      div.appendChild(span);

    } else if (el.type === 'rect') {
      div.style.background = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
      div.style.overflow   = 'visible';
      if (el.borderWidth > 0)
        div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
      const span = document.createElement('span');
      span.className = 'el-content';
      div.appendChild(span);

    } else if (el.type === 'image') {
      div.style.background = '#F9F9F9';
      div.style.border     = '1px dashed #999';
      const span = document.createElement('span');
      span.className   = 'el-content';
      span.textContent = el.imageSrc ? '🖼' : '⬚ imagen';
      div.appendChild(span);
    }

    // Attach interaction events via SelectionEngine (v19 or monolithic)
    const SE = (typeof EngineRegistry !== 'undefined' && EngineRegistry.get('SelectionEngine'))
            || (typeof SelectionEngine !== 'undefined' ? SelectionEngine : null);
    if (SE && SE.attachElementEvents) SE.attachElementEvents(div, el.id);

    return div;
  }

  function renderElement(el) {
    const secDiv = document.querySelector(`[data-section-id="${el.sectionId}"]`);
    if (!secDiv) return;
    const div = buildElementDiv(el);
    secDiv.appendChild(div);
  }

  function renderAll() {
    document.querySelectorAll('.cr-element').forEach(e => e.remove());
    if (typeof DS !== 'undefined') {
      for (const el of DS.elements) renderElement(el);
    }
  }

  function updateElement(id) {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    if (!div) return;
    const el = typeof DS !== 'undefined' ? DS.getElementById(id) : null;
    if (!el) return;
    // Re-apply full styles
    const p = RF.Geometry.modelToView(el.x, el.y);
    div.style.left        = `${p.x}px`;
    div.style.top         = `${p.y}px`;
    div.style.width       = `${RF.Geometry.scale(el.w)}px`;
    div.style.height      = `${RF.Geometry.scale(el.h)}px`;
    div.style.fontFamily  = el.fontFamily || 'Arial';
    div.style.fontSize    = `${RF.Geometry.scale(el.fontSize * 96 / 72)}px`;
    div.style.fontWeight  = el.bold      ? 'bold'      : 'normal';
    div.style.fontStyle   = el.italic    ? 'italic'    : 'normal';
    div.style.textDecoration = el.underline ? 'underline' : 'none';
    div.style.textAlign   = el.align || 'left';
    div.style.zIndex      = el.zIndex || 0;
    div.style.color       = el.color || '#000';
    div.style.background  = el.bgColor === 'transparent'
      ? (el.type === 'field' ? 'var(--cr-field-bg)' : 'var(--cr-text-bg)')
      : (el.bgColor || 'transparent');
    if (el.borderWidth > 0)
      div.style.border = `${el.borderWidth}px ${el.borderStyle} ${el.borderColor}`;
    else
      div.style.border = '';
    // Update text content
    const span = div.querySelector('.el-content');
    if (span) {
      if (el.type === 'field')
        span.textContent = el.fieldPath ? `{${el.fieldPath}}` : '';
      else if (el.type === 'text')
        span.textContent = el.content || '';
    }
    // Update selection state
    if (typeof DS !== 'undefined')
      div.classList.toggle('selected', DS.selection.has(id));
  }

  function updateElementPosition(id) {
    const div = document.querySelector(`.cr-element[data-id="${id}"]`);
    if (!div) return;
    const el = typeof DS !== 'undefined' ? DS.getElementById(id) : null;
    if (!el) return;
    const p = RF.Geometry.modelToView(el.x, el.y);
    div.style.left   = `${p.x}px`;
    div.style.top    = `${p.y}px`;
    div.style.width  = `${RF.Geometry.scale(el.w)}px`;
    div.style.height = `${RF.Geometry.scale(el.h)}px`;
  }

  return {
    // Canvas size management
    update()     { _scheduleSize(); },
    updateSync() { _applyCLSize();  },

    getMetrics() {
      return {
        scaledW: RF.Geometry.scale(CFG.PAGE_W),
        scaledH: RF.Geometry.scale(typeof DS !== 'undefined' ? DS.getTotalHeight() : 0),
        modelW:  CFG.PAGE_W,
        modelH:  typeof DS !== 'undefined' ? DS.getTotalHeight() : 0,
        zoom:    RF.Geometry.zoom(),
      };
    },

    // Full DOM element management (no monolithic delegation)
    buildElementDiv,
    renderElement,
    renderAll,
    updateElement,
    updateElementPosition,
  };
})();

if (typeof module !== 'undefined') module.exports = CanvasLayoutEngine;
