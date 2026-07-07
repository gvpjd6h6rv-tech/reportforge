'use strict';

// RF-PREVIEW-MARGINS-1 (editor): edit the layout page margins (mm, 4 sides).
// SSOT = CommandRuntimeFile._currentLayout.margins, which _liveMargins()/toJSON
// feed to BOTH the preview (/designer-preview) and the PDF export (/render) --
// so a single edit updates both and parity is guaranteed by construction.
// Left/top are mirrored to the design-canvas ruler (DS.pageMarginLeft/Top).
//
// 1 file = 1 responsibility: state update + a minimal self-contained popover.
(function initPageMarginsEngine(global) {
  const SIDES = ['top', 'right', 'bottom', 'left'];
  const LABEL = { top: 'Superior', right: 'Derecho', bottom: 'Inferior', left: 'Izquierdo' };
  const DEFAULTS = { top: 15, right: 20, bottom: 15, left: 20 };

  function _crf() { return global.CommandRuntimeFile || null; }

  function get() {
    const crf = _crf();
    const m = crf && crf._currentLayout && crf._currentLayout.margins;
    const out = {};
    for (const s of SIDES) out[s] = (m && Number.isFinite(m[s])) ? m[s] : DEFAULTS[s];
    return out;
  }

  function set(side, value) {
    if (!SIDES.includes(side)) return;
    const v = Math.max(0, Number(value) || 0);
    const crf = _crf();
    if (crf && crf._currentLayout) {
      const cl = crf._currentLayout;
      cl.margins = { ...get(), [side]: v }; // merge: keep the other sides
      crf._currentLayout = cl;              // re-assign through the setter
    }
    // mirror to the design-canvas ruler (only left/top exist there)
    if (typeof DS !== 'undefined') {
      if (side === 'left' && DS.setPageMarginLeft) DS.setPageMarginLeft(v, 'PageMarginsEngine.set');
      if (side === 'top' && DS.setPageMarginTop) DS.setPageMarginTop(v, 'PageMarginsEngine.set');
    }
    _reflect();
    return v;
  }

  function setAll(margins) {
    for (const s of SIDES) if (margins && Number.isFinite(margins[s])) set(s, margins[s]);
  }

  function _reflect() {
    // preview reads margins from toJSON on refresh; re-render if visible
    if (typeof DS !== 'undefined' && DS.previewMode &&
        global.PreviewEngineRenderer && global.PreviewEngineRenderer.refresh) {
      global.PreviewEngineRenderer.refresh();
    }
  }

  // ---- minimal self-contained popover UI (new nodes only, no shared CSS) ----
  function openEditor(anchorEl) {
    closeEditor();
    if (typeof document === 'undefined') return;
    const cur = get();
    const box = document.createElement('div');
    box.id = 'rf-margins-popover';
    box.style.cssText = 'position:absolute;z-index:9999;background:#fff;color:#111;border:1px solid #bbb;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.2);padding:12px;font:12px/1.4 sans-serif;min-width:230px';
    box.innerHTML =
      '<div style="font-weight:bold;margin-bottom:8px">Página / Márgenes (mm)</div>' +
      SIDES.map((s) =>
        '<label style="display:flex;justify-content:space-between;align-items:center;margin:4px 0">' +
        `<span>${LABEL[s]}</span>` +
        `<input type="number" min="0" step="1" data-side="${s}" value="${cur[s]}" style="width:72px;padding:2px 4px">` +
        '</label>'
      ).join('') +
      '<div style="text-align:right;margin-top:8px"><button id="rf-margins-close" style="padding:3px 10px;cursor:pointer">Cerrar</button></div>';
    document.body.appendChild(box);
    const r = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : { left: 80, bottom: 80 };
    box.style.left = Math.round(r.left) + 'px';
    box.style.top = Math.round((r.bottom || 80) + 6) + 'px';
    box.querySelectorAll('input[data-side]').forEach((inp) => {
      inp.addEventListener('input', () => set(inp.dataset.side, inp.value));
    });
    const closeBtn = box.querySelector('#rf-margins-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEditor);
  }

  function closeEditor() {
    if (typeof document === 'undefined') return;
    const b = document.getElementById('rf-margins-popover');
    if (b) b.remove();
  }

  // Opened from the menu: Formato -> "Márgenes de página..."
  // (data-action="page-margins" -> CommandRuntimeHandlersLayout -> openEditor).
  global.PageMarginsEngine = { get, set, setAll, openEditor, closeEditor, SIDES, DEFAULTS };
})(typeof window !== 'undefined' ? window : globalThis);

if (typeof module !== 'undefined') {
  module.exports = (typeof window !== 'undefined' ? window : globalThis).PageMarginsEngine;
}
