'use strict';
/**
 * SQLModal
 *
 * Modal "Conexión SQL" — Crystal Reports style.
 * Allows registering and testing a MSSQL datasource connection from the UI.
 *
 * Security:
 *   - Password field type=password, never echoed or logged.
 *   - Password sent only in request body over HTTPS/loopback — never stored in
 *     cleartext in JS state after the request completes.
 *   - GET /datasources never returns credentials (uses list_registered_safe).
 *
 * API pública:
 *   SQLModal.open()   → abre el modal (idempotente)
 *   SQLModal.close()  → cierra el modal (idempotente)
 */
(function initSQLModal(global) {

  let _modal  = null;
  let _statusEl = null;

  // ── DOM helper (same pattern as DocumentLoadModal) ────────────────────────

  function _el(tag, props) {
    const node = global.document.createElement(tag);
    if (!props) return node;
    if (props.id)        node.id          = props.id;
    if (props.className) node.className   = props.className;
    if (props.text)      node.textContent = props.text;
    if (props.style)     node.style.cssText = props.style;
    if (props.role)      node.setAttribute('role', props.role);
    if (props.type)      node.setAttribute('type', props.type);
    if (props.value)     node.value = props.value;
    if (props.placeholder) node.setAttribute('placeholder', props.placeholder);
    if (props.for)       node.setAttribute('for', props.for);
    return node;
  }

  // ── Modal builder ─────────────────────────────────────────────────────────

  function _buildModal() {
    const backdrop = _el('div', {
      id:    'sql-modal',
      role:  'dialog',
      style: [
        'position:fixed;inset:0;',
        'display:flex;align-items:center;justify-content:center;',
        'background:rgba(0,0,0,0.35);',
        'z-index:9999;',
        'font-family:Tahoma,"Microsoft Sans Serif",Arial,sans-serif;',
        'font-size:11px;',
      ].join(''),
    });
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-label', 'Conexión SQL');

    const dialog = _el('div', {
      style: [
        'background:#ECE9D8;',
        'border:2px solid #0A246A;',
        'box-shadow:3px 3px 8px rgba(0,0,0,0.5);',
        'min-width:320px;max-width:420px;width:380px;',
      ].join(''),
    });

    /* Title bar */
    const titlebar = _el('div', {
      style: [
        'background:linear-gradient(to bottom,#0A246A,#3A6EA5);',
        'color:#fff;',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:3px 6px;user-select:none;',
      ].join(''),
    });
    titlebar.appendChild(_el('span', { text: 'Conexión SQL', style: 'font-weight:bold;font-size:11px;' }));
    const closeBtn = _el('button', {
      id:    'sqlm-close',
      text:  '×',
      style: [
        'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);',
        'border:1px outset #AAAAAA;border-radius:2px;',
        'color:#000;font-weight:bold;font-size:12px;',
        'width:18px;height:18px;cursor:pointer;',
        'display:flex;align-items:center;justify-content:center;padding:0;',
      ].join(''),
    });
    titlebar.appendChild(closeBtn);

    /* Body */
    const body = _el('div', { style: 'padding:12px 14px 8px;display:flex;flex-direction:column;gap:6px;' });

    const _row = (labelText, inputEl) => {
      const row = _el('div', { style: 'display:flex;align-items:center;gap:8px;' });
      const lbl = _el('label', { text: labelText, style: 'min-width:72px;text-align:right;' });
      lbl.setAttribute('for', inputEl.id);
      inputEl.style.cssText += 'flex:1;border:1px inset #808080;background:white;padding:1px 4px;font-family:inherit;font-size:11px;';
      row.appendChild(lbl);
      row.appendChild(inputEl);
      return row;
    };

    const aliasIn = _el('input', { id: 'sqlm-alias', type: 'text', placeholder: 'sap_b1' });
    const hostIn  = _el('input', { id: 'sqlm-host',  type: 'text', placeholder: 'hostname o IP' });
    const portIn  = _el('input', { id: 'sqlm-port',  type: 'text', value: '1433' });
    const dbIn    = _el('input', { id: 'sqlm-db',    type: 'text', placeholder: 'SBO_EMPRESA' });
    const userIn  = _el('input', { id: 'sqlm-user',  type: 'text', placeholder: 'usuario' });
    const passIn  = _el('input', { id: 'sqlm-pass',  type: 'password', placeholder: '••••••••' });

    body.appendChild(_row('Alias:',      aliasIn));
    body.appendChild(_row('Servidor:',   hostIn));
    body.appendChild(_row('Puerto:',     portIn));
    body.appendChild(_row('Base datos:', dbIn));
    body.appendChild(_row('Usuario:',    userIn));
    body.appendChild(_row('Contraseña:', passIn));

    /* Status */
    const statusEl = _el('div', {
      id:    'sqlm-status',
      style: 'min-height:16px;font-size:10px;word-break:break-word;margin-top:2px;user-select:text;cursor:text;',
    });
    statusEl.setAttribute('data-status-type', 'idle');
    body.appendChild(statusEl);

    /* Footer */
    const footer = _el('div', {
      style: [
        'padding:6px 14px 10px;',
        'display:flex;justify-content:flex-end;gap:6px;',
        'border-top:1px solid #ACA899;',
      ].join(''),
    });
    const testBtn   = _el('button', { id: 'sqlm-test',   text: 'Probar conexión',
      style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:11px;' });
    const saveBtn   = _el('button', { id: 'sqlm-save',   text: 'Guardar',
      style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;padding:3px 16px;cursor:pointer;font-family:inherit;font-size:11px;' });
    const cancelBtn = _el('button', { id: 'sqlm-cancel', text: 'Cancelar',
      style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:11px;' });
    footer.appendChild(testBtn);
    footer.appendChild(saveBtn);
    footer.appendChild(cancelBtn);

    dialog.appendChild(titlebar);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    backdrop.appendChild(dialog);

    _statusEl = statusEl;
    return backdrop;
  }

  // ── Status helper ─────────────────────────────────────────────────────────

  function _setStatus(state) {
    if (!_statusEl) return;
    _statusEl.setAttribute('data-status-type', state.type);
    if (state.type === 'idle') {
      _statusEl.textContent = '';
    } else if (state.type === 'testing') {
      _statusEl.textContent = 'Probando conexión…';
      _statusEl.style.color = '#004080';
    } else if (state.type === 'saving') {
      _statusEl.textContent = 'Guardando…';
      _statusEl.style.color = '#004080';
    } else if (state.type === 'ok') {
      _statusEl.textContent = '✓ ' + state.message;
      _statusEl.style.color = '#006600';
    } else if (state.type === 'error') {
      _statusEl.textContent = '✗ ' + state.message;
      _statusEl.style.color = '#CC0000';
    }
  }

  // ── Field reader — never logs password ───────────────────────────────────

  function _readFields() {
    if (!_modal) return null;
    const alias = (_modal.querySelector('#sqlm-alias')?.value || '').trim();
    const host  = (_modal.querySelector('#sqlm-host')?.value  || '').trim();
    const port  = parseInt((_modal.querySelector('#sqlm-port')?.value || '1433').trim(), 10) || 1433;
    const db    = (_modal.querySelector('#sqlm-db')?.value    || '').trim();
    const user  = (_modal.querySelector('#sqlm-user')?.value  || '').trim();
    const pass  = (_modal.querySelector('#sqlm-pass')?.value  || '');
    return { alias, host, port, database: db, username: user, password: pass };
  }

  // ── Test handler ──────────────────────────────────────────────────────────

  async function _handleTest() {
    const f = _readFields();
    if (!f) return;
    if (!f.host || !f.database || !f.username || !f.password) {
      _setStatus({ type: 'error', message: 'Servidor, base de datos, usuario y contraseña son obligatorios' });
      return;
    }
    _setStatus({ type: 'testing' });
    try {
      const res = await global.fetch('/datasources/_test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          host: f.host, port: f.port, database: f.database,
          username: f.username, password: f.password,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        _setStatus({ type: 'ok', message: data.message + (data.latency_ms != null ? ` (${data.latency_ms} ms)` : '') });
      } else {
        _setStatus({ type: 'error', message: data.message || 'Error de conexión' });
      }
    } catch (err) {
      _setStatus({ type: 'error', message: 'Error de red: ' + err.message });
    }
  }

  // ── Save handler ──────────────────────────────────────────────────────────

  async function _handleSave() {
    const f = _readFields();
    if (!f) return;
    if (!f.alias) {
      _setStatus({ type: 'error', message: 'El alias es obligatorio' });
      return;
    }
    if (!f.host || !f.database || !f.username || !f.password) {
      _setStatus({ type: 'error', message: 'Servidor, base de datos, usuario y contraseña son obligatorios' });
      return;
    }
    _setStatus({ type: 'saving' });
    try {
      const res = await global.fetch(`/datasources/${encodeURIComponent(f.alias)}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias: f.alias, host: f.host, port: f.port, database: f.database,
          username: f.username, password: f.password,
        }),
      });
      const data = await res.json();
      if (data.registered) {
        _setStatus({ type: 'ok', message: `Conexión '${f.alias}' guardada` + (data.reachable ? '' : ' (servidor no alcanzable)') });
      } else {
        _setStatus({ type: 'error', message: data.message || 'No se pudo guardar la conexión' });
      }
    } catch (err) {
      _setStatus({ type: 'error', message: 'Error de red: ' + err.message });
    }
  }

  // ── open / close ──────────────────────────────────────────────────────────

  function open() {
    if (_modal) return;
    _modal = _buildModal();
    global.document.body.appendChild(_modal);

    const closeBtn  = _modal.querySelector('#sqlm-close');
    const cancelBtn = _modal.querySelector('#sqlm-cancel');
    const testBtn   = _modal.querySelector('#sqlm-test');
    const saveBtn   = _modal.querySelector('#sqlm-save');

    if (closeBtn)  closeBtn.addEventListener('click',  close);
    if (cancelBtn) cancelBtn.addEventListener('click', close);
    if (testBtn)   testBtn.addEventListener('click',   _handleTest);
    if (saveBtn)   saveBtn.addEventListener('click',   _handleSave);

    _modal.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        _handleTest();
      }
    });
  }

  function close() {
    if (!_modal) return;
    _modal.remove();
    _modal    = null;
    _statusEl = null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  const SQLModal = { open, close };
  global.SQLModal = SQLModal;
  if (typeof module !== 'undefined') module.exports = SQLModal;

})(typeof window !== 'undefined' ? window : globalThis);
