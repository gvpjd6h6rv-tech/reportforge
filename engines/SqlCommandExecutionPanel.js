'use strict';

/**
 * SqlCommandExecutionPanel — UDS 4.1 Fase 19 (F19B-1B).
 *
 * Modal para ejecutar un SQL Command YA GUARDADO (SqlCommandStore) contra
 * su datasource, con confirmación explícita, vía POST /sql-commands/execute
 * (el único endpoint de ejecución real, F19B-1A). Responsabilidad única:
 * preparar el payload, llamar el endpoint, y renderizar el estado/preview.
 *
 * NO hace:
 *   - no ejecuta nada por su cuenta (siempre vía el backend guardado).
 *   - no guarda ni edita SQL Commands (SqlCommandStore.add/remove nunca
 *     se llaman aquí — solo SqlCommandStore.list(), de solo lectura).
 *   - no descubre schema (SqlCommandSchemaDiscovery's job, Fase 16/17).
 *   - no soporta Stored Procedures — un comando con
 *     command_type === 'stored_procedure' ni siquiera aparece en la lista.
 *   - no llama /datasources/{alias}/query ni ninguna ruta de Stored
 *     Procedure — el único fetch() de este archivo es
 *     POST /sql-commands/execute.
 *   - no toca Field Explorer, FIELD_TREE, ni el document serializer.
 *   - no persiste el resultado en el reporte (ni en DS, ni en el JSON
 *     exportado por CommandRuntimeFile — el resultado vive únicamente en
 *     memoria de este panel mientras está abierto).
 *   - no muestra el SQL completo del comando en ningún estado (evita
 *     exponer literales sensibles) — solo nombre/id y datasource_alias.
 *   - no loggea nada a consola.
 *   - no modifica SqlCommandEditor.js ni SqlCommandsListPanel.js — tiene
 *     su propio botón de toolbar independiente, igual que los otros 3
 *     componentes de SQL Command (SqlCommandEditor, StoredProcedurePicker,
 *     SqlCommandsListPanel) — patrón ya establecido, no uno nuevo.
 *
 * Estados UI (this._uiState): ready | confirming | running | success |
 * empty | blocked | error | timeout. "ready" es la vista de lista.
 */
