'use strict';

/**
 * StoredProcedureExecutionPanel — UDS 4.1 F19C.
 *
 * Modal para ejecutar un Stored Procedure ALLOWLISTED por su ID, contra
 * GET /stored-procedures (lista) y POST /stored-procedures/execute
 * (ejecución). Responsabilidad única: listar procedures habilitados,
 * generar un formulario de parámetros desde su metadata, y ejecutar
 * enviando SOLO {storedProcedureId, params}.
 *
 * NO hace:
 *   - no envía nunca un nombre de procedure ni SQL — solo storedProcedureId.
 *   - no tiene ningún campo de texto libre para nombre de procedure.
 *   - no se mezcla con SQL Command libre — panel completamente separado
 *     de SqlCommandExecutionPanel.js (propio overlay, propio botón de
 *     toolbar, propio endpoint).
 *   - no guarda ni edita definiciones de Stored Procedures (eso vive en
 *     stored_procedures_config.json, backend-only).
 *   - no persiste el resultado en el reporte.
 *   - no muestra datasourceId ni el nombre real del procedure — solo
 *     label/id (igual que GET /stored-procedures nunca los expone).
 *   - no loggea nada a consola.
 *
 * Estados UI (this._uiState): ready | running | success | empty |
 * blocked | error | timeout. "ready" es la vista de lista + formulario.
 */
