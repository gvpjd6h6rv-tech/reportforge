'use strict';
var _global = globalThis;

const SQLConnectionModalView = {
  createNode(doc, tag, props) {
    const node = doc.createElement(tag);
    const p = props || {};
    if (p.id != null) node.id = p.id;
    if (p.text != null) node.textContent = p.text;
    if (p.style != null) node.style.cssText = p.style;
    if (p.role != null) node.setAttribute('role', p.role);
    if (p.type != null) node.setAttribute('type', p.type);
    if (p.placeholder != null) node.setAttribute('placeholder', p.placeholder);
    if (p.value != null) node.value = p.value;
    if (p.for != null) node.setAttribute('for', p.for);
    if (p.attrs) {
      for (const name in p.attrs) node.setAttribute(name, p.attrs[name]);
    }
    return node;
  },

  createRow(doc, labelText, control) {
    const row = this.createNode(doc, 'div', { style: 'display:flex;align-items:center;gap:8px;' });
    const label = this.createNode(doc, 'label', { text: labelText, style: 'min-width:72px;text-align:right;' });
    label.setAttribute('for', control.id);
    control.style.cssText += 'flex:1;border:1px inset #808080;background:white;padding:1px 4px;font-family:inherit;font-size:11px;';
    row.appendChild(label);
    row.appendChild(control);
    return row;
  },

  buildModal(doc) {
    const target = doc || _global.document;
    const root = this.createNode(target, 'div', {
      id: 'sql-modal',
      role: 'dialog',
      style: 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.35);z-index:9999;font-family:Tahoma,"Microsoft Sans Serif",Arial,sans-serif;font-size:11px;',
    });
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Conexión SQL');

    const dialog = this.createNode(target, 'div', {
      style: 'background:#ECE9D8;border:2px solid #0A246A;box-shadow:3px 3px 8px rgba(0,0,0,0.5);min-width:320px;max-width:420px;width:380px;',
    });

    const titlebar = this.createNode(target, 'div', {
      style: 'background:linear-gradient(to bottom,#0A246A,#3A6EA5);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:3px 6px;user-select:none;',
    });
    titlebar.appendChild(this.createNode(target, 'span', { text: 'Conexión SQL', style: 'font-weight:bold;font-size:11px;' }));
    const close = this.createNode(target, 'button', {
      id: 'sqlm-close',
      text: '×',
      style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;color:#000;font-weight:bold;font-size:12px;width:18px;height:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;',
    });
    titlebar.appendChild(close);

    const body = this.createNode(target, 'div', { style: 'padding:12px 14px 8px;display:flex;flex-direction:column;gap:6px;' });
    const fields = {
      alias: this.createNode(target, 'input', { id: 'sqlm-alias', type: 'text', placeholder: 'sap_b1' }),
      host: this.createNode(target, 'input', { id: 'sqlm-host', type: 'text', placeholder: 'hostname o IP' }),
      port: this.createNode(target, 'input', { id: 'sqlm-port', type: 'text', value: '1433' }),
      database: this.createNode(target, 'input', { id: 'sqlm-db', type: 'text', placeholder: 'SBO_EMPRESA' }),
      username: this.createNode(target, 'input', { id: 'sqlm-user', type: 'text', placeholder: 'usuario' }),
      password: this.createNode(target, 'input', { id: 'sqlm-pass', type: 'password', placeholder: '••••••••' }),
    };

    const rows = [
      ['Alias:', fields.alias],
      ['Servidor:', fields.host],
      ['Puerto:', fields.port],
      ['Base datos:', fields.database],
      ['Usuario:', fields.username],
      ['Contraseña:', fields.password],
    ];
    for (let i = 0; i < rows.length; i++) {
      body.appendChild(this.createRow(target, rows[i][0], rows[i][1]));
    }

    const status = this.createNode(target, 'div', {
      id: 'sqlm-status',
      style: 'min-height:16px;font-size:10px;word-break:break-word;margin-top:2px;user-select:text;cursor:text;',
    });
    status.setAttribute('data-status-type', 'idle');
    body.appendChild(status);

    const footer = this.createNode(target, 'div', { style: 'padding:6px 14px 10px;display:flex;justify-content:flex-end;gap:6px;border-top:1px solid #ACA899;' });
    const test = this.createNode(target, 'button', { id: 'sqlm-test', text: 'Probar conexión', style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:11px;' });
    const save = this.createNode(target, 'button', { id: 'sqlm-save', text: 'Guardar', style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;padding:3px 16px;cursor:pointer;font-family:inherit;font-size:11px;' });
    const cancel = this.createNode(target, 'button', { id: 'sqlm-cancel', text: 'Cancelar', style: 'background:linear-gradient(to bottom,#ECE9D8,#D4D0C8);border:1px outset #AAAAAA;border-radius:2px;padding:3px 10px;cursor:pointer;font-family:inherit;font-size:11px;' });
    footer.appendChild(test);
    footer.appendChild(save);
    footer.appendChild(cancel);

    dialog.appendChild(titlebar);
    dialog.appendChild(body);
    dialog.appendChild(footer);
    root.appendChild(dialog);
    target.body.appendChild(root);
    return { root, status, fields, buttons: { close, test, save, cancel } };
  },

  destroyModal(root) {
    if (root) root.remove();
  },

  renderStatus(statusEl, view) {
    if (!statusEl) return;
    const kind = view && view.type ? view.type : 'idle';
    statusEl.setAttribute('data-status-type', kind);
    statusEl.style.whiteSpace = kind === 'ok' ? 'normal' : 'pre-line';
    statusEl.style.color = kind === 'ok' ? '#006600' : kind === 'error' ? '#CC0000' : '#004080';
    statusEl.textContent = view && view.text ? view.text : '';
  },

  wireButtons(ctx) {
    if (!ctx || !ctx.buttons) return;
    if (ctx.buttons.close) ctx.buttons.close.addEventListener('click', ctx.onClose);
    if (ctx.buttons.cancel) ctx.buttons.cancel.addEventListener('click', ctx.onClose);
    if (ctx.buttons.test) ctx.buttons.test.addEventListener('click', ctx.onTest);
    if (ctx.buttons.save) ctx.buttons.save.addEventListener('click', ctx.onSave);
  },

  handleKeydown(event, onTest) {
    const target = event && event.target;
    if (event && event.key === 'Enter' && target && target.tagName === 'INPUT') {
      event.preventDefault();
      if (onTest) onTest();
    }
  },

  wireKeyboard(ctx) {
    if (!ctx || !ctx.root) return;
    ctx.root.addEventListener('keydown', function (event) {
      SQLConnectionModalView.handleKeydown(event, ctx.onTest);
    });
  },
};

_global.SQLConnectionModalView = SQLConnectionModalView;
if (typeof module !== 'undefined') module.exports = SQLConnectionModalView;