const SqlCommandExecutionPanel = {
  _el: null,
  _uiState: 'ready',
  _selected: null,
  _confirmed: false,
  _lastResult: null,

  // Timeout fijo, visible, no editable por el usuario — evita "ejecución
  // libre" con un valor arbitrario. Coincide con el default del backend
  // (sql_query_limits.DEFAULT_TIMEOUT_SECONDS) pero se envía explícito
  // para que el usuario siempre vea el valor real que se está pidiendo.
  _FIXED_TIMEOUT_SECONDS: 30,

  open() {
    this.close();
    this._uiState = 'ready';
    this._selected = null;
    this._confirmed = false;
    this._lastResult = null;

    const ov = document.createElement('div');
    ov.id = 'sql-command-execution-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;';

    const dlg = document.createElement('div');
    dlg.id = 'scep-dialog';
    dlg.style.cssText = 'background:#ECE9D8;border:2px solid #0A246A;width:560px;max-height:80vh;display:flex;flex-direction:column;font-family:Tahoma,sans-serif;font-size:11px;box-shadow:4px 4px 16px rgba(0,0,0,.5);';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(#1C52A0,#3A6EA5);color:#FFF;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML = '<span style="font-weight:bold">Ejecutar SQL Command (preview limitado)</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#FFF;font-size:14px;background:none;border:none;cursor:pointer;padding:0 4px;';
    closeBtn.onclick = () => this.close();
    hdr.appendChild(closeBtn);
    dlg.appendChild(hdr);

    const body = document.createElement('div');
    body.id = 'scep-body';
    body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;';
    dlg.appendChild(body);

    ov.appendChild(dlg);
    document.body.appendChild(ov);
    this._el = ov;
    this._render();
  },

  _render() {
    const body = document.getElementById('scep-body');
    if (!body) return;
    body.innerHTML = '';

    if (this._uiState === 'ready') {
      body.appendChild(this._renderList());
      return;
    }
    body.appendChild(this._renderDetail());
  },

  _eligibleCommands() {
    if (typeof SqlCommandStore === 'undefined') return [];
    return SqlCommandStore.list().filter((c) => c.command_type !== 'stored_procedure' && !!c.sql);
  },

  _renderList() {
    const wrap = document.createElement('div');
    const commands = this._eligibleCommands();

    if (!commands.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#888;font-style:italic;padding:4px;';
      empty.textContent = 'No hay SQL Commands guardados que se puedan ejecutar (los stored procedures no aparecen aquí).';
      wrap.appendChild(empty);
      return wrap;
    }

    commands.forEach((cmd) => wrap.appendChild(this._renderListRow(cmd)));
    return wrap;
  },

  _renderListRow(cmd) {
    const row = document.createElement('div');
    row.className = 'scep-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px;border-bottom:1px solid #D8D4C4;';

    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0;';
    const nameEl = document.createElement('div');
    nameEl.style.cssText = 'font-weight:bold;';
    nameEl.textContent = cmd.name || cmd.id;
    const aliasEl = document.createElement('div');
    aliasEl.style.cssText = 'font-size:10px;color:#555;';
    aliasEl.textContent = cmd.datasource_alias
      ? `datasource: ${cmd.datasource_alias}`
      : 'Sin datasource asociado — no se puede ejecutar';
    info.appendChild(nameEl);
    info.appendChild(aliasEl);
    row.appendChild(info);

    const runBtn = document.createElement('button');
    runBtn.className = 'scep-select-btn';
    runBtn.textContent = 'Ejecutar';
    runBtn.disabled = !cmd.datasource_alias;
    runBtn.style.cssText = 'padding:2px 10px;border:1px solid #ACA899;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:10px;flex-shrink:0;';
    if (runBtn.disabled) runBtn.style.opacity = '0.5';
    runBtn.onclick = () => this._selectCommand(cmd);
    row.appendChild(runBtn);

    return row;
  },

  _selectCommand(cmd) {
    // Defense in depth — the list already filters/disables these cases,
    // but this method never trusts the caller alone (contract point 2/3).
    if (!cmd || !cmd.datasource_alias || !cmd.sql || cmd.command_type === 'stored_procedure') return;
    this._selected = cmd;
    this._confirmed = false;
    this._lastResult = null;
    this._uiState = 'confirming';
    this._render();
  },

  _renderDetail() {
    const wrap = document.createElement('div');
    const cmd = this._selected;
    if (!cmd) return wrap;

    const summary = document.createElement('div');
    summary.style.cssText = 'background:#FFF;border:1px inset #ACA899;padding:6px;font-size:10px;';
    summary.innerHTML =
      `<div><b>Comando:</b> ${_escapeHtml(cmd.name || cmd.id)}</div>` +
      `<div><b>Datasource:</b> ${_escapeHtml(cmd.datasource_alias)}</div>` +
      `<div><b>Max rows:</b> ${_escapeHtml(String(cmd.max_rows_preview || 100))}</div>` +
      `<div><b>Timeout:</b> ${this._FIXED_TIMEOUT_SECONDS}s</div>`;
    wrap.appendChild(summary);

    if (this._uiState === 'confirming' || this._uiState === 'running') {
      wrap.appendChild(this._renderConfirmArea());
    } else {
      wrap.appendChild(this._renderResultArea());
    }

    const backBtn = document.createElement('button');
    backBtn.id = 'scep-back-btn';
    backBtn.textContent = 'Volver';
    backBtn.disabled = this._uiState === 'running';
    backBtn.style.cssText = 'margin-top:6px;padding:2px 12px;border:2px solid #716F64;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:11px;';
    backBtn.onclick = () => { this._uiState = 'ready'; this._selected = null; this._render(); };
    wrap.appendChild(backBtn);

    return wrap;
  },

  _renderConfirmArea() {
    const area = document.createElement('div');
    area.style.cssText = 'margin-top:8px;display:flex;flex-direction:column;gap:6px;';

    const warning = document.createElement('div');
    warning.id = 'scep-warning';
    warning.style.cssText = 'color:#7D1F1F;font-size:10px;background:#FFF3F3;border:1px solid #E0B0B0;padding:6px;';
    warning.textContent = 'Solo SELECT/WITH read-only. Se audita la ejecución. No se ejecutan Stored Procedures.';
    area.appendChild(warning);

    const confirmRow = document.createElement('label');
    confirmRow.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:10px;cursor:pointer;';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'scep-confirm-checkbox';
    checkbox.checked = this._confirmed;
    checkbox.disabled = this._uiState === 'running';
    checkbox.addEventListener('change', () => {
      this._confirmed = checkbox.checked;
      this._render();
    });
    confirmRow.appendChild(checkbox);
    const confirmText = document.createElement('span');
    confirmText.textContent = 'Confirmo ejecutar este SQL Command en modo read-only limitado.';
    confirmRow.appendChild(confirmText);
    area.appendChild(confirmRow);

    const runBtn = document.createElement('button');
    runBtn.id = 'scep-run-btn';
    runBtn.textContent = this._uiState === 'running' ? 'Ejecutando…' : 'Run preview';
    runBtn.disabled = !this._confirmed || this._uiState === 'running';
    runBtn.style.cssText = 'padding:3px 14px;border:2px solid #0A246A;background:#1C52A0;color:#FFF;cursor:pointer;font-family:Tahoma;font-size:11px;font-weight:bold;align-self:flex-start;';
    if (runBtn.disabled) runBtn.style.opacity = '0.6';
    runBtn.onclick = () => this._runExecution();
    area.appendChild(runBtn);

    return area;
  },

  _renderResultArea() {
    const area = document.createElement('div');
    area.style.cssText = 'margin-top:8px;';
    const r = this._lastResult || {};

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
      msg.style.cssText = 'color:#555;font-style:italic;padding:6px;';
      msg.textContent = 'Sin resultados (0 filas).';
      area.appendChild(msg);
    } else if (this._uiState === 'blocked') {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#7D1F1F;background:#FFF3F3;border:1px solid #E0B0B0;padding:6px;font-size:10px;';
      msg.textContent = 'Bloqueado: ' + (r.reason || 'este comando no puede ejecutarse.');
      area.appendChild(msg);
    } else if (this._uiState === 'timeout') {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#7D5A1F;background:#FFF8E8;border:1px solid #E0C890;padding:6px;font-size:10px;';
      msg.textContent = 'Tiempo de espera agotado (timeout).';
      area.appendChild(msg);
    } else if (this._uiState === 'error') {
      const msg = document.createElement('div');
      msg.style.cssText = 'color:#7D1F1F;background:#FFF3F3;border:1px solid #E0B0B0;padding:6px;font-size:10px;';
      msg.textContent = 'Error: ' + (r.safe_error || 'ocurrió un error ejecutando el comando.');
      area.appendChild(msg);
    }

    return area;
  },

  _renderTable(columns, rows) {
    const table = document.createElement('table');
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
    const cmd = this._selected;
    // Defense in depth — mirrors _selectCommand's own checks; the run
    // button is already disabled unless both hold, but this method never
    // trusts DOM state alone as the only gate (contract points 2/4/5).
    if (!cmd || !cmd.datasource_alias || !this._confirmed) return;

    this._uiState = 'running';
    this._render();

    const parameterValues = {};
    (cmd.parameters || []).forEach((p) => {
      const v = (typeof ParameterValueController !== 'undefined') ? ParameterValueController.getValue(p.name) : undefined;
      if (v !== undefined && v !== null) parameterValues[p.name] = v;
    });

    const payload = {
      alias: cmd.datasource_alias,
      confirm: true,
      sql_command: { ...cmd },
      parameter_values: parameterValues,
      timeout: this._FIXED_TIMEOUT_SECONDS,
    };

    let res, data;
    try {
      res = await fetch('/sql-commands/execute', {
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

if (typeof window !== 'undefined') window.SqlCommandExecutionPanel = SqlCommandExecutionPanel;
if (typeof module !== 'undefined') module.exports = SqlCommandExecutionPanel;

// Minimal self-contained wiring: the HTML only needs the button element
// (no inline onclick/logic) — this file owns opening itself, same
// pattern as SqlCommandEditor.js / StoredProcedurePicker.js / SqlCommandsListPanel.js.
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('btn-sql-command-execute')?.addEventListener('click', () => SqlCommandExecutionPanel.open());
  });
}