const StoredProcedureExecutionPanel = {
  _el: null,
  _uiState: 'ready',
  _procedures: null,
  _selected: null,
  _lastResult: null,

  open() {
    this.close();
    this._uiState = 'ready';
    this._procedures = null;
    this._selected = null;
    this._lastResult = null;

    const ov = document.createElement('div');
    ov.id = 'stored-procedure-execution-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;';

    const dlg = document.createElement('div');
    dlg.id = 'spep-dialog';
    dlg.style.cssText = 'background:#ECE9D8;border:2px solid #0A246A;width:560px;max-height:80vh;display:flex;flex-direction:column;font-family:Tahoma,sans-serif;font-size:11px;box-shadow:4px 4px 16px rgba(0,0,0,.5);';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(#1C52A0,#3A6EA5);color:#FFF;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML = '<span style="font-weight:bold">Ejecutar Stored Procedure (allowlist controlada)</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#FFF;font-size:14px;background:none;border:none;cursor:pointer;padding:0 4px;';
    closeBtn.onclick = () => this.close();
    hdr.appendChild(closeBtn);
    dlg.appendChild(hdr);

    const body = document.createElement('div');
    body.id = 'spep-body';
    body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;';
    dlg.appendChild(body);

    ov.appendChild(dlg);
    document.body.appendChild(ov);
    this._el = ov;
    this._renderLoading();
    this._loadProcedures();
  },

  _renderLoading() {
    const body = document.getElementById('spep-body');
    if (!body) return;
    body.innerHTML = '';
    const loading = document.createElement('div');
    loading.id = 'spep-loading';
    loading.style.cssText = 'color:#555;font-style:italic;padding:4px;';
    loading.textContent = 'Cargando Stored Procedures habilitados…';
    body.appendChild(loading);
  },

  async _loadProcedures() {
    try {
      const res = await fetch('/stored-procedures');
      const data = await res.json();
      this._procedures = (data && Array.isArray(data.storedProcedures)) ? data.storedProcedures : [];
    } catch (err) {
      this._procedures = [];
    }
    this._render();
  },

  _render() {
    const body = document.getElementById('spep-body');
    if (!body) return;
    body.innerHTML = '';

    if (this._procedures === null) {
      this._renderLoading();
      return;
    }

    if (this._selected) {
      body.appendChild(this._renderDetail());
      return;
    }

    body.appendChild(this._renderList());
  },

  _renderList() {
    const wrap = document.createElement('div');

    if (!this._procedures.length) {
      const empty = document.createElement('div');
      empty.id = 'spep-empty-state';
      empty.style.cssText = 'color:#888;font-style:italic;padding:4px;';
      empty.textContent = 'No hay Stored Procedures habilitados en la allowlist.';
      wrap.appendChild(empty);
      return wrap;
    }

    this._procedures.forEach((proc) => wrap.appendChild(this._renderListRow(proc)));
    return wrap;
  },

  _renderListRow(proc) {
    const row = document.createElement('div');
    row.className = 'spep-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px;border-bottom:1px solid #D8D4C4;';

    const label = document.createElement('div');
    label.style.cssText = 'flex:1;min-width:0;font-weight:bold;';
    label.textContent = proc.label || proc.id;
    row.appendChild(label);

    const selectBtn = document.createElement('button');
    selectBtn.className = 'spep-select-btn';
    selectBtn.textContent = 'Seleccionar';
    selectBtn.style.cssText = 'padding:2px 10px;border:1px solid #ACA899;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:10px;flex-shrink:0;';
    selectBtn.onclick = () => this._selectProcedure(proc);
    row.appendChild(selectBtn);

    return row;
  },

  _selectProcedure(proc) {
    if (!proc || !proc.id) return;
    this._selected = proc;
    this._lastResult = null;
    this._uiState = 'ready';
    this._paramValues = {};
    this._render();
  },

  _renderDetail() {
    const wrap = document.createElement('div');
    const proc = this._selected;
    if (!proc) return wrap;

    const summary = document.createElement('div');
    summary.style.cssText = 'background:#FFF;border:1px inset #ACA899;padding:6px;font-size:10px;';
    summary.innerHTML = `<div><b>Procedure:</b> ${_escapeHtml(proc.label || proc.id)}</div>`;
    wrap.appendChild(summary);

    if (this._uiState === 'ready') {
      wrap.appendChild(this._renderParamsForm());
    } else {
      wrap.appendChild(this._renderResultArea());
    }

    const backBtn = document.createElement('button');
    backBtn.id = 'spep-back-btn';
    backBtn.textContent = 'Volver';
    backBtn.disabled = this._uiState === 'running';
    backBtn.style.cssText = 'margin-top:6px;padding:2px 12px;border:2px solid #716F64;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:11px;';
    backBtn.onclick = () => { this._selected = null; this._uiState = 'ready'; this._render(); };
    wrap.appendChild(backBtn);

    return wrap;
  },

  _renderParamsForm() {
    const area = document.createElement('div');
    area.id = 'spep-params-form';
    area.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:6px;';

    (this._selected.params || []).forEach((p) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;';
      const labelText = document.createElement('span');
      labelText.style.cssText = 'width:120px;flex-shrink:0;';
      labelText.textContent = p.name + (p.required ? ' *' : '') + ':';
      row.appendChild(labelText);

      const input = document.createElement('input');
      input.type = p.type === 'number' ? 'number' : (p.type === 'date' ? 'date' : 'text');
      input.className = 'spep-param-input';
      input.dataset.paramName = p.name;
      if (p.maxLength) input.maxLength = p.maxLength;
      input.style.cssText = 'flex:1;font-size:10px;padding:2px;';
      input.addEventListener('input', () => { this._paramValues[p.name] = input.value; });
      row.appendChild(input);

      area.appendChild(row);
    });

    const runBtn = document.createElement('button');
    runBtn.id = 'spep-run-btn';
    runBtn.textContent = 'Ejecutar';
    runBtn.style.cssText = 'margin-top:4px;padding:3px 14px;border:2px solid #0A246A;background:#1C52A0;color:#FFF;cursor:pointer;font-family:Tahoma;font-size:11px;font-weight:bold;align-self:flex-start;';
    runBtn.onclick = () => this._runExecution();
    area.appendChild(runBtn);

    return area;
  },

  _renderResultArea() {
    const area = document.createElement('div');
    area.style.cssText = 'margin-top:8px;';
    const r = this._lastResult || {};

    if (this._uiState === 'running') {
      const msg = document.createElement('div');
      msg.id = 'spep-running';
      msg.style.cssText = 'color:#555;font-style:italic;padding:6px;';
      msg.textContent = 'Ejecutando…';
      area.appendChild(msg);
      return area;
    }

    if (this._uiState === 'success' || this._uiState === 'empty') {
      const meta = document.createElement('div');
      meta.style.cssText = 'font-size:10px;color:#333;margin-bottom:4px;';
      meta.textContent = `Filas: ${r.row_count != null ? r.row_count : 0}` +
        (r.max_rows_effective != null ? ` (max_rows: ${r.max_rows_effective})` : '') +
        (r.timeout_effective != null ? ` — timeout: ${r.timeout_effective}s` : '');
      area.appendChild(meta);
    }

    if (this._uiState === 'success') {
      area.appendChild(this._renderTable(r.columns || [], r.rows || []));
    } else if (this._uiState === 'empty') {
      const msg = document.createElement('div');
      msg.id = 'spep-empty-result';
      msg.style.cssText = 'color:#555;font-style:italic;padding:6px;';
      msg.textContent = 'Sin resultados (0 filas).';
      area.appendChild(msg);
    } else if (this._uiState === 'blocked') {
      const msg = document.createElement('div');
      msg.id = 'spep-blocked-message';
      msg.style.cssText = 'color:#7D1F1F;background:#FFF3F3;border:1px solid #E0B0B0;padding:6px;font-size:10px;';
      msg.textContent = 'Bloqueado: ' + (r.reason || 'este Stored Procedure no puede ejecutarse.');
      area.appendChild(msg);
    } else if (this._uiState === 'timeout') {
      const msg = document.createElement('div');
      msg.id = 'spep-timeout-message';
      msg.style.cssText = 'color:#7D5A1F;background:#FFF8E8;border:1px solid #E0C890;padding:6px;font-size:10px;';
      msg.textContent = 'Tiempo de espera agotado (timeout).';
      area.appendChild(msg);
    } else if (this._uiState === 'error') {
      const msg = document.createElement('div');
      msg.id = 'spep-error-message';
      msg.style.cssText = 'color:#7D1F1F;background:#FFF3F3;border:1px solid #E0B0B0;padding:6px;font-size:10px;';
      msg.textContent = 'Error: ' + (r.safe_error || 'ocurrió un error ejecutando el procedure.');
      area.appendChild(msg);
    }

    return area;
  },

  _renderTable(columns, rows) {
    const table = document.createElement('table');
    table.id = 'spep-result-table';
    table.style.cssText = 'width:100%;border-collapse:collapse;font-size:10px;background:#FFF;';
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    columns.forEach((c) => {
      const th = document.createElement('th');
      th.style.cssText = 'border:1px solid #D8D4C4;padding:2px 4px;background:#D4D0C8;text-align:left;';
      th.textContent = c;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((c) => {
        const td = document.createElement('td');
        td.style.cssText = 'border:1px solid #D8D4C4;padding:2px 4px;';
        const v = row[c];
        td.textContent = v === null || v === undefined ? '' : String(v);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  },

  async _runExecution() {
    const proc = this._selected;
    if (!proc || !proc.id) return;

    this._uiState = 'running';
    this._render();

    // Contract: only storedProcedureId + params ever leave this panel —
    // never a procedure name, never SQL text.
    const payload = {
      storedProcedureId: proc.id,
      params: { ...(this._paramValues || {}) },
    };

    let res, data;
    try {
      res = await fetch('/stored-procedures/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      data = await res.json();
    } catch (err) {
      this._lastResult = { safe_error: 'Error de red' };
      this._uiState = 'error';
      this._render();
      return;
    }

    // Contract: read body.status, never rely on the HTTP status code alone.
    this._lastResult = data;
    this._uiState = (data && typeof data.status === 'string') ? data.status : 'error';
    this._render();
  },

  close() {
    this._el?.remove();
    this._el = null;
  },
};

function _escapeHtml(value) {
  const div = (typeof document !== 'undefined') ? document.createElement('div') : null;
  if (!div) return String(value);
  div.textContent = value == null ? '' : String(value);
  return div.innerHTML;
}

if (typeof window !== 'undefined') window.StoredProcedureExecutionPanel = StoredProcedureExecutionPanel;
if (typeof module !== 'undefined') module.exports = StoredProcedureExecutionPanel;

// Minimal self-contained wiring: the HTML only needs the button element
// (no inline onclick/logic) — same pattern as SqlCommandExecutionPanel.js.
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-stored-procedure-execute')?.addEventListener('click', () => StoredProcedureExecutionPanel.open());
  });
}
