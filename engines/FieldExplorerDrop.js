'use strict';

const FieldExplorerDrop = (() => {
  function insertField(engine, field) {
    const secId = field.path.startsWith('item.') ? 's-d1' : 's-ph';
    const el = mkEl('field', secId, 4, DS.getSection(secId) ? 4 : 4, 150, 14, {
      fieldPath: field.path,
      fieldFmt: field.vtype === 'currency' ? 'currency' : field.vtype === 'date' ? 'date' : null,
      content: field.path,
      fontSize: 8,
    });
    DS.elements.push(el);
    _canonicalCanvasWriter().renderElement(el);
    DS.selectOnly(el.id);
    SelectionEngine.renderHandles();
    PropertiesEngine.render();
    FormatEngine.updateToolbar();
    DS.saveHistory();
    document.getElementById('sb-msg').textContent = `Campo '${field.path}' insertado`;
  }

  function setupCanvasDrop(engine) {
    const canvas = document.getElementById('workspace');
    canvas.addEventListener('dragover', e => {
      if (!engine._dragField) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'copy';
      const pos = getCanvasPos(e);
      const ind = document.getElementById('field-drop-indicator');
      ind.style.display = 'block';
      ind.style.left = DS.snap(pos.x) + 'px';
      ind.style.top = DS.snap(pos.y) + 'px';
      ind.style.width = '150px'; ind.style.height = '14px';
      document.getElementById('field-drag-ghost').style.left = (e.clientX + 10) + 'px';
      document.getElementById('field-drag-ghost').style.top = (e.clientY - 10) + 'px';
    });
    canvas.addEventListener('drop', e => {
      if (!engine._dragField) return;
      e.preventDefault();
      const ind = document.getElementById('field-drop-indicator'); ind.style.display = 'none';
      const field = engine._dragField;
      const pos = getCanvasPos(e);
      const x = DS.snap(pos.x), y = DS.snap(pos.y);
      const target = DS.getSectionAtY(y);
      if (!target) return;
      const secId = target.section.id;
      const relY = DS.snap(Math.max(0, y - DS.getSectionTop(secId)));
      const fmtDef = field.vtype === 'currency' ? 'currency' : field.vtype === 'date' ? 'date' : null;
      const el = mkEl('field', secId, x, relY, 150, 14, {
        fieldPath: field.path, fieldFmt: fmtDef, content: field.path, fontSize: 8,
      });
      DS.elements.push(el);
      _canonicalCanvasWriter().renderElement(el);
      DS.selectOnly(el.id);
      SelectionEngine.renderHandles();
      PropertiesEngine.render();
      FormatEngine.updateToolbar();
      DS.saveHistory();
      document.getElementById('sb-msg').textContent = `Campo '${field.path}' colocado`;
    });
    canvas.addEventListener('dragleave', () => {
      if (engine._dragField) document.getElementById('field-drop-indicator').style.display = 'none';
    });
  }

  return { insertField, setupCanvasDrop };
})();

if (typeof module !== 'undefined') module.exports = FieldExplorerDrop;
