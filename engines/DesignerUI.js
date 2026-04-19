'use strict';

const DesignerUI = {
  _mode: 'classic',
  init() {
    const saved = localStorage.getItem('rf-ui-mode');
    if (saved === 'modern') this.setMode('modern');
    else this.setMode('classic');
    const btn = document.getElementById('ui-mode-btn');
    if (btn && !btn.__rfBoundToggle) {
      btn.__rfBoundToggle = true;
      btn.addEventListener('click', () => this.toggleMode());
    }
  },
  toggleMode() { this.setMode(this._mode === 'classic' ? 'modern' : 'classic'); },
  setMode(mode) {
    this._mode = mode;
    const app = document.getElementById('app');
    if (!app) return;
    app.setAttribute('data-ui', mode);
    const btn = document.getElementById('ui-mode-btn');
    if (btn) btn.textContent = mode === 'classic' ? '◧ Classic' : '◨ Modern';
    try { localStorage.setItem('rf-ui-mode', mode); } catch(e) {}
    document.getElementById('sb-msg').textContent = mode === 'classic' ? 'Interfaz Classic — Crystal Reports' : 'Interfaz Modern — ReportForge Enterprise';
    console.log(`[ReportForge] UI mode: ${mode}`);
  },
};

window.DesignerUI = DesignerUI;
