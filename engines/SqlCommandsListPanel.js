'use strict';

/**
 * SqlCommandsListPanel — UDS 4.1 Fase 13 (extendido Fase 17). Modal de
 * ver + eliminar comandos guardados; cada fila también dispara
 * SqlCommandSchemaDiscovery.discover(cmd) (fail-closed delegado a F16) y
 * muestra su resultado. No edita, no ejecuta SQL, no serializa.
 */
const SqlCommandsListPanel = {
  _el: null,

  open() {
    this.close();
    const ov = document.createElement('div'); ov.id = 'sql-commands-list-overlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;';
    const dlg = document.createElement('div');
    dlg.style.cssText = 'background:#ECE9D8;border:2px solid #0A246A;width:520px;max-height:70vh;display:flex;flex-direction:column;font-family:Tahoma,sans-serif;font-size:11px;box-shadow:4px 4px 16px rgba(0,0,0,.5);';
    const hdr = document.createElement('div');
    hdr.style.cssText = 'background:linear-gradient(#1C52A0,#3A6EA5);color:#FFF;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML = '<span style="font-weight:bold">SQL Commands guardados</span>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕'; closeBtn.style.cssText = 'color:#FFF;font-size:14px;background:none;border:none;cursor:pointer;padding:0 4px;';
    closeBtn.onclick = () => this.close();
    hdr.appendChild(closeBtn); dlg.appendChild(hdr);
    const body = document.createElement('div'); body.id = 'scl-body'; body.style.cssText = 'padding:8px;overflow-y:auto;flex:1;';
    dlg.appendChild(body);
    ov.appendChild(dlg); document.body.appendChild(ov);
    this._el = ov;
    this.render();
  },

  render() {
    const body = document.getElementById('scl-body');
    if (!body) return;
    body.innerHTML = '';
    const commands = SqlCommandStore.list();
    if (!commands.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'color:#888;font-style:italic;padding:4px;';
      empty.textContent = 'No hay comandos guardados en este documento';
      body.appendChild(empty);
      return;
    }
    commands.forEach((cmd) => body.appendChild(this._renderRow(cmd)));
  },

  _renderRow(cmd) {
    const row = document.createElement('div'); row.className = 'scl-row';
    row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px;border-bottom:1px solid #D8D4C4;';
    const info = document.createElement('div'); info.style.cssText = 'flex:1;min-width:0;';
    const nameEl = document.createElement('div'); nameEl.style.cssText = 'font-weight:bold;';
    nameEl.textContent = cmd.name + (cmd.command_type === 'stored_procedure' ? ' (procedure)' : '');
    const sqlEl = document.createElement('div');
    sqlEl.style.cssText = 'font-family:Courier New,monospace;font-size:10px;color:#555;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    sqlEl.textContent = cmd.sql; sqlEl.title = cmd.sql;
    const statusEl = document.createElement('div'); statusEl.className = 'scl-schema-status'; statusEl.style.cssText = 'font-size:9px;color:#666;';
    info.appendChild(nameEl); info.appendChild(sqlEl); info.appendChild(statusEl); row.appendChild(info);
    const discoverBtn = document.createElement('button');
    discoverBtn.textContent = 'Discover schema'; discoverBtn.className = 'scl-discover-btn';
    discoverBtn.style.cssText = 'padding:2px 8px;border:1px solid #ACA899;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:10px;flex-shrink:0;';
    discoverBtn.onclick = async () => {
      statusEl.textContent = 'Descubriendo columnas…';
      const r = await SqlCommandSchemaDiscovery.discover(cmd);
      statusEl.textContent = r.ok ? `✓ ${r.columns.length} columna(s)` : `⚠ ${r.error}`;
    };
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Eliminar'; delBtn.className = 'scl-remove-btn';
    delBtn.style.cssText = 'padding:2px 10px;border:1px solid #ACA899;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:10px;flex-shrink:0;';
    delBtn.onclick = () => { SqlCommandStore.remove(cmd.id); this.render(); };
    row.appendChild(discoverBtn); row.appendChild(delBtn);
    return row;
  },

  close() { this._el?.remove(); this._el = null; },
};

window.SqlCommandsListPanel = SqlCommandsListPanel;
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-sql-commands-list')?.addEventListener('click', () => SqlCommandsListPanel.open());
});
