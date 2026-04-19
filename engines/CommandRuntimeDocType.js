'use strict';

(function initCommandRuntimeDocType(global) {
  const { setStatus } = global.CommandRuntimeShared;

  function switchDocType(key) {
    if (!(key in DOC_TYPES)) return;
    const dt = DOC_TYPES[key];
    const prev = DS._docType;
    DS._docType = key;

    document.querySelectorAll('.doc-type-btn').forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.doctype === key));

    const tb = document.getElementById('titlebar');
    if (tb) tb.style.background = `linear-gradient(180deg,${shadeColor(dt.color, 20)} 0%,${dt.color} 60%,${shadeColor(dt.color, -10)} 100%)`;

    const pt = document.getElementById('props-title');
    if (pt) pt.style.background = `linear-gradient(180deg,${shadeColor(dt.color, 30)},${dt.color})`;

    FieldExplorerEngine._activeTree = dt.fieldTree || FIELD_TREE;
    FieldExplorerEngine.render = function() {
      const tree = this._activeTree || FIELD_TREE;
      const treeEl = document.getElementById('field-tree');
      treeEl.innerHTML = '';
      Object.entries(tree).forEach(([k, node]) => treeEl.appendChild(this._buildNode(k, node, 0)));
    };
    FieldExplorerEngine.render();

    DS._sampleData = dt.sampleData || SAMPLE_DATA;

    if (prev !== key) {
      if (DS.elements.length > 0 &&
        !confirm(`¿Cambiar a "${dt.label}"?\nSe cargará el layout de secciones para este tipo.\n(Los elementos del canvas se borrarán)`)) {
        DS._docType = prev;
        document.querySelectorAll('.doc-type-btn').forEach((btn) =>
          btn.classList.toggle('active', btn.dataset.doctype === prev));
        return;
      }
      DS.sections = dt.defaultSections.map((s) => ({ ...s }));
      DS.elements = [];
      DS.clearSelectionState();
      SectionEngine.render();
      SelectionEngine.clearSelection();
      DS.saveHistory();
    }

    const tt = document.getElementById('titlebar-text');
    if (tt) tt.textContent = `SAP Crystal Reports — [${dt.label} — Nuevo reporte (SRI ${dt.sriCode})]`;

    const items = DS._sampleData?.items || [];
    setStatus(`Tipo "${dt.label}" activado — SRI ${dt.sriCode} — Arrastra campos del Explorador al canvas`);
    document.getElementById('sb-records').textContent = `Items: ${items.length}`;

    console.log(`[ReportForge] Doc type → ${key} (${dt.label}) SRI:${dt.sriCode}`);
  }

  global.CommandRuntimeDocType = { switchDocType };
})(window);
