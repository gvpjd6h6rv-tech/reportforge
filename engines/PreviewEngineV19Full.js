/**
 * PreviewEngineV19Full — ReportForge v19.6 (Full Implementation)
 * ─────────────────────────────────────────────────────────────────
 * Complete replacement for monolithic PreviewEngine.
 * Uses RF.Geometry for ALL coordinates — no fixed sizes.
 *
 * Architecture:
 *   show()              — switch canvas to preview mode
 *   hide()              — restore design mode
 *   refresh()           — re-render preview content
 *   _renderWithData()   — paginated HTML generation
 *   _renderBand()       — single section band (interactive elements)
 *   _renderSectionData()— single section band (static data)
 *   _renderElementData()— single element HTML (static)
 *   _renderInstanceElement() — single element (interactive, draggable)
 */
'use strict';

const PreviewEngineV19Full = (() => {
  function _assertBridgeInactive(method) {
    if (typeof window !== 'undefined' && window.__RF_CANONICAL_PREVIEW_OWNER__ === 'PreviewEngineV19') {
      const message = `NON-CANONICAL ENGINE WRITE BLOCKED (${method})`;
      if (typeof console !== 'undefined' && console.error) console.error(message);
      throw new Error(message);
    }
  }

  // ── State ─────────────────────────────────────────────────────────
  let _sc = { x: 0, y: 0 };
  let _renderMode = 'design';

  // ── helpers ──────────────────────────────────────────────────────
  function _reg(name) {
    return (typeof EngineRegistry !== 'undefined' && EngineRegistry.get(name)) || null;
  }

  function _resolveField(path, data, itemData) {
    if (typeof resolveField !== 'undefined') return resolveField(path, data, itemData);
    const parts = path.split('.');
    let obj = itemData || data;
    for (const p of parts) {
      if (obj == null) return '';
      obj = obj[p];
    }
    return obj ?? '';
  }

  function _formatValue(raw, fmt) {
    if (typeof formatValue !== 'undefined') return formatValue(raw, fmt);
    if (raw == null) return '';
    return String(raw);
  }

  // ── CSS for preview elements ─────────────────────────────────────
  function _buildCSS() {
    return `.pv-section{position:relative;overflow:visible;box-sizing:border-box}
.pv-section-bg-alt{background:#FAFAF8}
.pv-page{background:#fff;position:relative;margin:0 auto 24px}
.pv-page-break{height:24px;display:flex;align-items:center;justify-content:center;font-size:10px;color:#999}
.pv-el{position:absolute;overflow:hidden;box-sizing:border-box}`;
  }

  // ── Element rendering (static — for non-paginated path) ──────────
  function _renderElementData(el, itemData, rootData) {
    const data   = rootData || DS._sampleData || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value    = '';
    if (el.type === 'field' && el.fieldPath) {
      value = _formatValue(_resolveField(el.fieldPath, data, itemData), el.fieldFmt);
    } else {
      value = el.content || '';
    }

    // All coords via RF.Geometry
    const r  = RF.Geometry.rectToView(el);
    const fs = RF.Geometry.scale(el.fontSize * 96 / 72);

    const st = [
      `position:absolute`, `left:${r.left}px`, `top:${r.top}px`,
      `width:${r.width}px`, `height:${r.height}px`,
      `font-family:${el.fontFamily}`, `font-size:${fs}px`,
      `font-weight:${el.bold ? 'bold' : 'normal'}`,
      `font-style:${el.italic ? 'italic' : 'normal'}`,
      `text-decoration:${el.underline ? 'underline' : 'none'}`,
      `text-align:${el.align}`, `color:${el.color}`,
      `overflow:hidden`, `display:flex`, `align-items:center`, `line-height:1`,
    ].join(';');

    if (el.type === 'line') {
      const lc  = el.borderColor === 'transparent' ? '#000' : el.borderColor;
      const mid = Math.max(r.height / 2, 1);
      return `<div style="${st};background:transparent"><svg style="overflow:visible" width="${r.width}" height="${Math.max(r.height,2)}"><line x1="0" y1="${mid}" x2="${r.width}" y2="${mid}" stroke="${lc}" stroke-width="${RF.Geometry.scale(el.lineWidth||1)}"/></svg></div>`;
    }
    if (el.type === 'rect') {
      const bg  = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
      const brd = el.borderWidth > 0 ? `border:${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
      return `<div style="${st};background:${bg};${brd}"></div>`;
    }
    const bg  = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
    const brd = el.borderWidth > 0 ? `;border:${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
    const esc = String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div style="${st};background:${bg}${brd};padding:0 2px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc}</span></div>`;
  }

  // ── Interactive element (for paginated path) ──────────────────────
  function _renderInstanceElement(el, rowData, rootData, rowIndex) {
    const data  = rootData || DS._sampleData || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value   = '';
    if (el.type === 'field' && el.fieldPath) {
      value = _formatValue(_resolveField(el.fieldPath, data, rowData), el.fieldFmt);
    } else {
      value = el.content || '';
    }
    const ri    = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const _r    = RF.Geometry.rectToView(el);
    const _fs   = RF.Geometry.scale(el.fontSize * 96 / 72);
    const st    = [
      `position:absolute`, `left:${_r.left}px`, `top:${_r.top}px`,
      `width:${_r.width}px`, `height:${_r.height}px`,
      `font-family:${el.fontFamily}`, `font-size:${_fs}px`,
      `font-weight:${el.bold ? 'bold' : 'normal'}`,
      `font-style:${el.italic ? 'italic' : 'normal'}`,
      `text-decoration:${el.underline ? 'underline' : 'none'}`,
      `text-align:${el.align}`, `color:${el.color}`,
      `overflow:hidden`, `display:flex`, `align-items:center`, `line-height:1`,
    ].join(';');
    const corners = '<span class="el-corner tl"></span><span class="el-corner tr"></span><span class="el-corner bl"></span><span class="el-corner br"></span>';
    const esc     = String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<div class="pv-el" data-origin-id="${el.id}"${ri} style="${st}">${corners}${esc}</div>`;
  }

  // ── Section band rendering ────────────────────────────────────────
  function _renderBand(sec, rowData, alt, rootData, rowIndex) {
    const cls   = alt ? ' pv-section-bg-alt' : '';
    const ri    = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const inner = DS.elements
      .filter(e => e.sectionId === sec.id)
      .map(el => _renderInstanceElement(el, rowData, rootData, rowIndex))
      .join('');
    // RF.Geometry for section dimensions
    const h = RF.Geometry.scale(sec.height);
    const w = RF.Geometry.scale(CFG.PAGE_W);
    return `<div class="pv-section${cls}" data-section-id="${sec.id}" style="height:${h}px;width:${w}px"${ri}>${inner}</div>`;
  }

  function _renderSectionData(sec, itemData, altRow, rootData) {
    const els   = DS.elements.filter(e => e.sectionId === sec.id);
    const inner = els.map(el => _renderElementData(el, itemData, rootData)).join('');
    const bg    = altRow ? 'background:#FAFAF8' : '';
    const h     = RF.Geometry.scale(sec.height);
    const w     = RF.Geometry.scale(CFG.PAGE_W);
    return `<div class="pv-section" style="position:relative;height:${h}px;width:${w}px;${bg};border-bottom:1px solid #EEE;overflow:hidden">${inner}</div>`;
  }

  // ── Paginated _renderWithData ────────────────────────────────────
  function _renderWithData(data) {
    const items       = data.items || [];
    const PAGE_H      = 1122;
    const scaledPageW = RF.Geometry.scale(CFG.PAGE_W);
    const scaledPageH = RF.Geometry.scale(PAGE_H);

    let html         = '';
    let currentPageH = 0;
    let pageNum      = 1;
    let pageContent  = '';

    const openPage  = () => { pageContent = ''; currentPageH = 0; };
    const closePage = (isLast) => {
      html += `<div class="pv-page" data-page="${pageNum}" style="width:${scaledPageW}px;min-height:${currentPageH}px">${pageContent}</div>`;
      if (!isLast) html += `<div class="pv-page-break"><span>— Página ${pageNum} de ${pageNum+1} —</span></div>`;
      pageNum++;
    };
    const addBand   = (bandHtml, height) => { pageContent += bandHtml; currentPageH += height; };

    openPage();

    const headerSecs = DS.sections.filter(s => s.stype === 'rh' || s.stype === 'ph');
    const footerSecs = DS.sections.filter(s => s.stype === 'pf' || s.stype === 'rf');
    const detailSecs = DS.sections.filter(s => s.iterates);
    const usableH    = scaledPageH
      - headerSecs.reduce((a, s) => a + RF.Geometry.scale(s.height), 0)
      - footerSecs.reduce((a, s) => a + RF.Geometry.scale(s.height), 0);
    const needsNewPage = (h) => currentPageH + h > usableH && currentPageH > 0;

    // Header sections
    for (const sec of headerSecs) {
      addBand(_renderBand(sec, null, false, data, null), RF.Geometry.scale(sec.height));
    }

    // Detail rows
    const dataRows = items.length > 0 ? items : [{ _empty: true }];
    for (let ri = 0; ri < dataRows.length; ri++) {
      const rowData = dataRows[ri];
      const alt     = ri % 2 === 1;
      for (const sec of detailSecs) {
        const sh = RF.Geometry.scale(sec.height);
        if (needsNewPage(sh)) {
          for (const fs of footerSecs.filter(s => s.stype === 'pf'))
            addBand(_renderBand(fs, null, false, data, null), RF.Geometry.scale(fs.height));
          closePage(false);
          openPage();
          for (const hs of headerSecs.filter(s => s.stype === 'ph'))
            addBand(_renderBand(hs, null, false, data, null), RF.Geometry.scale(hs.height));
        }
        addBand(_renderBand(sec, rowData, alt, data, ri), sh);
      }
    }

    // Footer sections
    for (const sec of footerSecs) {
      addBand(_renderBand(sec, null, false, data, null), RF.Geometry.scale(sec.height));
    }

    closePage(true);
    return html;
  }

  // ── refresh ────────────────────────────────────────────────────────
  function refresh() {
    _assertBridgeInactive('PreviewEngineV19Full.refresh');
    const content = document.getElementById('preview-content');
    if (!content) return;
    const scaledW = RF.Geometry.scale(CFG.PAGE_W);
    content.style.width    = scaledW + 'px';
    content.style.maxWidth = 'none';
    const data = DS._sampleData || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    content.innerHTML = _renderWithData(data);
    for (const id of DS.selection) {
      document.querySelectorAll(`.pv-el[data-origin-id="${id}"]`)
        .forEach(el => el.classList.add('pv-origin-selected'));
    }
  }

  // ── show / hide / toggle ──────────────────────────────────────────
  function show() {
    _assertBridgeInactive('PreviewEngineV19Full.show');
    const t0 = performance.now();
    const ws = document.getElementById('workspace');
    if (ws) _sc = { x: ws.scrollLeft, y: ws.scrollTop };

    const cl = document.getElementById('canvas-layer');
    if (cl) cl.classList.add('preview-mode');
    _renderMode   = 'preview';
    DS.zoomDesign = DS.zoom;
    document.body.setAttribute('data-render-mode', 'preview');

    const content = document.getElementById('preview-content');
    if (content) content.innerHTML = '';
    refresh();

    document.getElementById('tab-preview')?.classList.add('active');
    document.getElementById('tab-design')?.classList.remove('active');

    DS.previewMode = true;
    const pze = _reg('PreviewZoomEngine') || (typeof PreviewZoomEngine !== 'undefined' ? PreviewZoomEngine : null);
    if (pze?.set) pze.set(DS.previewZoom || 1.0);
    const zw = _reg('ZoomWidget') || (typeof ZoomWidget !== 'undefined' ? ZoomWidget : null);
    if (zw?.sync) zw.sync();

    console.debug(`[PreviewEngineV19] ON in ${(performance.now()-t0).toFixed(1)}ms`);
  }

  function hide() {
    _assertBridgeInactive('PreviewEngineV19Full.hide');
    const t0 = performance.now();
    const cl = document.getElementById('canvas-layer');
    if (cl) cl.classList.remove('preview-mode');
    _renderMode     = 'design';
    DS.zoomPreview  = DS.zoom;

    const dze = _reg('DesignZoomEngine') || (typeof DesignZoomEngine !== 'undefined' ? DesignZoomEngine : null);
    if (dze?.set) dze.set(DS.zoomDesign);
    document.body.removeAttribute('data-render-mode');

    document.getElementById('tab-design')?.classList.add('active');
    document.getElementById('tab-preview')?.classList.remove('active');

    const ws = document.getElementById('workspace');
    if (ws) { ws.scrollLeft = _sc.x; ws.scrollTop = _sc.y; }

    DS.previewMode = false;
    const zw = _reg('ZoomWidget') || (typeof ZoomWidget !== 'undefined' ? ZoomWidget : null);
    if (zw?.sync) zw.sync();

    // Re-render overlays
    if (typeof RulerEngine !== 'undefined') RulerEngine.render();

    console.debug(`[PreviewEngineV19] OFF in ${(performance.now()-t0).toFixed(1)}ms`);
  }

  function toggle() {
    _assertBridgeInactive('PreviewEngineV19Full.toggle');
    _renderMode === 'preview' ? hide() : show();
  }

  // ── Public API ─────────────────────────────────────────────────────
  return {
    show, hide, toggle, refresh,
    _renderWithData, _renderBand, _renderSectionData,
    _renderElementData, _renderInstanceElement, _buildCSS,
    get renderMode()   {
      _assertBridgeInactive('PreviewEngineV19Full.renderMode:get');
      return _renderMode;
    },
    set renderMode(m)  {
      _assertBridgeInactive('PreviewEngineV19Full.renderMode:set');
      m === 'preview' ? show() : hide();
    },
    isActive()         { return _renderMode === 'preview'; },
  };
})();

if (typeof module !== 'undefined') module.exports = PreviewEngineV19Full;
