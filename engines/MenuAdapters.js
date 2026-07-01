'use strict';

(function initMenuAdapters(global) {
  const ContextMenuEngine = {
    show(x, y, context = 'canvas') {
      const menu = document.getElementById('ctx-menu');
      const items = context === 'element' ? [
        { label: 'Formatear campo...', action: 'format-field', icon: '⚙' },
        { label: 'Propiedades...', action: 'open-properties', icon: '📋' },
        { sep: true },
        { label: 'Cortar', action: 'cut', short: 'Ctrl+X', icon: '✂' },
        { label: 'Copiar', action: 'copy', short: 'Ctrl+C', icon: '📋' },
        { label: 'Pegar', action: 'paste', short: 'Ctrl+V', icon: '📌' },
        { label: 'Eliminar', action: 'delete', short: 'Del', icon: '🗑' },
        { sep: true },
        { label: 'Traer al frente', action: 'bring-front', icon: '🔼' },
        { label: 'Enviar al fondo', action: 'send-back', icon: '🔽' },
        { sep: true },
        { label: 'Alinear izquierda',  action: 'align-lefts' },
        { label: 'Centrar horizontal', action: 'align-centers' },
        { label: 'Alinear derecha',    action: 'align-rights' },
        { sep: true },
        { label: 'Alinear arriba',     action: 'align-tops' },
        { label: 'Centrar vertical',   action: 'align-middles' },
        { label: 'Alinear abajo',      action: 'align-bottoms' },
        { sep: true },
        { label: 'Mismo ancho',        action: 'same-width' },
        { label: 'Misma altura',       action: 'same-height' },
        { label: 'Mismo tamaño',       action: 'same-size' },
      ] : [
        { label: 'Insertar > Texto', action: 'insert-text' },
        { label: 'Insertar > Campo', action: 'insert-field' },
        { label: 'Insertar > Línea', action: 'insert-line' },
        { label: 'Insertar > Rectángulo', action: 'insert-box' },
        { sep: true },
        { label: 'Pegar', action: 'paste', short: 'Ctrl+V', icon: '📌' },
        { sep: true },
        { label: 'Seleccionar todo', action: 'select-all', short: 'Ctrl+A' },
      ];
      menu.innerHTML = '';
      items.forEach((item) => {
        if (item.sep) {
          const separator = document.createElement('div');
          separator.className = 'ctx-item separator';
          menu.appendChild(separator);
          return;
        }
        const entry = document.createElement('div');
        entry.className = 'ctx-item';
        entry.innerHTML = `<span class="ctx-icon">${item.icon || ''}</span><span>${item.label}</span>${item.short ? `<span class="ctx-shortcut">${item.short}</span>` : ''}`;
        entry.addEventListener('click', () => { this.hide(); handleAction(item.action); });
        menu.appendChild(entry);
      });
      const pw = 170;
      const ph = items.reduce((s, i) => s + (i.sep ? 5 : 22), 0) + 4;
      menu.style.left = `${Math.min(x, window.innerWidth - pw - 4)}px`;
      menu.style.top = `${Math.max(0, Math.min(y, window.innerHeight - ph - 4))}px`;
      menu.classList.add('visible');
    },
    hide() {
      document.getElementById('ctx-menu').classList.remove('visible');
    }
  };

  const MenuEngine = {
    _open: null,
    init() {
      document.querySelectorAll('.menu-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const menu = item.dataset.menu;
          if (this._open === menu) {
            this.closeAll();
            return;
          }
          this.closeAll();
          this._open = menu;
          item.classList.add('open');
          const dropdown = document.getElementById(`dd-${menu}`);
          if (!dropdown) return;
          const rect = item.getBoundingClientRect();
          dropdown.style.left = `${rect.left}px`;
          dropdown.style.top = `${rect.bottom}px`;
          dropdown.classList.add('visible');
        });
      });
      document.addEventListener('click', () => this.closeAll());
      document.querySelectorAll('.dd-item').forEach((item) => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.closeAll();
          handleAction(item.dataset.action);
        });
      });
    },
    closeAll() {
      this._open = null;
      document.querySelectorAll('.menu-item').forEach((menu) => menu.classList.remove('open'));
      document.querySelectorAll('.dropdown').forEach((dropdown) => dropdown.classList.remove('visible'));
    }
  };

  function initMenuBindings() {
    MenuEngine.init();
  }

  global.ContextMenuEngine = ContextMenuEngine;
  global.MenuEngine = MenuEngine;
  global.initMenuBindings = initMenuBindings;
})(window);
