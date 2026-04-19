'use strict';

(function initPreviewEngineData(global) {
  const C = global.PreviewEngineContracts;

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

  function renderBand(sec, rowData, alt, rootData, rowIndex) {
    const cls = alt ? ' pv-section-bg-alt' : '';
    const ri = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const inner = DS.elements
      .filter((e) => e.sectionId === sec.id)
      .map((el) => global.PreviewEngineData.renderInstanceElement(el, rowData, rootData, rowIndex))
      .join('');
    return `<div class="pv-section${cls}" data-section-id="${sec.id}" style="height:${RF.Geometry.scale(sec.height)}px;width:${RF.Geometry.scale(CFG.PAGE_W)}px"${ri}>${inner}</div>`;
  }

  function renderSectionData(sec, itemData, altRow, rootData) {
    const els = DS.elements.filter((e) => e.sectionId === sec.id);
    const inner = els.map((el) => global.PreviewEngineData.renderElement(el, itemData, rootData)).join('');
    const bg = altRow ? 'background:#FAFAF8' : '';
    return `<div class="pv-section" style="position:relative;height:${RF.Geometry.scale(sec.height)}px;width:${RF.Geometry.scale(CFG.PAGE_W)}px;${bg};border-bottom:1px solid #EEE;overflow:hidden">${inner}</div>`;
  }

  function renderElement(el, itemData, rootData) {
    C.assertLayoutContract(el, 'PreviewEngineV19._renderElementData');
    const data = rootData || (typeof DS !== 'undefined' && DS._sampleData) || (typeof SAMPLE_DATA !== 'undefined' ? SAMPLE_DATA : {});
    let value = '';
    if (el.type === 'field' && el.fieldPath) {
      const raw = (typeof resolveField !== 'undefined') ? resolveField(el.fieldPath, data, itemData) : _resolveField(el.fieldPath, data, itemData);
      value = (typeof formatValue !== 'undefined') ? formatValue(raw, el.fieldFmt) : _formatValue(raw, el.fieldFmt);
    } else {
      value = el.content || '';
    }

    const r = RF.Geometry.rectToView(el);
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
      const lc = el.borderColor === 'transparent' ? '#000' : el.borderColor;
      const mid = Math.max(r.height / 2, 1);
      return `<div style="${st};background:transparent"><svg style="overflow:visible" width="${r.width}" height="${Math.max(r.height, 2)}"><line x1="0" y1="${mid}" x2="${r.width}" y2="${mid}" stroke="${lc}" stroke-width="${RF.Geometry.scale(el.lineWidth || 1)}"/></svg></div>`;
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
      value = el.content || '';
    }
    const ri = rowIndex !== null ? ` data-row-index="${rowIndex}"` : '';
    const r = RF.Geometry.rectToView(el);
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
    const corners = '<span class="el-corner tl"></span><span class="el-corner tr"></span><span class="el-corner bl"></span><span class="el-corner br"></span>';
    return `<div class="pv-el cr-element" data-id="${el.id}" data-origin-id="${el.id}" data-type="${el.type}"${ri} style="${st}">${corners}${value}</div>`;
  }

  function renderWithData(data) {
    const items = data.items || [];
    const pageW = CFG.PAGE_W;
    const pageH = 1122;
    const scaledPageW = RF.Geometry.scale(pageW);
    const scaledPageH = RF.Geometry.scale(pageH);
    let html = '', currentPageH = 0, pageNum = 1, pageContent = '';

    const openPage = () => { pageContent = ''; currentPageH = 0; };
    const closePage = (isLast) => {
      html += `<div class="pv-page" data-page="${pageNum}" style="width:${scaledPageW}px;min-height:${currentPageH}px">${pageContent}</div>`;
      if (!isLast) html += `<div class="pv-page-break"><span>— Página ${pageNum} de ${pageNum + 1} —</span></div>`;
      pageNum++;
    };
    const addBand = (bandHtml, height) => { pageContent += bandHtml; currentPageH += height; };
    const needsNewPage = (h) => currentPageH + h > scaledPageH && currentPageH > 0;

    openPage();
    const headerSecs = DS.sections.filter((s) => s.stype === 'rh' || s.stype === 'ph');
    const footerSecs = DS.sections.filter((s) => s.stype === 'pf' || s.stype === 'rf');
    const usableH = scaledPageH
      - headerSecs.reduce((a, s) => a + RF.Geometry.scale(s.height), 0)
      - footerSecs.reduce((a, s) => a + RF.Geometry.scale(s.height), 0);
    const detailSecs = DS.sections.filter((s) => s.iterates);

    for (const sec of headerSecs) addBand(renderBand(sec, null, false, data, null), sec.height);

    const dataRows = items.length > 0 ? items : [{ _empty: true }];
    for (let ri = 0; ri < dataRows.length; ri++) {
      const rowData = dataRows[ri];
      const alt = ri % 2 === 1;
      for (const sec of detailSecs) {
        if (needsNewPage(sec.height)) {
          for (const fs of footerSecs.filter((s) => s.stype === 'pf')) addBand(renderBand(fs, null, false, data, null), fs.height);
          closePage(false);
          openPage();
          for (const hs of headerSecs.filter((s) => s.stype === 'ph')) addBand(renderBand(hs, null, false, data, null), hs.height);
        }
        addBand(renderBand(sec, rowData, alt, data, ri), sec.height);
      }
    }
    for (const sec of footerSecs) addBand(renderBand(sec, null, false, data, null), sec.height);
    closePage(true);
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
