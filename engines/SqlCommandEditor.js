'use strict';

/**
 * SqlCommandEditor — UDS 4.1 Fase 8.
 *
 * Responsabilidad única: editor modal de un SQL command crudo (estilo
 * Crystal, con placeholders {?Param}). Llama a POST /sql-commands/parse
 * (backend) para detectar parámetros y obtener SQL preparado, muestra el
 * resultado o el error, y al "Aceptar" solo CONSTRUYE un objeto en
 * memoria — nunca lo persiste en el documento ni en ningún store.
 *
 * NO hace:
 *   - no ejecuta SQL (nunca llama a ningún endpoint de ejecución/query).
 *   - no renderiza ni previsualiza nada.
 *   - no toca Field Explorer.
 *   - no persiste en el documento (CommandRuntimeFile no se importa ni
 *     se referencia).
 *   - el SQL crudo con {?Param} vive solo en el textarea de este editor;
 *     nunca se asigna directo a SqlCommandModel.sql — solo el
 *     prepared_sql que devuelve el backend (ya con :Name) se usa para
 *     construir el comando.
 */
const SqlCommandEditor = {
  _el: null,
  _lastBuilt: null,

  open(existingName = '', existingSql = '') {
    this.close();
    const ov = document.createElement('div');
    ov.id = 'sql-command-editor-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;';

    const dlg = document.createElement('div');
    dlg.style.cssText = 'background:#ECE9D8;border:2px solid #0A246A;width:720px;max-height:85vh;display:flex;flex-direction:column;font-family:Tahoma,sans-serif;font-size:11px;box-shadow:4px 4px 16px rgba(0,0,0,.5);';

    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(#1C52A0,#3A6EA5);color:#FFF;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML = '<span style="font-weight:bold">SQL Command Editor — Crystal-like {?Param} syntax</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'color:#FFF;font-size:14px;background:none;border:none;cursor:pointer;padding:0 4px;';
    closeBtn.onclick = () => this.close();
    hdr.appendChild(closeBtn);
    dlg.appendChild(hdr);

    const body = document.createElement('div');
    body.style.cssText = 'padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;';

    const nameRow = document.createElement('div');
    nameRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    nameRow.innerHTML = '<span style="width:94px;font-weight:bold;">Command name:</span>';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'sce-name';
    nameInput.value = existingName;
    nameInput.placeholder = 'e.g. VentasPorFecha';
    nameInput.style.cssText = 'flex:1;font-family:Courier New,monospace;font-size:11px;padding:2px 4px;border:1px inset #ACA899;';
    nameRow.appendChild(nameInput);
    body.appendChild(nameRow);

    const sqlLabel = document.createElement('div');
    sqlLabel.innerHTML = '<span style="font-weight:bold">SQL (usar {?Param} para parámetros):</span>';
    body.appendChild(sqlLabel);

    const ta = document.createElement('textarea');
    ta.id = 'sce-sql';
    ta.value = existingSql;
    ta.placeholder = 'SELECT DocNum, DocDate, CardName, DocTotal\nFROM OINV\nWHERE DocDate >= {?FechaDesde}\n  AND DocDate <= {?FechaHasta}';
    ta.style.cssText = 'width:100%;height:120px;font-family:Courier New,monospace;font-size:12px;padding:4px;border:1px inset #ACA899;resize:vertical;';
    body.appendChild(ta);

    const detectRow = document.createElement('div');
    detectRow.style.cssText = 'display:flex;align-items:center;gap:8px;';
    const detectBtn = document.createElement('button');
    detectBtn.textContent = 'Detectar parámetros';
    detectBtn.style.cssText = 'padding:3px 12px;border:1px solid #ACA899;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:11px;';
    detectBtn.onclick = () => this._detect();
    const statusBadge = document.createElement('span');
    statusBadge.id = 'sce-status';
    statusBadge.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:2px;';
    detectRow.appendChild(detectBtn);
    detectRow.appendChild(statusBadge);
    body.appendChild(detectRow);

    const resultBox = document.createElement('div');
    resultBox.id = 'sce-result';
    resultBox.style.cssText = 'font-size:10px;color:#333;background:#FFF;border:1px inset #ACA899;padding:6px;min-height:60px;white-space:pre-wrap;font-family:Courier New,monospace;';
    resultBox.textContent = '(sin detectar todavía)';
    body.appendChild(resultBox);

    const noteRow = document.createElement('div');
    noteRow.style.cssText = 'font-size:10px;color:#7D1F1F;font-style:italic;';
    noteRow.textContent = 'Nota: "Aceptar" solo construye el comando en memoria — no se guarda permanentemente en el documento todavía.';
    body.appendChild(noteRow);

    dlg.appendChild(body);

    const ftr = document.createElement('div');
    ftr.style.cssText = 'padding:6px 8px;border-top:1px solid #ACA899;display:flex;justify-content:flex-end;gap:6px;flex-shrink:0;background:#D4D0C8;';
    const btnCancel = document.createElement('button');
    btnCancel.textContent = 'Cancelar';
    btnCancel.style.cssText = 'padding:2px 16px;border:2px solid #716F64;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:11px;';
    btnCancel.onclick = () => this.close();
    const btnAccept = document.createElement('button');
    btnAccept.id = 'sce-accept';
    btnAccept.textContent = 'Aceptar';
    btnAccept.style.cssText = 'padding:2px 16px;border:2px solid #0A246A;background:#1C52A0;color:#FFF;cursor:pointer;font-family:Tahoma;font-size:11px;font-weight:bold;';
    btnAccept.disabled = true;
    btnAccept.onclick = () => this._accept();
    ftr.appendChild(btnCancel);
    ftr.appendChild(btnAccept);
    dlg.appendChild(ftr);

    ov.appendChild(dlg);
    document.body.appendChild(ov);
    this._el = ov;
    this._lastBuilt = null;
    nameInput.focus();
  },

  async _detect() {
    const sqlEl = document.getElementById('sce-sql');
    const statusEl = document.getElementById('sce-status');
    const resultEl = document.getElementById('sce-result');
    const acceptBtn = document.getElementById('sce-accept');
    if (!sqlEl || !statusEl || !resultEl) return;

    const rawSql = sqlEl.value;
    acceptBtn.disabled = true;
    this._lastBuilt = null;
    statusEl.textContent = 'Consultando…';
    statusEl.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:2px;background:#666;color:#FFF;';

    let data;
    try {
      const res = await fetch('/sql-commands/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sql: rawSql }),
      });
      data = await res.json();
    } catch (err) {
      statusEl.textContent = '⚠ Error de red';
      statusEl.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:2px;background:#7D1F1F;color:#FFF;';
      resultEl.textContent = String(err);
      return;
    }

    if (!data.valid) {
      statusEl.textContent = '⚠ Inválido';
      statusEl.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:2px;background:#7D1F1F;color:#FFF;';
      resultEl.textContent = 'Error: ' + data.error;
      return;
    }

    const guard = data.guard || {};
    if (guard.allowed === false) {
      statusEl.textContent = '⚠ Bloqueado por guard: ' + guard.kind;
      statusEl.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:2px;background:#7D1F1F;color:#FFF;';
      resultEl.textContent = 'Este SQL no podrá ejecutarse: ' + guard.reason
        + '\n\nSQL preparado:\n' + data.prepared_sql
        + '\n\nParámetros detectados: ' + (data.parameters.join(', ') || '(ninguno)');
      // No bloqueamos "Aceptar": el editor solo construye/normaliza, no
      // ejecuta — la decisión de guardar algo que el guard rechazaría
      // queda para el flujo de guardado real (fuera de esta fase).
      acceptBtn.disabled = false;
      this._lastBuilt = { preparedSql: data.prepared_sql, parameters: data.parameters, bindOrder: data.bind_order, guard };
      return;
    }

    statusEl.textContent = '✓ OK';
    statusEl.style.cssText = 'font-size:10px;padding:2px 6px;border-radius:2px;background:#1E5F4A;color:#FFF;';
    resultEl.textContent = 'SQL preparado:\n' + data.prepared_sql
      + '\n\nParámetros detectados: ' + (data.parameters.join(', ') || '(ninguno)');
    acceptBtn.disabled = false;
    this._lastBuilt = { preparedSql: data.prepared_sql, parameters: data.parameters, bindOrder: data.bind_order, guard };
  },

  _accept() {
    const nameEl = document.getElementById('sce-name');
    if (!this._lastBuilt) return;
    const name = (nameEl?.value || '').trim() || '(sin nombre)';
    const msgEl = document.getElementById('sce-result');
    if (msgEl) {
      msgEl.textContent = 'Comando "' + name + '" construido en memoria (NO guardado permanentemente):\n'
        + this._lastBuilt.preparedSql
        + '\n\nParámetros: ' + (this._lastBuilt.parameters.join(', ') || '(ninguno)');
    }
  },

  close() {
    this._el?.remove();
    this._el = null;
  },
};

window.SqlCommandEditor = SqlCommandEditor;

// Minimal self-contained wiring: the HTML only needs the button element
// (no inline onclick/logic) — this file owns opening itself.
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-sql-command-editor')?.addEventListener('click', () => SqlCommandEditor.open());
});

