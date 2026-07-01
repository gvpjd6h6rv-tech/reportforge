'use strict';
/**
 * FormatBordersTab
 *
 * Single responsibility: render the "Bordes" tab UI inside the Format Editor modal.
 * Reads and writes only draft.borders.
 * No DOM persistence. No DS. No save logic.
 *
 * API:
 *   render(container, draft)  → builds UI into container, binds events to draft.borders
 */
(function initFormatBordersTab(global) {

  const SIDES = [
    { key: 'top',    label: 'Borde superior' },
    { key: 'right',  label: 'Borde derecho' },
    { key: 'bottom', label: 'Borde inferior' },
    { key: 'left',   label: 'Borde izquierdo' },
  ];

  function _row(label, control) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;gap:6px;';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'width:140px;font-size:10px;color:#333;flex-shrink:0;';
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(control);
    return row;
  }

  function _checkbox(id, checked) {
    const inp = document.createElement('input');
    inp.type = 'checkbox';
    inp.id = id;
    inp.checked = !!checked;
    inp.style.cssText = 'margin:0;';
    return inp;
  }

  function _previewBox(cfg) {
    const box = document.createElement('div');
    box.style.cssText = [
      'width:60px;height:30px;background:#f9f9f9;display:inline-block;',
      'box-sizing:border-box;margin-left:12px;',
    ].join('');
    const style = cfg.style || 'solid';
    const color = cfg.color || '#000000';
    box.style.borderTop    = cfg.top    ? '1px ' + style + ' ' + color : 'none';
    box.style.borderRight  = cfg.right  ? '1px ' + style + ' ' + color : 'none';
    box.style.borderBottom = cfg.bottom ? '1px ' + style + ' ' + color : 'none';
    box.style.borderLeft   = cfg.left   ? '1px ' + style + ' ' + color : 'none';
    return box;
  }

  function render(container, draft) {
    container.innerHTML = '';
    if (!draft.borders) {
      draft.borders = { top: false, right: false, bottom: false, left: false, style: 'solid', color: '#000000' };
    }
    const cfg = draft.borders;

    const checkboxes = {};
    SIDES.forEach(function(side) {
      const cb = _checkbox('fmt-brd-' + side.key, cfg[side.key]);
      checkboxes[side.key] = cb;
      container.appendChild(_row(side.label + ':', cb));
    });

    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid #ccc;margin:8px 0;';
    container.appendChild(sep);

    const styleRow = document.createElement('div');
    styleRow.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;gap:6px;';
    const styleLbl = document.createElement('span');
    styleLbl.style.cssText = 'width:140px;font-size:10px;color:#333;flex-shrink:0;';
    styleLbl.textContent = 'Estilo:';
    const styleSelEl = document.createElement('select');
    styleSelEl.id = 'fmt-brd-style';
    styleSelEl.style.cssText = 'font-size:10px;padding:1px 3px;width:80px;';
    ['solid'].forEach(function(s) {
      const o = document.createElement('option');
      o.value = s; o.textContent = s;
      if (s === cfg.style) o.selected = true;
      styleSelEl.appendChild(o);
    });
    styleRow.appendChild(styleLbl); styleRow.appendChild(styleSelEl);
    container.appendChild(styleRow);

    const colorRow = document.createElement('div');
    colorRow.style.cssText = 'display:flex;align-items:center;margin-bottom:6px;gap:6px;';
    const colorLbl = document.createElement('span');
    colorLbl.style.cssText = 'width:140px;font-size:10px;color:#333;flex-shrink:0;';
    colorLbl.textContent = 'Color:';
    const colorInp = document.createElement('input');
    colorInp.type = 'color';
    colorInp.id = 'fmt-brd-color';
    colorInp.value = cfg.color || '#000000';
    colorInp.style.cssText = 'width:36px;height:20px;padding:0;border:none;cursor:pointer;';
    colorRow.appendChild(colorLbl); colorRow.appendChild(colorInp);
    container.appendChild(colorRow);

    const prevSep = document.createElement('div');
    prevSep.style.cssText = 'border-top:1px solid #ccc;margin:8px 0;';
    container.appendChild(prevSep);

    const prevLabel = document.createElement('div');
    prevLabel.style.cssText = 'font-size:9px;color:#666;margin-bottom:4px;';
    prevLabel.textContent = 'Vista previa:';
    container.appendChild(prevLabel);

    let prevBox = _previewBox(cfg);
    container.appendChild(prevBox);

    function _sync() {
      SIDES.forEach(function(side) {
        cfg[side.key] = checkboxes[side.key].checked;
      });
      cfg.style = styleSelEl.value;
      cfg.color = colorInp.value;
      const newBox = _previewBox(cfg);
      container.replaceChild(newBox, prevBox);
      prevBox = newBox;
    }

    SIDES.forEach(function(side) {
      checkboxes[side.key].addEventListener('change', _sync);
    });
    styleSelEl.addEventListener('change', _sync);
    colorInp.addEventListener('input', _sync);
  }

  global.FormatBordersTab = { render };
  if (typeof module !== 'undefined') module.exports = { render };

})(typeof window !== 'undefined' ? window : globalThis);
