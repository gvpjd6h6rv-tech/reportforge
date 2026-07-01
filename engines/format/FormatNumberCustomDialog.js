'use strict';
/**
 * FormatNumberCustomDialog
 *
 * Single responsibility: sub-modal "Estilo personalizado" del Editor de Formato.
 * Edita config.number con controles detallados y devuelve la config al tab padre
 * vía callback onAccept.
 *
 * No persiste nada directamente. No toca DS. No toca el layout.
 * Solo recibe config, deja editarla y devuelve via callback.
 *
 * API:
 *   FormatNumberCustomDialog.open(config, onAccept)
 *     config    — clon del draft.number actual (se clona internamente)
 *     onAccept  — function(updatedConfig) → llamada si usuario acepta
 *
 * FASE 1 (implementada):
 *   - Decimales (0-6)
 *   - Separador de miles
 *   - Símbolo de moneda enabled/symbol
 *   - Negativos: signo menos / paréntesis
 *   - Blanco si cero
 *   - Vista previa
 *
 * FASE 2 BACKLOG (controles disabled con tooltip):
 *   - Separador decimal configurable
 *   - Separador de miles configurable
 *   - Redondeo por incremento
 *   - Cero a la izquierda
 *   - Formato contabilidad
 *   - Posición moneda fija/flotante avanzada
 */
