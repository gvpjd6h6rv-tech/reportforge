'use strict';
/**
 * FormatNumberTab
 *
 * Single responsibility: UI de la pestaña "Número" dentro del Editor de Formato.
 * - Lista de presets predefinidos (izquierda)
 * - Grupo símbolo de moneda (derecha)
 * - Vista previa abajo
 * - Botón "Personalizar..." → abre FormatNumberCustomDialog
 *
 * Reads and writes only draft.number.
 * No formatting logic — delegates to NumberFormatter.
 * No save logic — delegated to FormatEditorEngine.
 *
 * API:
 *   FormatNumberTab.render(container, draft)
 */
(function initFormatNumberTab(global) {

  var PRESETS = null; // lazy-loaded from NumberFormatPresetMap

  function _getPresets() {
    if (!PRESETS) PRESETS = global.NumberFormatPresetMap.NUMBER_FORMAT_PRESETS;
    return PRESETS;
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  // Crystal Reports "Número" tab layout:
  //   +---------------------------+------------------+
  //   | Lista de estilos          | Símbolo moneda   |
  //   |  [listbox]                | [ ] Habilitar    |
  //   |                           | Símbolo: [$____] |
  //   +---------------------------+------------------+
  //   | Muestra: [______________] |
  //   +-----------------------------------[Personalizar...]

  function render(container, draft) {
    container.innerHTML = '';

    // Initialize draft.number from first preset if not set
    const presets = _getPresets();
    if (!draft.number) {
      draft.number = Object.assign({}, presets[0].config, { presetId: presets[0].id });
    }

    // ── Two-column layout ─────────────────────────────────────────────────

    const cols = global.document.createElement('div');
    cols.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';

    // Left: preset list
    const leftPanel = global.document.createElement('div');
    leftPanel.style.cssText = 'flex:1;min-width:160px;';
    const listLabel = global.document.createElement('div');
    listLabel.style.cssText = 'font-size:9px;color:#555;margin-bottom:2px;';
    listLabel.textContent = 'Estilos predefinidos:';
    leftPanel.appendChild(listLabel);

    const listbox = global.document.createElement('select');
    listbox.id = 'fmt-num-preset-list';
    listbox.size = 8;
    listbox.style.cssText = [
      'width:100%;font-size:10px;font-family:Consolas,monospace;',
      'border:1px solid #aaa;padding:2px;',
    ].join('');

    presets.forEach(function(preset) {
      const opt = global.document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.example
        ? preset.label + '  (' + preset.example + ')'
        : preset.label;
      if (draft.number.presetId === preset.id) opt.selected = true;
      listbox.appendChild(opt);
    });
    // If current presetId is 'custom', add a visual custom entry
    if (draft.number.presetId === 'custom') {
      const customOpt = global.document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = '✏ Personalizado';
      customOpt.selected = true;
      listbox.insertBefore(customOpt, listbox.firstChild);
    }

    leftPanel.appendChild(listbox);

    // Right: currency symbol group
    const rightPanel = global.document.createElement('div');
    rightPanel.style.cssText = [
      'min-width:130px;border:1px solid #ccc;padding:6px;',
      'background:#f8f8f0;',
    ].join('');

    const curTitle = global.document.createElement('div');
    curTitle.style.cssText = 'font-size:9px;font-weight:bold;color:#333;margin-bottom:6px;';
    curTitle.textContent = 'Símbolo de moneda';
    rightPanel.appendChild(curTitle);

    const curCur = (draft.number.currency || {});
    const curEnabledRow = global.document.createElement('div');
    curEnabledRow.style.cssText = 'display:flex;align-items:center;gap:4px;margin-bottom:4px;';
    const curEnabledCb = global.document.createElement('input');
    curEnabledCb.type = 'checkbox'; curEnabledCb.id = 'fmt-num-cur-enabled';
    curEnabledCb.checked = !!curCur.enabled;
    curEnabledCb.style.cssText = 'margin:0;';
    const curEnabledLbl = global.document.createElement('label');
    curEnabledLbl.htmlFor = 'fmt-num-cur-enabled';
    curEnabledLbl.style.cssText = 'font-size:10px;color:#333;cursor:pointer;';
    curEnabledLbl.textContent = 'Habilitar símbolo';
    curEnabledRow.appendChild(curEnabledCb);
    curEnabledRow.appendChild(curEnabledLbl);
    rightPanel.appendChild(curEnabledRow);

    const curSymRow = global.document.createElement('div');
    curSymRow.id = 'fmt-num-cur-sym-row';
    curSymRow.style.cssText = 'display:flex;align-items:center;gap:4px;';
    curSymRow.style.opacity = curCur.enabled ? '1' : '0.45';
    const curSymLbl = global.document.createElement('span');
    curSymLbl.style.cssText = 'font-size:10px;color:#333;';
    curSymLbl.textContent = 'Símbolo:';
    const curSymInp = global.document.createElement('input');
    curSymInp.type = 'text'; curSymInp.id = 'fmt-num-cur-symbol';
    curSymInp.value = curCur.symbol || '$';
    curSymInp.style.cssText = 'font-size:10px;width:38px;padding:1px 3px;';
    curSymRow.appendChild(curSymLbl);
    curSymRow.appendChild(curSymInp);
    rightPanel.appendChild(curSymRow);

    cols.appendChild(leftPanel);
    cols.appendChild(rightPanel);
    container.appendChild(cols);

    // ── Preview ───────────────────────────────────────────────────────────

    const prevLabel = global.document.createElement('div');
    prevLabel.style.cssText = 'font-size:9px;color:#555;margin-bottom:2px;';
    prevLabel.textContent = 'Muestra:';
    container.appendChild(prevLabel);

    const prevEl = global.document.createElement('div');
    prevEl.id = 'fmt-num-tab-preview';
    prevEl.style.cssText = [
      'font-family:Consolas,monospace;font-size:10px;',
      'background:#fff;border:1px solid #ccc;padding:4px;',
      'min-height:20px;margin-bottom:6px;',
    ].join('');
    container.appendChild(prevEl);

    // ── Personalizar button ───────────────────────────────────────────────

    const btnRow = global.document.createElement('div');
    btnRow.style.cssText = 'display:flex;justify-content:flex-end;';
    const customBtn = global.document.createElement('button');
    customBtn.style.cssText = [
      'font-size:10px;padding:3px 10px;cursor:pointer;',
      'background:#ECE9D8;border:1px solid #888;',
      'font-family:Tahoma,Arial,sans-serif;',
    ].join('');
    customBtn.textContent = 'Personalizar...';
    btnRow.appendChild(customBtn);
    container.appendChild(btnRow);

    // ── Sync & events ─────────────────────────────────────────────────────

    function _refreshPreview() {
      const examples = [-1234.5, 1049.14, 0, null];
      const fmted = examples.map(function(v) {
        return NumberFormatter.formatNumber(v, draft.number || {});
      });
      prevEl.textContent = fmted.join('   ');
    }

    function _applyPreset(presetId) {
      const preset = global.NumberFormatPresetMap.getPreset(presetId);
      if (!preset) return;
      draft.number = Object.assign({}, preset.config, { presetId: preset.id });
      // Sync currency controls to new preset
      const newCur = draft.number.currency || {};
      curEnabledCb.checked = !!newCur.enabled;
      curSymInp.value = newCur.symbol || '$';
      const symRow = global.document.getElementById('fmt-num-cur-sym-row');
      if (symRow) symRow.style.opacity = newCur.enabled ? '1' : '0.45';
      _refreshPreview();
    }

    function _syncCurrency() {
      if (!draft.number) return;
      if (!draft.number.currency) draft.number.currency = {};
      draft.number.currency.enabled = curEnabledCb.checked;
      draft.number.currency.symbol  = curSymInp.value || '$';
      const symRow = global.document.getElementById('fmt-num-cur-sym-row');
      if (symRow) symRow.style.opacity = curEnabledCb.checked ? '1' : '0.45';
      _refreshPreview();
    }

    listbox.addEventListener('change', function() {
      _applyPreset(listbox.value);
    });

    curEnabledCb.addEventListener('change', _syncCurrency);
    curSymInp.addEventListener('input', _syncCurrency);

    customBtn.addEventListener('click', function() {
      global.FormatNumberCustomDialog.open(draft.number, function(updated) {
        draft.number = updated;
        // Re-render the tab in place (simplest: replace all)
        render(container, draft);
      });
    });

    _refreshPreview();
  }

  global.FormatNumberTab = { render: render };
  if (typeof module !== 'undefined') module.exports = { render: render };

})(typeof window !== 'undefined' ? window : globalThis);
