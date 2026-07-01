'use strict';

/**
 * ColorPickerAdapter v4 — Crystal Reports-style integrated color picker.
 *
 * Single modal. No native OS color dialog. No own conversion math (uses ColorConverter).
 *
 * State contract:
 *   _initialColor — color when dialog was opened; never changes during session
 *   _draftColor   — color being edited; NEVER applied until Seleccionar
 *
 * Seleccionar → calls onSelect(hex|"transparent") once → caller calls applyFormat
 * Cancelar    → close() only; onSelect NOT called; element unchanged
 * "Agregar"   → adds draftColor to CustomColorStore; does NOT apply to element
 *
 * API:
 *   ColorPickerAdapter.open(currentHex, onSelect, opts)
 *     opts.allowTransparent — show Transparente checkbox (default false)
 */
(function initColorPickerAdapter(global) {

  // DOM refs (lazy-built on first open)
  let _backdrop      = null;
  let _colorArea     = null;   // big 2D gradient square
  let _areaCursor    = null;   // dot inside color area
  let _hueBar        = null;   // vertical rainbow bar
  let _hueCursor     = null;   // cursor on hue bar
  let _preview       = null;
  let _hexInput      = null;
  let _hInput        = null;   // Matiz
  let _sInput        = null;   // Sat
  let _lInput        = null;   // Lum
  let _rInput        = null;
  let _gInput        = null;
  let _bInput        = null;
  let _customGrid    = null;
  let _transparentCk  = null;
  let _transparentRow = null;

  // State
  let _onSelect      = null;
  let _draftHex      = '#000000';
  let _draftH        = 0;
  let _draftS        = 0;
  let _draftL        = 0;
  let _huePercent    = 0;   // visual bar position 0..1; kept separate from _draftH to prevent wrap
  let _initialColor  = '#000000';
  let _isTransparent = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _el(tag, css, text) {
    const n = document.createElement(tag);
    if (css) n.style.cssText = css;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  // ── Draft state setters (single source of truth) ──────────────────────────

  function _setDraftFromHsl(h, s, l, source) {
    _draftH = global.ColorConverter.clampHue(h);
    _draftS = global.ColorConverter.clampPercent(s);
    _draftL = global.ColorConverter.clampPercent(l);
    _draftHex = global.ColorConverter.hslToHex(_draftH, _draftS, _draftL);
    _huePercent = _draftH / 360;
    _updateUI(source);
  }

  function _setDraftFromRgb(r, g, b, source) {
    r = global.ColorConverter.clampRgb(r);
    g = global.ColorConverter.clampRgb(g);
    b = global.ColorConverter.clampRgb(b);
    _draftHex = global.ColorConverter.rgbToHex(r, g, b);
    const hsl = global.ColorConverter.rgbToHsl(r, g, b);
    _draftH = hsl.h; _draftS = hsl.s; _draftL = hsl.l;
    _huePercent = _draftH / 360;
    _updateUI(source);
  }

  function _setDraftFromHex(hex, source) {
    const norm = global.ColorConverter.normalizeHex(hex);
    if (!norm) return;
    _draftHex = norm;
    const rgb = global.ColorConverter.hexToRgb(norm);
    const hsl = global.ColorConverter.rgbToHsl(rgb.r, rgb.g, rgb.b);
    _draftH = hsl.h; _draftS = hsl.s; _draftL = hsl.l;
    _huePercent = _draftH / 360;
    _updateUI(source);
  }

  // ── UI sync (skip updating the input that triggered the change) ────────────

  function _updateColorAreaGradient() {
    // Base hue at full saturation and mid lightness, then overlays for S/L space
    _colorArea.style.background = [
      'linear-gradient(to top, #000 0%, transparent 50%, #fff 100%)',
      'linear-gradient(to right, hsl(' + _draftH + ',0%,50%), hsl(' + _draftH + ',100%,50%))',
    ].join(', ');
  }

  function _updateAreaCursor() {
    // X = saturation (0=left, 100=right), Y = lightness inverted (100=top, 0=bottom)
    const rect = _colorArea.getBoundingClientRect();
    const w = rect.width || 200;
    const h = rect.height || 200;
    const x = (_draftS / 100) * w;
    const y = (1 - _draftL / 100) * h;
    _areaCursor.style.left = x + 'px';
    _areaCursor.style.top  = y + 'px';
  }

  function _updateHueCursor() {
    const rect = _hueBar.getBoundingClientRect();
    const h = rect.height || 200;
    _hueCursor.style.top = _huePercent * h + 'px';
  }

  function _updateUI(source) {
    // Color area gradient (always updates when hue changes)
    _updateColorAreaGradient();
    _updateAreaCursor();
    _updateHueCursor();

    // Preview
    _preview.style.backgroundColor = _draftHex;
    _preview.style.backgroundImage = 'none';

    // Inputs (skip the source to avoid caret jump)
    if (source !== 'hex') _hexInput.value = _draftHex;

    const rgb = global.ColorConverter.hexToRgb(_draftHex) || { r: 0, g: 0, b: 0 };
    if (source !== 'hsl-h') _hInput.value = Math.round(_draftH);
    if (source !== 'hsl-s') _sInput.value = Math.round(_draftS);
    if (source !== 'hsl-l') _lInput.value = Math.round(_draftL);
    if (source !== 'rgb-r') _rInput.value = rgb.r;
    if (source !== 'rgb-g') _gInput.value = rgb.g;
    if (source !== 'rgb-b') _bInput.value = rgb.b;
  }

  function _showTransparentUI() {
    _preview.style.backgroundColor = 'transparent';
    _preview.style.backgroundImage =
      'repeating-conic-gradient(#aaa 0% 25%,#fff 0% 50%)';
    _preview.style.backgroundSize = '8px 8px';
    _hexInput.value = '';
    _hInput.value = ''; _sInput.value = ''; _lInput.value = '';
    _rInput.value = ''; _gInput.value = ''; _bInput.value = '';
  }

  function _setInputsEnabled(enabled) {
    [_hexInput, _hInput, _sInput, _lInput, _rInput, _gInput, _bInput].forEach(el => {
      if (el) el.disabled = !enabled;
    });
  }

  // ── Rebuild custom color grid ─────────────────────────────────────────────

  function _refreshCustomGrid() {
    _customGrid.innerHTML = '';
    const colors = global.CustomColorStore.getColors();
    colors.forEach(c => {
      const sw = _el('div',
        'width:18px;height:18px;border:1px solid #aaa;box-sizing:border-box');
      if (c) {
        sw.style.backgroundColor = c;
        sw.style.cursor = 'pointer';
        sw.title = c;
        sw.addEventListener('click', () => {
          if (!_isTransparent) _setDraftFromHex(c, null);
        });
      } else {
        sw.style.backgroundImage =
          'repeating-conic-gradient(#ddd 0% 25%,#fff 0% 50%)';
        sw.style.backgroundSize = '6px 6px';
        sw.style.cursor = 'default';
      }
      _customGrid.appendChild(sw);
    });
  }

  // ── Pointer helpers for color area and hue bar ────────────────────────────

  function _pctFromEvent(e, el) {
    const rect = el.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const x = Math.max(0, Math.min(rect.width,  clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
    return { px: x / rect.width, py: y / rect.height };
  }

  function _bindDrag(el, onMove) {
    let active = false;
    function start(e) {
      e.preventDefault();
      active = true;
      onMove(e);
    }
    function move(e) {
      if (!active) return;
      e.preventDefault();
      onMove(e);
    }
    function end() { active = false; }
    el.addEventListener('mousedown', start);
    el.addEventListener('touchstart', start, { passive: false });
    document.addEventListener('mousemove', move);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('mouseup', end);
    document.addEventListener('touchend', end);
  }

  // ── Accept / Close ─────────────────────────────────────────────────────────

  function _accept() {
    if (_onSelect) _onSelect(_isTransparent ? 'transparent' : (_draftHex || '#000000'));
    close();
  }

  function close() {
    if (_backdrop) _backdrop.style.display = 'none';
    _onSelect = null;
  }

  function _onKey(e) {
    if (!_backdrop || _backdrop.style.display === 'none') return;
    if (e.key === 'Escape') close();
  }

  // ── Build dialog (once, lazily) ────────────────────────────────────────────

  function _build() {
    _backdrop = _el('div', [
      'position:fixed;inset:0;background:rgba(0,0,0,.35);z-index:9200',
      'display:none;align-items:center;justify-content:center',
    ].join(';'));
    _backdrop.id = 'rf-color-backdrop';

    const dlg = _el('div', [
      'background:#f0ede8;border:2px solid #888;border-radius:3px',
      'box-shadow:2px 4px 14px rgba(0,0,0,.5)',
      'font-family:Arial,sans-serif;font-size:12px;user-select:none',
    ].join(';'));
    dlg.id = 'rf-color-dialog';

    // ── Title bar ─────────────────────────────────────────────────────────
    const titleBar = _el('div', [
      'background:#3C5A9A;color:#fff;padding:5px 9px;font-weight:bold;font-size:11px',
      'display:flex;justify-content:space-between;align-items:center',
    ].join(';'), 'Color');
    const closeBtn = _el('button',
      'background:none;border:none;color:#fff;cursor:pointer;font-size:13px;padding:0 2px;line-height:1', '✕');
    closeBtn.title = 'Cerrar';
    closeBtn.addEventListener('click', close);
    titleBar.appendChild(closeBtn);
    dlg.appendChild(titleBar);

    // ── Body ──────────────────────────────────────────────────────────────
    const body = _el('div', 'padding:10px 12px 6px;display:flex;gap:12px;align-items:flex-start');

    // ── LEFT column ───────────────────────────────────────────────────────
    const leftCol = _el('div', 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px');

    // Basic colors label + grid
    leftCol.appendChild(_el('div', 'color:#444;font-size:11px;font-weight:bold', 'Colores básicos:'));
    const basicGrid = _el('div',
      'display:grid;grid-template-columns:repeat(8,18px);gap:2px');
    basicGrid.id = 'rf-cp-basic-grid';
    global.ColorPaletteMap.BASIC.forEach(c => {
      const sw = _el('div',
        'width:18px;height:18px;border:1px solid #666;cursor:pointer;box-sizing:border-box');
      sw.style.backgroundColor = c;
      sw.title = c;
      sw.dataset.color = c;
      sw.addEventListener('click', () => {
        if (!_isTransparent) _setDraftFromHex(c, null);
      });
      basicGrid.appendChild(sw);
    });
    leftCol.appendChild(basicGrid);

    // Custom colors label + grid
    leftCol.appendChild(_el('div', 'color:#444;font-size:11px;font-weight:bold', 'Colores personalizados:'));
    _customGrid = _el('div', 'display:grid;grid-template-columns:repeat(8,18px);gap:2px');
    _customGrid.id = 'rf-cp-custom-grid';
    leftCol.appendChild(_customGrid);

    // "Agregar" button
    const addBtn = _el('button', [
      'padding:3px 6px;cursor:pointer;border:1px solid #888',
      'background:#ddd;border-radius:2px;font-size:11px;white-space:nowrap',
    ].join(';'), 'Agregar a colores personalizados');
    addBtn.id = 'rf-cp-add-btn';
    addBtn.addEventListener('click', () => {
      if (!_isTransparent && _draftHex) {
        global.CustomColorStore.addColor(_draftHex);
        _refreshCustomGrid();
      }
    });
    leftCol.appendChild(addBtn);

    body.appendChild(leftCol);

    // ── RIGHT column ──────────────────────────────────────────────────────
    const rightCol = _el('div', 'flex:0 0 auto;display:flex;flex-direction:column;gap:6px');

    // Color area row: [color-area] [hue-bar]
    const areaRow = _el('div', 'display:flex;gap:6px;align-items:stretch');

    // Color area (2D gradient)
    const colorAreaWrap = _el('div', 'position:relative;width:200px;height:200px;flex-shrink:0');
    _colorArea = _el('div', [
      'position:absolute;inset:0;cursor:crosshair',
      'border:1px solid #888;border-radius:2px;box-sizing:border-box',
    ].join(';'));
    _colorArea.id = 'rf-cp-color-area';
    _areaCursor = _el('div', [
      'position:absolute;width:10px;height:10px;border-radius:50%',
      'border:2px solid #fff;box-shadow:0 0 0 1px #000;',
      'transform:translate(-50%,-50%);pointer-events:none',
    ].join(';'));
    _areaCursor.id = 'rf-cp-area-cursor';
    colorAreaWrap.appendChild(_colorArea);
    colorAreaWrap.appendChild(_areaCursor);
    areaRow.appendChild(colorAreaWrap);

    // Hue bar (vertical rainbow) — bar on LEFT 20px, left-pointing arrow on RIGHT 12px
    const hueBarWrap = _el('div', 'position:relative;width:32px;height:200px;flex-shrink:0');
    _hueBar = _el('div', [
      'position:absolute;left:0;right:12px;top:0;bottom:0;cursor:ns-resize',
      'border:1px solid #888;border-radius:2px;box-sizing:border-box',
      'background:linear-gradient(to bottom,',
      'hsl(0,100%,50%),hsl(30,100%,50%),hsl(60,100%,50%),hsl(90,100%,50%),',
      'hsl(120,100%,50%),hsl(150,100%,50%),hsl(180,100%,50%),hsl(210,100%,50%),',
      'hsl(240,100%,50%),hsl(270,100%,50%),hsl(300,100%,50%),hsl(330,100%,50%),',
      'hsl(360,100%,50%))',
    ].join(''));
    _hueBar.id = 'rf-cp-hue-bar';
    // Left-pointing triangle (◀): tip at x=20 (bar's right edge), base at x=32 (wrapper edge)
    // pointer-events enabled so the user can drag the arrow directly
    _hueCursor = _el('div', [
      'position:absolute;right:0',
      'width:0;height:0',
      'border-top:7px solid transparent',
      'border-bottom:7px solid transparent',
      'border-right:12px solid #1a1a1a',
      'filter:drop-shadow(-1px 0 1px rgba(255,255,255,0.9))',
      'transform:translateY(-50%)',
      'cursor:ns-resize',
    ].join(';'));
    _hueCursor.id = 'rf-cp-hue-cursor';
    hueBarWrap.appendChild(_hueBar);
    hueBarWrap.appendChild(_hueCursor);
    areaRow.appendChild(hueBarWrap);
    rightCol.appendChild(areaRow);

    // Preview
    const prevRow = _el('div', 'display:flex;align-items:center;gap:6px');
    prevRow.appendChild(_el('span', 'width:90px;color:#555;font-size:11px;white-space:nowrap', 'Previsualización:'));
    _preview = _el('div', 'flex:1;height:26px;border:1px solid #888;border-radius:2px');
    _preview.id = 'rf-cp-preview';
    prevRow.appendChild(_preview);
    rightCol.appendChild(prevRow);

    // Input helper
    function _addRow(label, id, min, max, width) {
      const row = _el('div', 'display:flex;align-items:center;gap:6px');
      row.appendChild(_el('span', 'width:90px;text-align:right;color:#444;font-size:11px', label + ':'));
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = min; inp.max = max; inp.id = id;
      inp.style.cssText = 'width:' + (width || 56) + 'px;border:1px solid #888;padding:2px 4px;border-radius:2px;font-size:12px';
      row.appendChild(inp);
      rightCol.appendChild(row);
      return inp;
    }

    // HEX row
    const hexRow = _el('div', 'display:flex;align-items:center;gap:6px');
    hexRow.appendChild(_el('span', 'width:90px;text-align:right;color:#444;font-size:11px', 'HEX:'));
    _hexInput = document.createElement('input');
    _hexInput.type = 'text'; _hexInput.maxLength = 7; _hexInput.placeholder = '#000000';
    _hexInput.id = 'rf-cp-hex';
    _hexInput.style.cssText =
      'width:80px;font-family:monospace;font-size:12px;border:1px solid #888;padding:2px 5px;border-radius:2px';
    hexRow.appendChild(_hexInput);
    rightCol.appendChild(hexRow);

    // HSL inputs
    _hInput = _addRow('Matiz',  'rf-cp-h', 0, 360);
    _sInput = _addRow('Sat',    'rf-cp-s', 0, 100);
    _lInput = _addRow('Lum',    'rf-cp-l', 0, 100);

    // RGB inputs
    _rInput = _addRow('Rojo',   'rf-cp-r', 0, 255);
    _gInput = _addRow('Verde',  'rf-cp-g', 0, 255);
    _bInput = _addRow('Azul',   'rf-cp-b', 0, 255);

    // Transparent checkbox
    _transparentRow = _el('div', 'display:none;align-items:center;gap:6px');
    _transparentCk = document.createElement('input');
    _transparentCk.type = 'checkbox'; _transparentCk.id = '_rf_cp_transparent';
    const tLabel = _el('label', 'cursor:pointer;color:#444', 'Transparente');
    tLabel.htmlFor = '_rf_cp_transparent';
    _transparentRow.appendChild(_transparentCk);
    _transparentRow.appendChild(tLabel);
    rightCol.appendChild(_transparentRow);

    body.appendChild(rightCol);
    dlg.appendChild(body);

    // ── Footer ────────────────────────────────────────────────────────────
    const footer = _el('div', [
      'display:flex;justify-content:flex-end;gap:7px',
      'padding:7px 12px;border-top:1px solid #ccc;background:#e8e4df',
    ].join(';'));
    const cancelBtn = _el('button',
      'padding:3px 12px;cursor:pointer;border:1px solid #888;background:#ddd;border-radius:2px;font-size:12px',
      'Cancelar');
    const selectBtn = _el('button', [
      'padding:3px 12px;cursor:pointer;border:1px solid #3C5A9A',
      'background:#3C5A9A;color:#fff;border-radius:2px;font-size:12px;font-weight:bold',
    ].join(';'), 'Seleccionar');
    cancelBtn.addEventListener('click', close);
    selectBtn.addEventListener('click', _accept);
    footer.appendChild(cancelBtn);
    footer.appendChild(selectBtn);
    dlg.appendChild(footer);

    _backdrop.appendChild(dlg);
    document.body.appendChild(_backdrop);

    // ── Event wiring ──────────────────────────────────────────────────────

    // Color area drag: X=saturation, Y=lightness inverted
    _bindDrag(_colorArea, (e) => {
      if (_isTransparent) return;
      const { px, py } = _pctFromEvent(e, _colorArea);
      _setDraftFromHsl(_draftH, px * 100, (1 - py) * 100, 'area');
    });

    // Single source-of-truth: client Y → hue update.
    // Used by bar clicks, bar drags, AND arrow drags — one function, no duplication.
    // Stores percent directly so _updateHueCursor never back-calculates from hue % 360.
    function _updateHueFromClientY(clientY) {
      if (_isTransparent) return;
      const rect = _hueBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (clientY - rect.top) / (rect.height || 1)));
      _huePercent = percent;
      _draftH = Math.min(359.99, percent * 360);   // no modular wrap at bottom
      _draftHex = global.ColorConverter.hslToHex(_draftH, _draftS, _draftL);
      _updateUI('huebar');
    }

    // Shared drag state for hue bar + hue arrow
    let _hueDrag = false;
    function _hueStart(e) {
      e.preventDefault();
      _hueDrag = true;
      _updateHueFromClientY(e.touches ? e.touches[0].clientY : e.clientY);
    }
    function _hueMove(e) {
      if (!_hueDrag) return;
      e.preventDefault();
      _updateHueFromClientY(e.touches ? e.touches[0].clientY : e.clientY);
    }
    function _hueEnd() { _hueDrag = false; }

    _hueBar.addEventListener('mousedown', _hueStart);
    _hueBar.addEventListener('touchstart', _hueStart, { passive: false });
    _hueCursor.addEventListener('mousedown', _hueStart);
    _hueCursor.addEventListener('touchstart', _hueStart, { passive: false });
    document.addEventListener('mousemove', _hueMove);
    document.addEventListener('touchmove', _hueMove, { passive: false });
    document.addEventListener('mouseup', _hueEnd);
    document.addEventListener('touchend', _hueEnd);

    // HEX input
    _hexInput.addEventListener('input', () => {
      if (_isTransparent) return;
      const norm = global.ColorConverter.normalizeHex(_hexInput.value.trim());
      if (norm) _setDraftFromHex(norm, 'hex');
    });

    // HSL inputs
    _hInput.addEventListener('input', () => {
      if (_isTransparent) return;
      _setDraftFromHsl(Number(_hInput.value), _draftS, _draftL, 'hsl-h');
    });
    _sInput.addEventListener('input', () => {
      if (_isTransparent) return;
      _setDraftFromHsl(_draftH, Number(_sInput.value), _draftL, 'hsl-s');
    });
    _lInput.addEventListener('input', () => {
      if (_isTransparent) return;
      _setDraftFromHsl(_draftH, _draftS, Number(_lInput.value), 'hsl-l');
    });

    // RGB inputs
    function _syncFromRgb() {
      if (_isTransparent) return;
      _setDraftFromRgb(
        Number(_rInput.value),
        Number(_gInput.value),
        Number(_bInput.value),
        'rgb'
      );
    }
    _rInput.addEventListener('input', _syncFromRgb);
    _gInput.addEventListener('input', _syncFromRgb);
    _bInput.addEventListener('input', _syncFromRgb);

    // Transparent checkbox
    _transparentCk.addEventListener('change', () => {
      _isTransparent = _transparentCk.checked;
      _setInputsEnabled(!_isTransparent);
      if (_isTransparent) {
        _draftHex = 'transparent';
        _showTransparentUI();
      } else {
        const hex = global.ColorConverter.normalizeHex(_initialColor) || '#000000';
        _setDraftFromHex(hex, null);
      }
    });

    _backdrop.addEventListener('click', e => { if (e.target === _backdrop) close(); });
    document.addEventListener('keydown', _onKey);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function open(currentHex, onSelect, opts) {
    if (!_backdrop) _build();
    opts = opts || {};
    _onSelect = onSelect || null;
    _initialColor = currentHex;
    _isTransparent = currentHex === 'transparent';

    _transparentRow.style.display = opts.allowTransparent ? 'flex' : 'none';
    _transparentCk.checked = _isTransparent;
    _setInputsEnabled(!_isTransparent);

    _refreshCustomGrid();

    if (_isTransparent) {
      _draftHex = 'transparent';
      _showTransparentUI();
    } else {
      const hex = global.ColorConverter.normalizeHex(currentHex) || '#000000';
      _setDraftFromHex(hex, null);
    }

    _backdrop.style.display = 'flex';

    // Defer cursor positioning until layout is painted
    requestAnimationFrame(() => {
      if (_backdrop.style.display !== 'none') {
        _updateColorAreaGradient();
        _updateAreaCursor();
        _updateHueCursor();
      }
    });
  }

  function init() { /* lazy */ }

  global.ColorPickerAdapter = { open, close, init };
})(window);