(function initFormatNumberCustomDialog(global) {

  let _modal = null;

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function _el(tag, style, text) {
    const n = global.document.createElement(tag);
    if (style) n.style.cssText = style;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function _row(labelText, control, disabled) {
    const row = _el('div', 'display:flex;align-items:center;margin-bottom:5px;gap:6px;');
    const lbl = _el('label', 'width:170px;font-size:10px;color:' + (disabled ? '#aaa' : '#333') + ';flex-shrink:0;');
    lbl.textContent = labelText;
    if (disabled) {
      lbl.title = 'Pendiente (Fase 2)';
      if (control) { control.disabled = true; control.title = 'Pendiente (Fase 2)'; }
    }
    row.appendChild(lbl);
    if (control) row.appendChild(control);
    return row;
  }

  function _select(id, options, value) {
    const sel = _el('select', 'font-size:10px;padding:1px 3px;');
    sel.id = id;
    options.forEach(function(opt) {
      const o = global.document.createElement('option');
      o.value = opt.value; o.textContent = opt.label;
      if (String(opt.value) === String(value)) o.selected = true;
      sel.appendChild(o);
    });
    return sel;
  }

  function _checkbox(id, checked) {
    const inp = _el('input', 'margin:0;cursor:pointer;');
    inp.type = 'checkbox'; inp.id = id; inp.checked = !!checked;
    return inp;
  }

  function _textInput(id, value, width) {
    const inp = _el('input', 'font-size:10px;padding:1px 3px;width:' + (width || 50) + 'px;');
    inp.type = 'text'; inp.id = id; inp.value = value || '';
    return inp;
  }

  function _radio(name, value, label, checked) {
    const wrap = _el('label', 'font-size:10px;display:flex;align-items:center;gap:3px;cursor:pointer;margin-right:8px;');
    const inp = _el('input', 'margin:0;');
    inp.type = 'radio'; inp.name = name; inp.value = value;
    if (checked) inp.checked = true;
    wrap.appendChild(inp);
    wrap.appendChild(global.document.createTextNode(label));
    return wrap;
  }

  function _sep() {
    return _el('div', 'border-top:1px solid #ccc;margin:8px 0;');
  }

  // ── Preview update ────────────────────────────────────────────────────────

  function _updatePreview(cfg, previewEl) {
    const EXAMPLES = [24, 2.600001, 1049.14, -150.5, 0];
    previewEl.textContent = EXAMPLES.map(function(v) {
      return (v < 0 ? '   ' : '    ') + String(v).padEnd(10) + ' → "' + NumberFormatter.formatNumber(v, cfg) + '"';
    }).join('\n');
  }

  // ── Modal builder ─────────────────────────────────────────────────────────

  function _buildModal(srcConfig, onAccept) {
    // Deep-clone so edits don't escape on Cancel
    const cfg = JSON.parse(JSON.stringify(srcConfig || {}));
    if (!cfg.currency)  cfg.currency  = { enabled: false, symbol: '$', position: 'floating' };
    if (!cfg.negative)  cfg.negative  = { mode: 'minus' };
    if (!cfg.zero)      cfg.zero      = { blankIfZero: false, leadingZero: true };

    const backdrop = _el('div', [
      'position:fixed;inset:0;',
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(0,0,0,0.45);',
      'z-index:10001;',
      'font-family:Tahoma,"Microsoft Sans Serif",Arial,sans-serif;font-size:11px;',
    ].join(''));
    backdrop.id = 'fmt-custom-modal';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-label', 'Estilo personalizado');

    const dialog = _el('div', [
      'background:#ECE9D8;border:1px solid #7a96df;border-radius:3px;',
      'box-shadow:2px 3px 8px rgba(0,0,0,0.45);',
      'min-width:320px;max-width:400px;width:380px;',
    ].join(''));

    // Title bar
    const titleBar = _el('div', [
      'background:linear-gradient(to right,#0A246A,#A6B8E0);',
      'color:#fff;font-size:11px;font-weight:bold;',
      'padding:4px 8px;display:flex;justify-content:space-between;align-items:center;',
      'border-radius:2px 2px 0 0;',
    ].join(''));
    titleBar.appendChild(_el('span', 'pointer-events:none;', '⚙ Estilo personalizado'));
    const closeX = _el('button', [
      'background:#c0392b;color:#fff;border:none;width:16px;height:14px;',
      'font-size:8px;cursor:pointer;font-family:monospace;padding:0;',
    ].join(''), '✕');
    closeX.addEventListener('click', function() { _close(); });
    titleBar.appendChild(closeX);

    // Body
    const body = _el('div', 'padding:10px;');

    // ── FASE 1 controls ───────────────────────────────────────────────────

    const secLabel = function(text) {
      const d = _el('div', 'font-size:10px;font-weight:bold;color:#003;margin-bottom:4px;margin-top:2px;');
      d.textContent = text;
      return d;
    };

    // Decimales
    body.appendChild(secLabel('Número'));
    const decSel = _select('cust-decimals',
      [0,1,2,3,4,5,6].map(function(n) { return {value:n, label:String(n)+' decimales'}; }),
      cfg.decimals !== undefined ? cfg.decimals : 2
    );
    body.appendChild(_row('Decimales:', decSel));

    // Separador de miles
    const thCb = _checkbox('cust-thousands', cfg.thousands);
    body.appendChild(_row('Separador de miles:', thCb));

    body.appendChild(_sep());

    // Negativos
    body.appendChild(secLabel('Números negativos'));
    const negRow = _el('div', 'display:flex;align-items:center;margin-bottom:5px;');
    const negLabel = _el('span', 'width:170px;font-size:10px;color:#333;flex-shrink:0;', 'Formato:');
    const negOptions = _el('div', 'display:flex;');
    const negMinus = _radio('cust-neg', 'minus', '-1234.00', cfg.negative.mode !== 'parentheses');
    const negParen = _radio('cust-neg', 'parentheses', '(1234.00)', cfg.negative.mode === 'parentheses');
    negOptions.appendChild(negMinus);
    negOptions.appendChild(negParen);
    negRow.appendChild(negLabel);
    negRow.appendChild(negOptions);
    body.appendChild(negRow);

    body.appendChild(_sep());

    // Símbolo de moneda
    body.appendChild(secLabel('Símbolo de moneda'));
    const curEnabledCb = _checkbox('cust-cur-enabled', cfg.currency.enabled);
    body.appendChild(_row('Habilitar símbolo:', curEnabledCb));
    const curSymInp = _textInput('cust-cur-symbol', cfg.currency.symbol || '$', 50);
    const curSymRow = _row('Símbolo:', curSymInp);
    curSymRow.id = 'cust-cur-sym-row';
    curSymRow.style.opacity = cfg.currency.enabled ? '1' : '0.5';
    body.appendChild(curSymRow);

    body.appendChild(_sep());

    // Blanco si cero
    body.appendChild(secLabel('Cero'));
    const blankCb = _checkbox('cust-blank-zero', cfg.zero.blankIfZero);
    body.appendChild(_row('Blanco si cero:', blankCb));

    // ── FASE 2 BACKLOG (disabled) ──────────────────────────────────────────

    body.appendChild(_sep());
    const backlogHdr = _el('div', 'font-size:9px;color:#888;margin-bottom:4px;', 'Avanzado (próxima versión):');
    body.appendChild(backlogHdr);

    const decSepInp  = _textInput('cust-dec-sep',  cfg.decimalSeparator   || '.', 30);
    const thsSepInp  = _textInput('cust-ths-sep',  cfg.thousandsSeparator || ',', 30);
    const roundInp   = _textInput('cust-round-inc', '', 50);
    body.appendChild(_row('Separador decimal:', decSepInp, true));
    body.appendChild(_row('Separador de miles:', thsSepInp, true));
    body.appendChild(_row('Redondeo (incr.):', roundInp, true));

    // ── Preview ───────────────────────────────────────────────────────────

    body.appendChild(_sep());
    body.appendChild(_el('div', 'font-size:9px;color:#666;margin-bottom:3px;', 'Vista previa:'));
    const prevEl = _el('pre', [
      'font-size:9px;font-family:Consolas,monospace;',
      'background:#f5f5f5;padding:4px;margin:0;border:1px solid #ddd;',
    ].join(''));
    body.appendChild(prevEl);

    // ── Sync function ─────────────────────────────────────────────────────

    function _sync() {
      cfg.decimals = parseInt(decSel.value, 10);
      cfg.thousands = thCb.checked;
      cfg.currency.enabled = curEnabledCb.checked;
      cfg.currency.symbol = curSymInp.value || '$';
      const negSel = backdrop.querySelector('input[name="cust-neg"]:checked');
      cfg.negative.mode = negSel ? negSel.value : 'minus';
      cfg.zero.blankIfZero = blankCb.checked;
      const symRow = global.document.getElementById('cust-cur-sym-row');
      if (symRow) symRow.style.opacity = cfg.currency.enabled ? '1' : '0.5';
      _updatePreview(cfg, prevEl);
    }

    decSel.addEventListener('change', _sync);
    thCb.addEventListener('change', _sync);
    curEnabledCb.addEventListener('change', _sync);
    curSymInp.addEventListener('input', _sync);
    blankCb.addEventListener('change', _sync);
    backdrop.querySelectorAll && backdrop.addEventListener('change', function(e) {
      if (e.target && e.target.name === 'cust-neg') _sync();
    });

    _updatePreview(cfg, prevEl);

    // ── Buttons ───────────────────────────────────────────────────────────

    const btnRow = _el('div', 'display:flex;justify-content:flex-end;gap:6px;padding:8px;');
    const acceptBtn = _el('button', [
      'font-size:10px;padding:3px 14px;cursor:pointer;',
      'background:#ECE9D8;border:1px solid #888;font-family:Tahoma,Arial,sans-serif;font-weight:bold;',
    ].join(''), 'Aceptar');
    acceptBtn.addEventListener('click', function() {
      _sync(); // ensure latest values
      cfg.presetId = 'custom';
      onAccept(JSON.parse(JSON.stringify(cfg)));
      _close();
    });
    const cancelBtn = _el('button', [
      'font-size:10px;padding:3px 14px;cursor:pointer;',
      'background:#ECE9D8;border:1px solid #888;font-family:Tahoma,Arial,sans-serif;',
    ].join(''), 'Cancelar');
    cancelBtn.addEventListener('click', function() { _close(); });

    btnRow.appendChild(acceptBtn);
    btnRow.appendChild(cancelBtn);

    dialog.appendChild(titleBar);
    dialog.appendChild(body);
    dialog.appendChild(btnRow);
    backdrop.appendChild(dialog);

    backdrop.addEventListener('keydown', function(e) { if (e.key === 'Escape') _close(); });

    return backdrop;
  }

  function _close() {
    if (_modal && _modal.parentNode) _modal.parentNode.removeChild(_modal);
    _modal = null;
  }

  function open(config, onAccept) {
    _close();
    _modal = _buildModal(config, onAccept || function() {});
    global.document.body.appendChild(_modal);
    _modal.focus();
  }

  global.FormatNumberCustomDialog = { open: open };
  if (typeof module !== 'undefined') module.exports = { open: open };

})(typeof window !== 'undefined' ? window : globalThis);
