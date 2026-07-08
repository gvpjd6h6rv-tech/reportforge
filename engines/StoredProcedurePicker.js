'use strict';

/**
 * StoredProcedurePicker — UDS 4.1 Fase 11.
 *
 * Responsabilidad única: modal para elegir un datasource registrado,
 * listar sus stored procedures (backend, Fase 7 catalog via 3 nuevas
 * rutas HTTP en api_routes_datasources.py), leer los parámetros de uno
 * elegido, y construir el SqlCommandModel correspondiente vía el
 * backend (POST .../build-command — nunca reimplementa la validación
 * de identificador ni el armado de SQL en JS). El resultado se entrega
 * al SqlCommandEditor ya existente (Fase 8) para revisión/aceptación —
 * este módulo NO tiene su propio flujo de "aceptar", reusa el editor.
 *
 * NO hace:
 *   - no ejecuta ningún EXEC real.
 *   - no llama sql_executor ni ninguna ruta de ejecución.
 *   - no toca Field Explorer, Preview, ni el document serializer.
 *   - no persiste nada (igual que SqlCommandEditor, Fase 10 no existe
 *     para SQL Commands todavía — BL-F10-1).
 *   - no modifica SqlCommandEditor.js, solo llama su API pública.
 */
const StoredProcedurePicker = {
  _el: null,

  open() {
    this.close();
    const ov = document.createElement('div');
    ov.id = 'stored-procedure-picker-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;';

    const dlg = document.createElement('div');
    dlg.style.cssText = 'background:#ECE9D8;border:2px solid #0A246A;width:640px;max-height:80vh;display:flex;flex-direction:column;font-family:Tahoma,sans-serif;font-size:11px;box-shadow:4px 4px 16px rgba(0,0,0,.5);';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(#1C52A0,#3A6EA5);color:#FFF;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML = '<span style="font-weight:bold">Stored Procedure Picker</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#FFF;font-size:14px;background:none;border:none;cursor:pointer;padding:0 4px;';
    closeBtn.onclick = () => this.close();
    hdr.appendChild(closeBtn);
    dlg.appendChild(hdr);

    const body = document.createElement('div');
    body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;';

    const dsRow = document.createElement('div');
    dsRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    dsRow.innerHTML = '<span style="width:94px;font-weight:bold;">Datasource:</span>';
    const dsSelect = document.createElement('select');
    dsSelect.id = 'spp-datasource';
    dsSelect.style.cssText = 'flex:1;font-size:11px;padding:2px;';
    dsRow.appendChild(dsSelect);
    body.appendChild(dsRow);

    const procRow = document.createElement('div');
    procRow.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
    procRow.innerHTML = '<span style="font-weight:bold">Procedures:</span>';
    const procList = document.createElement('div');
    procList.id = 'spp-procedures';
    procList.style.cssText = 'height:140px;overflow-y:auto;border:1px inset #ACA899;background:#FFF;';
    procRow.appendChild(procList);
    body.appendChild(procRow);

    const resultBox = document.createElement('div');
    resultBox.id = 'spp-result';
    resultBox.style.cssText = 'font-size:10px;color:#333;background:#FFF;border:1px inset #ACA899;padding:6px;min-height:50px;white-space:pre-wrap;font-family:Courier New,monospace;';
    resultBox.textContent = '(elegir un datasource y un procedure)';
    body.appendChild(resultBox);

    dlg.appendChild(body);

    const ftr = document.createElement('div');
    ftr.style.cssText = 'padding:6px 8px;border-top:1px solid #ACA899;display:flex;justify-content:flex-end;gap:6px;flex-shrink:0;background:#D4D0C8;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cerrar';
    btnCancel.style.cssText = 'padding:2px 16px;border:2px solid #716F64;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:11px;';
    btnCancel.onclick = () => this.close();
    ftr.appendChild(btnCancel);
    dlg.appendChild(ftr);

    ov.appendChild(dlg);
    document.body.appendChild(ov);
    this._el = ov;

    dsSelect.addEventListener('change', () => this._loadProcedures(dsSelect.value));
    this._loadDatasources(dsSelect);
  },

  async _loadDatasources(dsSelect) {
    dsSelect.innerHTML = '<option value="">(cargando…)</option>';
    try {
      const res = await fetch('/datasources');
      const list = await res.json();
      dsSelect.innerHTML = '';
      if (!list.length) {
        dsSelect.innerHTML = '<option value="">(sin datasources registrados)</option>';
        return;
      }
      list.forEach((ds) => {
        const opt = document.createElement('option');
        opt.value = ds.alias;
        opt.textContent = `${ds.alias} (${ds.type})`;
        dsSelect.appendChild(opt);
      });
      this._loadProcedures(dsSelect.value);
    } catch (err) {
      dsSelect.innerHTML = '<option value="">(error de red)</option>';
    }
  },

  async _loadProcedures(alias) {
    const procList = document.getElementById('spp-procedures');
    const resultEl = document.getElementById('spp-result');
    if (!procList) return;
    procList.innerHTML = '';
    if (!alias) return;
    try {
      const res = await fetch(`/datasources/${encodeURIComponent(alias)}/procedures`);
      const data = await res.json();
      if (!data.procedures || !data.procedures.length) {
        const empty = document.createElement('div');
        empty.style.cssText = 'padding:4px;color:#888;font-style:italic;';
        empty.textContent = (data.warnings && data.warnings[0]) || 'Sin procedures disponibles para este datasource';
        procList.appendChild(empty);
        return;
      }
      data.procedures.forEach((name) => {
        const item = document.createElement('div');
        item.textContent = name;
        item.style.cssText = 'padding:2px 4px;cursor:pointer;';
        item.onmouseenter = () => { item.style.background = '#316AC5'; item.style.color = '#FFF'; };
        item.onmouseleave = () => { item.style.background = ''; item.style.color = '#000'; };
        item.onclick = () => this._selectProcedure(alias, name);
        procList.appendChild(item);
      });
    } catch (err) {
      if (resultEl) resultEl.textContent = 'Error de red: ' + err;
    }
  },

  async _selectProcedure(alias, name) {
    const resultEl = document.getElementById('spp-result');
    if (resultEl) resultEl.textContent = 'Leyendo parámetros de ' + name + '…';
    let parameters = [];
    try {
      const res = await fetch(`/datasources/${encodeURIComponent(alias)}/procedures/${encodeURIComponent(name)}/parameters`);
      const data = await res.json();
      parameters = data.parameters || [];
    } catch (err) {
      if (resultEl) resultEl.textContent = 'Error leyendo parámetros: ' + err;
      return;
    }

    try {
      const buildRes = await fetch(`/datasources/${encodeURIComponent(alias)}/procedures/${encodeURIComponent(name)}/build-command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parameters }),
      });
      if (!buildRes.ok) {
        const errBody = await buildRes.json().catch(() => ({}));
        if (resultEl) resultEl.textContent = 'No se pudo construir el comando: ' + (errBody.detail || buildRes.status);
        return;
      }
      const command = await buildRes.json();
      if (resultEl) {
        resultEl.textContent = 'Comando construido (NO guardado permanentemente):\n' + command.sql
          + '\n\nParámetros: ' + parameters.map((p) => p.name).join(', ');
      }
      if (typeof SqlCommandEditor !== 'undefined' && typeof SqlCommandEditor.open === 'function') {
        SqlCommandEditor.open(command.name, command.sql);
      }
    } catch (err) {
      if (resultEl) resultEl.textContent = 'Error de red: ' + err;
    }
  },

  close() {
    this._el?.remove();
    this._el = null;
  },
};

window.StoredProcedurePicker = StoredProcedurePicker;

// Minimal self-contained wiring: the HTML only needs the button element
// (no inline onclick/logic) — this file owns opening itself.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-stored-procedure-picker')?.addEventListener('click', () => StoredProcedurePicker.open());
});

