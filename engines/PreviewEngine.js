/**
 * PreviewEngineV19 — ReportForge v19.6
 * ─────────────────────────────────────────────────────────────────
 * FULL implementation — zero dependency on legacy preview facades.
 *
 * All coordinates via RF.Geometry — no raw DS.zoom.
 * Includes full HTML generation pipeline:
 *   show() / hide() / toggle() / refresh()
 *   _renderWithData()
 *   _renderBand()
 *   _renderSectionData()
 *   _renderElementData()
 *   _renderInstanceElement()
 *   _buildCSS()
 */
'use strict';

const PreviewEngineV19 = (() => {
  let _sc = { x: 0, y: 0 };
  let _active = false;

  function _contracts() {
    return (typeof ContractGuards !== 'undefined' && ContractGuards)
      || (window.RF?.RuntimeServices?.getContractGuards?.() || null)
      || null;
  }

  function _assertSelectionState(source) {
    const guards = _contracts();
    if (guards && typeof DS !== 'undefined') guards.assertSelectionState(DS.selection, source);
  }

  function _assertLayoutContract(el, source) {
    const guards = _contracts();
    if (guards && el) guards.assertLayoutContract(el, source);
  }

  function _assertZoomContract(value, source) {
    const guards = _contracts();
    if (guards) guards.assertZoomContract(value, source);
  }

  // ── Helpers (replicate HTML helpers) ─────────────────────────────
  function _resolveField(path, data, itemData) {
    if (!path) return '';
    const src = (path.startsWith('items.') || path.startsWith('item.')) && itemData ? itemData : data;
    const keys = path.replace(/^items?\./, '').split('.');
    let v = src;
    for (const k of keys) { if (v == null) return ''; v = v[k]; }
    return (v == null) ? '' : v;
  }

  function _formatValue(v, fmt) {
    if (v === null || v === undefined || v === '') return '';
    if (typeof FORMATS !== 'undefined' && FORMATS[fmt]) return FORMATS[fmt](v);
    if (fmt === 'currency') return '$' + parseFloat(v).toFixed(2);
    if (fmt === 'number')   return parseFloat(v).toFixed(2);
    return String(v);
  }

  // ── Element rendering ─────────────────────────────────────────────
  function _renderElementData(el, itemData, rootData) {
    _assertLayoutContract(el, 'PreviewEngineV19._renderElementData');
    const data = rootData || (typeof DS !== 'undefined' && DS._sampleData) ||
                 (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value = '';
    if (el.type === 'field' && el.fieldPath) {
      const raw = (typeof resolveField !== 'undefined')
        ? resolveField(el.fieldPath, data, itemData)
        : _resolveField(el.fieldPath, data, itemData);
      value = (typeof formatValue !== 'undefined')
        ? formatValue(raw, el.fieldFmt)
        : _formatValue(raw, el.fieldFmt);
    } else {
      value = el.content || '';
    }

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
      return `<div style="${st};background:transparent"><svg style="overflow:visible" width="${r.width}" height="${Math.max(r.height, 2)}"><line x1="0" y1="${mid}" x2="${r.width}" y2="${mid}" stroke="${lc}" stroke-width="${RF.Geometry.scale(el.lineWidth || 1)}"/></svg></div>`;
    }
    if (el.type === 'rect') {
      const bg  = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
      const brd = el.borderWidth > 0 ? `border:${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
      return `<div style="${st};background:${bg};${brd}"></div>`;
    }
    const bg  = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
    const brd = el.borderWidth > 0 ? `;border:${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
    const esc = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div style="${st};background:${bg}${brd};padding:0 2px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc}</span></div>`;
  }

  function _renderInstanceElement(el, rowData, rootData, rowIndex) {
    _assertLayoutContract(el, 'PreviewEngineV19._renderInstanceElement');
    const data = rootData || (typeof DS !== 'undefined' && DS._sampleData) ||
                 (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value = '';
    if (el.type === 'field' && el.fieldPath) {
      const raw = (typeof resolveField !== 'undefined')
        ? resolveField(el.fieldPath, data, rowData)
        : _resolveField(el.fieldPath, data, rowData);
      value = (typeof formatValue !== 'undefined')
        ? formatValue(raw, el.fieldFmt)
        : _formatValue(raw, el.fieldFmt);
    } else {
      value = el.content || '';
    }
    const ri  = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const _r  = RF.Geometry.rectToView(el);
    const _fs = RF.Geometry.scale(el.fontSize * 96 / 72);
    const st  = [
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
    return `<div class="pv-el cr-element" data-id="${el.id}" data-origin-id="${el.id}" data-type="${el.type}"${ri} style="${st}">${corners}${value}</div>`;
  }

  function _renderBand(sec, rowData, alt, rootData, rowIndex) {
    const cls   = alt ? ' pv-section-bg-alt' : '';
    const ri    = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const inner = DS.elements
      .filter(e => e.sectionId === sec.id)
      .map(el => _renderInstanceElement(el, rowData, rootData, rowIndex))
      .join('');
    return `<div class="pv-section${cls}" data-section-id="${sec.id}" style="height:${RF.Geometry.scale(sec.height)}px;width:${RF.Geometry.scale(CFG.PAGE_W)}px"${ri}>${inner}</div>`;
  }

  function _renderSectionData(sec, itemData, altRow, rootData) {
    const els   = DS.elements.filter(e => e.sectionId === sec.id);
    const inner = els.map(el => _renderElementData(el, itemData, rootData)).join('');
    const bg    = altRow ? 'background:#FAFAF8' : '';
    return `<div class="pv-section" style="position:relative;height:${RF.Geometry.scale(sec.height)}px;width:${RF.Geometry.scale(CFG.PAGE_W)}px;${bg};border-bottom:1px solid #EEE;overflow:hidden">${inner}</div>`;
  }

  function _buildCSS() { return ''; } // styles in global CSS

  function _renderWithData(data) {
    const items      = data.items || [];
    const PAGE_W     = CFG.PAGE_W;
    const PAGE_H     = 1122;
    const scaledPageW = RF.Geometry.scale(PAGE_W);
    const scaledPageH = RF.Geometry.scale(PAGE_H);
    let html = '', currentPageH = 0, pageNum = 1, pageContent = '';

    const openPage   = () => { pageContent = ''; currentPageH = 0; };
    const closePage  = (isLast) => {
      html += `<div class="pv-page" data-page="${pageNum}" style="width:${scaledPageW}px;min-height:${currentPageH}px">${pageContent}</div>`;
      if (!isLast) html += `<div class="pv-page-break"><span>— Página ${pageNum} de ${pageNum + 1} —</span></div>`;
      pageNum++;
    };
    const addBand    = (bandHtml, height) => { pageContent += bandHtml; currentPageH += height; };
    const needsNewPage = (h) => currentPageH + h > scaledPageH && currentPageH > 0;

    openPage();
    const headerSecs = DS.sections.filter(s => s.stype === 'rh' || s.stype === 'ph');
    const footerSecs = DS.sections.filter(s => s.stype === 'pf' || s.stype === 'rf');
    const usableH    = scaledPageH
      - headerSecs.reduce((a, s) => a + RF.Geometry.scale(s.height), 0)
      - footerSecs.reduce((a, s) => a + RF.Geometry.scale(s.height), 0);
    const detailSecs = DS.sections.filter(s => s.iterates);

    for (const sec of headerSecs) addBand(_renderBand(sec, null, false, data, null), sec.height);

    const dataRows = items.length > 0 ? items : [{ _empty: true }];
    for (let ri = 0; ri < dataRows.length; ri++) {
      const rowData = dataRows[ri];
      const alt = ri % 2 === 1;
      for (const sec of detailSecs) {
        if (needsNewPage(sec.height)) {
          for (const fs of footerSecs.filter(s => s.stype === 'pf'))
            addBand(_renderBand(fs, null, false, data, null), fs.height);
          closePage(false);
          openPage();
          for (const hs of headerSecs.filter(s => s.stype === 'ph'))
            addBand(_renderBand(hs, null, false, data, null), hs.height);
        }
        addBand(_renderBand(sec, rowData, alt, data, ri), sec.height);
      }
    }
    for (const sec of footerSecs) addBand(_renderBand(sec, null, false, data, null), sec.height);
    closePage(true);
    return html;
  }

  // ── Show / Hide / Refresh ────────────────────────────────────────
  function show() {
    _assertZoomContract(DS.zoom, 'PreviewEngineV19.show.zoom');
    const t0  = performance.now();
    const ws  = document.getElementById('workspace');
    if (ws) _sc = { x: ws.scrollLeft, y: ws.scrollTop };
    const applyPreviewChrome = () => {
      const cl  = document.getElementById('canvas-layer');
      if (cl) cl.classList.add('preview-mode');
      DS.zoomDesign = DS.zoom;
      document.body.setAttribute('data-render-mode', 'preview');
      document.getElementById('tab-preview')?.classList.add('active');
      document.getElementById('tab-design')?.classList.remove('active');
      DS.previewMode = true;
    };
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyPreviewChrome, 'PreviewEngineV19.show');
    } else {
      applyPreviewChrome();
    }
    refresh();
    if (typeof PreviewZoomEngine !== 'undefined') PreviewZoomEngine.set(DS.previewZoom || 1.0);
    if (typeof ZoomWidget        !== 'undefined') ZoomWidget.sync();

    _active = true;
    console.debug(`[PreviewEngineV19] ON in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function hide() {
    _assertZoomContract(DS.zoom, 'PreviewEngineV19.hide.zoom');
    const t0 = performance.now();
    const applyDesignChrome = () => {
      const cl = document.getElementById('canvas-layer');
      if (cl) cl.classList.remove('preview-mode');
      DS.zoomPreview = DS.zoom;
      document.body.removeAttribute('data-render-mode');
      document.getElementById('tab-design')?.classList.add('active');
      document.getElementById('tab-preview')?.classList.remove('active');
      const ws = document.getElementById('workspace');
      if (ws) { ws.scrollLeft = _sc.x; ws.scrollTop = _sc.y; }
      DS.previewMode = false;
    };
    if (typeof DesignZoomEngine !== 'undefined') DesignZoomEngine.set(DS.zoomDesign);
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.flushSync(applyDesignChrome, 'PreviewEngineV19.hide');
    } else {
      applyDesignChrome();
    }
    if (typeof ZoomWidget !== 'undefined') ZoomWidget.sync();
    if (typeof OverlayEngine !== 'undefined') OverlayEngine.render();

    _active = false;
    console.debug(`[PreviewEngineV19] OFF in ${(performance.now() - t0).toFixed(1)}ms`);
  }

  function refresh() {
    _assertSelectionState('PreviewEngineV19.refresh.selection');
    _assertZoomContract(DS.zoom, 'PreviewEngineV19.refresh.zoom');
    if (typeof RenderScheduler !== 'undefined' && !RenderScheduler.allowsDomWrite()) {
      RenderScheduler.post(() => refresh(), 'PreviewEngineV19.refresh');
      return;
    }
    if (typeof RenderScheduler !== 'undefined') {
      RenderScheduler.assertDomWriteAllowed('PreviewEngineV19.refresh');
    }
    const content = document.getElementById('preview-content');
    if (!content) return;
    const scaledW = RF.Geometry.scale(CFG.PAGE_W);
    content.style.width    = scaledW + 'px';
    content.style.maxWidth = 'none';
    const data = (typeof DS !== 'undefined' && DS._sampleData)
              || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    content.innerHTML = _renderWithData(data);
    if (typeof SelectionEngine !== 'undefined' && typeof SelectionEngine.renderHandles === 'function') {
      SelectionEngine.renderHandles();
    }
  }

  return {
    show, hide, toggle() { _active ? hide() : show(); }, refresh,
    isActive() { return _active; },

    // Internal rendering API (exposed for registry consumers)
    _renderWithData, _renderBand, _renderSectionData,
    _renderElementData, _renderInstanceElement, _buildCSS,

    getMetrics() {
      const content = document.getElementById('preview-content');
      return {
        active:   _active,
        scaledW:  RF.Geometry.scale(CFG.PAGE_W),
        scaledH:  RF.Geometry.scale(typeof DS !== 'undefined' ? DS.getTotalHeight() : 0),
        contentW: content ? parseFloat(content.style.width) : 0,
      };
    },
  };
})();

if (typeof module !== 'undefined') module.exports = PreviewEngineV19;
