'use strict';

(function initPreviewEngineData(global) {
  const C = global.PreviewEngineContracts;

  function _marginMm(side) {
    try {
      if (typeof DS !== 'undefined' && DS.margins && Number.isFinite(DS.margins[side])) return DS.margins[side];
      if (typeof CFG !== 'undefined' && CFG.margins && Number.isFinite(CFG.margins[side])) return CFG.margins[side];
    } catch (_e) { /* fall through */ }
    return 0;
  }

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
    if (fmt === 'number') return parseFloat(v).toFixed(2);
    return String(v);
  }

  function _hitLayerInteractionStyle(el) {
    const zIndex = Number.isFinite(Number(el.zIndex)) ? Number(el.zIndex) : (el.type === 'rect' ? 0 : 1);
    const pointerEvents = el.type === 'rect' && el.bgColor === 'transparent' ? 'none' : 'auto';
    return { zIndex, pointerEvents };
  }

  function renderBand(sec, rowData, alt, rootData, rowIndex) {
    const cls = alt ? ' pv-section-bg-alt' : '';
    const ri = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const inner = DS.elements
      .filter((e) => e.sectionId === sec.id)
      .map((el) => global.PreviewEngineData.renderInstanceElement(el, rowData, rootData, rowIndex))
      .join('');
    return `<div class="pv-section${cls}" data-section-id="${sec.id}" style="position:relative;height:${sec.height}px;width:${CFG.PAGE_W}px;border-bottom:1px solid #DDD;box-sizing:border-box"${ri}>${inner}</div>`;
  }

  function renderSectionData(sec, itemData, altRow, rootData) {
    const els = DS.elements.filter((e) => e.sectionId === sec.id);
    const inner = els.map((el) => global.PreviewEngineData.renderElement(el, itemData, rootData)).join('');
    const bg = altRow ? 'background:#FAFAF8' : '';
    return `<div class="pv-section" style="position:relative;height:${sec.height}px;width:${CFG.PAGE_W}px;${bg};border-bottom:1px solid #EEE;overflow:hidden">${inner}</div>`;
  }

  function renderElement(el, itemData, rootData) {
    C.assertLayoutContract(el, 'PreviewEngineV19._renderElementData');
    const data = rootData || (typeof DS !== 'undefined' && DS._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value = '';
    if (el.type === 'field' && el.fieldPath) {
      const raw = (typeof resolveField !== 'undefined') ? resolveField(el.fieldPath, data, itemData) : _resolveField(el.fieldPath, data, itemData);
      value = (typeof formatValue !== 'undefined') ? formatValue(raw, el.fieldFmt) : _formatValue(raw, el.fieldFmt);
    } else {
      value = (el.content !== null && el.content !== undefined) ? el.content : '';
    }

    const r = { left: el.x, top: el.y, width: el.w, height: el.h };
    const fs = el.fontSize * 96 / 72;
    const interaction = _hitLayerInteractionStyle(el);
    const st = [
      `position:absolute`, `left:${r.left}px`, `top:${r.top}px`,
      `width:${r.width}px`, `height:${r.height}px`,
      `z-index:${interaction.zIndex}`,
      `pointer-events:${interaction.pointerEvents}`,
      `font-family:${el.fontFamily}`, `font-size:${fs}px`,
      `font-weight:${el.bold ? 'bold' : 'normal'}`,
      `font-style:${el.italic ? 'italic' : 'normal'}`,
      `text-decoration:${el.underline ? 'underline' : 'none'}`,
      `text-align:${el.align}`, `color:${el.color}`,
      `overflow:hidden`, `display:flex`, `align-items:center`, `line-height:1`,
    ].join(';');

    if (el.type === 'line') {
      const lc = el.borderColor === 'transparent' ? '#000' : el.borderColor;
      const mid = Math.max(r.height / 2, 1);
      return `<div style="${st};background:transparent"><svg style="overflow:visible" width="${r.width}" height="${Math.max(r.height, 2)}"><line x1="0" y1="${mid}" x2="${r.width}" y2="${mid}" stroke="${lc}" stroke-width="${el.lineWidth || 1}"/></svg></div>`;
    }
    if (el.type === 'rect') {
      const bg = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
      const brd = el.borderWidth > 0 ? `border:${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
      return `<div style="${st};background:${bg};${brd}"></div>`;
    }
    const bg = el.bgColor === 'transparent' ? 'transparent' : el.bgColor;
    const brd = el.borderWidth > 0 ? `;border:${el.borderWidth}px ${el.borderStyle} ${el.borderColor}` : '';
    const esc = String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div style="${st};background:${bg}${brd};padding:0 2px"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${esc}</span></div>`;
  }

  function renderInstanceElement(el, rowData, rootData, rowIndex) {
    C.assertLayoutContract(el, 'PreviewEngineV19._renderInstanceElement');
    const data = rootData || (typeof DS !== 'undefined' && DS._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value = '';
    if (el.type === 'field' && el.fieldPath) {
      const raw = (typeof resolveField !== 'undefined') ? resolveField(el.fieldPath, data, rowData) : _resolveField(el.fieldPath, data, rowData);
      value = (typeof formatValue !== 'undefined') ? formatValue(raw, el.fieldFmt) : _formatValue(raw, el.fieldFmt);
    } else {
      value = (el.content !== null && el.content !== undefined) ? el.content : '';
    }
    const ri = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const r = { left: el.x, top: el.y, width: el.w, height: el.h };
    const fs = el.fontSize * 96 / 72;
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
    const corners = '<span class="el-corner tl"></span><span class="el-corner tr"></span><span class="el-corner bl"></span><span class="el-corner br"></span>';
    return `<div class="pv-el cr-element" data-id="${el.id}" data-origin-id="${el.id}" data-type="${el.type}"${ri} style="${st}">${corners}${value}</div>`;
  }

  // Mirror of advanced_engine.element_renderers._calc_h / calc_row_height.
  // Keeps hit-layer row heights identical to render-layer so pagination matches.
  const _PT_PX = 1.333, _CHAR_PX = 0.6;
  function _calcElH(el, value) {
    if (value === null || value === undefined || value === '') return el.h;
    const cw = Math.max(1, Math.trunc(el.w / Math.max(0.01, el.fontSize * _PT_PX * _CHAR_PX)));
    const lh = Math.trunc(el.fontSize * _PT_PX * 1.4);
    const txt = String(value).replace(/<[^>]+>/g, '');
    return Math.max(el.h, Math.max(1, Math.ceil(txt.length / cw)) * lh + 4);
  }
  function _rowHeight(sec, rowData, data) {
    const base = Math.round(Number(sec.height) || 0);
    let extra = 0;
    for (const el of DS.elements.filter((e) => e.sectionId === sec.id)) {
      if (!el.canGrow) continue;
      let value = '';
      if (el.type === 'field' && el.fieldPath) {
        const raw = _resolveField(el.fieldPath, data, rowData);
        value = _formatValue(raw, el.fieldFmt);
      } else {
        value = (el.content !== null && el.content !== undefined) ? el.content : '';
      }
      extra = Math.max(extra, _calcElH(el, value) - el.h);
    }
    return base + extra;
  }

  function renderWithData(data) {
    const items = data.items || [];
    const pageW = CFG.PAGE_W;

    const rhSecs = DS.sections.filter((s) => s.stype === 'rh');
    const phSecs = DS.sections.filter((s) => s.stype === 'ph');
    const pfSecs = DS.sections.filter((s) => s.stype === 'pf');
    const rfSecs = DS.sections.filter((s) => s.stype === 'rf');
    const detailSecs = DS.sections.filter((s) => s.iterates);

    // Body rows in document order: for each data row, one row per detail section.
    // Mirrors advanced_engine._body_rows ordering (item-major, section-minor).
    const dataRows = items.length > 0 ? items : [{ _empty: true }];
    const bodyRows = [];
    for (let ri = 0; ri < dataRows.length; ri++) {
      for (const sec of detailSecs) {
        const rh = _rowHeight(sec, dataRows[ri], data);
        bodyRows.push({
          sec,
          rowData: dataRows[ri],
          rowIndex: ri,
          alt: ri % 2 === 1,
          height: rh,
          forceBreak: !!sec.newPageBefore,
        });
      }
    }

    // Pagination via SSOT (shared with render-layer contract).
    const metrics = {
      pageH: (typeof CFG !== 'undefined' && Number.isFinite(CFG.PAGE_H)) ? CFG.PAGE_H : 1123,
      marginTopMm: _marginMm('top'),
      marginBottomMm: _marginMm('bottom'),
    };
    const plan = global.PreviewPaginationEngine.paginate(
      DS.sections, bodyRows.map((r) => ({ height: r.height, forceBreak: r.forceBreak })), metrics
    );

    let html = '';
    for (const page of plan.pages) {
      let currentPageH = 0;
      let pageContent = '';
      const addBand = (bandHtml, height) => { pageContent += bandHtml; currentPageH += height; };

      if (page.first) for (const sec of rhSecs) addBand(renderBand(sec, null, false, data, null), sec.height);
      for (const sec of phSecs) addBand(renderBand(sec, null, false, data, null), sec.height);
      for (let i = page.rowStart; i < page.rowEnd; i++) {
        const r = bodyRows[i];
        addBand(renderBand(r.sec, r.rowData, r.alt, data, r.rowIndex), r.height);
      }
      if (page.last) for (const sec of rfSecs) addBand(renderBand(sec, null, false, data, null), sec.height);
      for (const sec of pfSecs) addBand(renderBand(sec, null, false, data, null), sec.height);

      html += `<div class="pv-page" data-page="${page.index + 1}" style="width:${pageW}px;min-height:${currentPageH}px">${pageContent}</div>`;
      if (!page.last) {
        html += `<div class="pv-page-break"><span>— Página ${page.index + 1} de ${plan.totalPages} —</span></div>`;
      }
    }
    return html;
  }

  global.PreviewEngineData = {
    resolveField: _resolveField,
    formatValue: _formatValue,
    renderBand,
    renderSectionData,
    renderElement,
    renderInstanceElement,
    renderWithData,
  };
})(window);
