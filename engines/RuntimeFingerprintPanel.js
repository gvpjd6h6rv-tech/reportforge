'use strict';
// TEMPORARY diagnostic (#10.7T runtime-identity). NOT a fix. Remove after use.
// Shows, inside the real designer UI, exactly which server/JS is running plus
// the client-side state (open layout, sections, live DOM .rpt-page count) so
// the runtime identity can be confirmed where the user actually sees the bug.
(function () {
  function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

  async function show() {
    let server = {};
    try { server = await (await fetch('/runtime-fingerprint', { cache: 'no-store' })).json(); }
    catch (e) { server = { error: String(e) }; }

    // client-side state from the REAL open designer
    const client = {};
    try {
      const layout = (typeof CommandRuntimeFile !== 'undefined' && CommandRuntimeFile.toJSON) ? JSON.parse(CommandRuntimeFile.toJSON()) : (typeof DS !== 'undefined' ? DS.layout : null);
      client.layoutName = layout && layout.name;
      client.sections = layout && (layout.sections || []).map((s) => s.id + ':' + s.stype + ':' + s.height);
      client.elementCount = layout && (layout.elements || []).length;
      client.pageWidth = layout && layout.pageWidth;
      client.pageHeight = layout && layout.pageHeight;
      client.margins = layout && layout.margins;
      client.previewMode = (typeof DS !== 'undefined') ? !!DS.previewMode : null;
      client.domRptPages = document.querySelectorAll('#preview-content .preview-render-layer .rpt-page').length;
      client.domCrSections = document.querySelectorAll('#canvas-layer .cr-section').length;
      client.designerBuild = (typeof RF !== 'undefined' && RF.build) || (window.__RF_BUILD_COMMIT__ || 'n/a');
      client.hasClampGlobal = (typeof DocumentActionsLayoutClamp !== 'undefined');
      client.updateElementLayoutClamps = (typeof DS !== 'undefined' && typeof DS.updateElementLayout === 'function');
    } catch (e) { client.error = String(e); }

    const text =
      '=== RUNTIME FINGERPRINT ===\n\n' +
      '--- CLIENT (this browser / open layout) ---\n' +
      JSON.stringify(client, null, 2) +
      '\n\n--- SERVER (live process) ---\n' +
      JSON.stringify(server, null, 2) + '\n';

    let el = document.getElementById('rf-fingerprint-overlay');
    if (el) el.remove();
    el = document.createElement('div');
    el.id = 'rf-fingerprint-overlay';
    el.style.cssText = 'position:fixed;inset:5% 5% auto 5%;z-index:999999;background:#1e1e2e;color:#e0e0f0;font:11px/1.4 monospace;padding:14px 16px;border:2px solid #8e44ad;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.6);display:flex;flex-direction:column;max-height:88vh';
    const head = document.createElement('div');
    head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;gap:8px';
    head.innerHTML = '<b style="color:#c586e0">RUNTIME FINGERPRINT</b>';
    const btns = document.createElement('div');
    const copyBtn = document.createElement('button');
    copyBtn.textContent = '📋 Copiar';
    copyBtn.style.cssText = 'background:#2d7d46;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer;margin-right:6px';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'cerrar';
    closeBtn.style.cssText = 'background:#8e44ad;color:#fff;border:0;padding:4px 10px;border-radius:4px;cursor:pointer';
    btns.appendChild(copyBtn); btns.appendChild(closeBtn); head.appendChild(btns);
    // A readonly <textarea> so the whole fingerprint is selectable/copiable.
    const ta = document.createElement('textarea');
    ta.readOnly = true;
    ta.value = text;
    ta.style.cssText = 'flex:1;min-width:560px;min-height:420px;background:#12121c;color:#d7d7e8;border:1px solid #444;border-radius:4px;font:11px/1.4 monospace;padding:8px;white-space:pre;overflow:auto;resize:both';
    el.appendChild(head); el.appendChild(ta);
    document.body.appendChild(el);
    ta.focus(); ta.select();
    copyBtn.onclick = () => {
      ta.select();
      (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(
        () => { copyBtn.textContent = '✓ Copiado'; },
        () => { document.execCommand('copy'); copyBtn.textContent = '✓ Copiado'; },
      );
    };
    closeBtn.onclick = () => el.remove();
  }

  function wire() {
    const btn = document.getElementById('rf-runtime-fingerprint');
    if (btn) btn.addEventListener('click', show);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
