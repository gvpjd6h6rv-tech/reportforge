'use strict';

const DebugTraceToggle = {
  _clickCount: 0, _lastClickAt: 0, _maxGapMs: 1000,
  _isDebugConsoleCall(method, args) { if (method === 'debug') return true; if (method === 'warn') return false; const first = args && args.length ? args[0] : ''; if (typeof first !== 'string') return false; return (first.startsWith('[RFTRACE') || first.startsWith('[EngineCore]') || first.startsWith('[ReportForge]') || first.startsWith('[v19') || first.startsWith('[RF] Preview') || first.startsWith('[PreviewEngineV19]') || first.startsWith('🔥 ')); },
  _installConsoleGate() { if (window.__rfConsoleGateInstalled === true || typeof console === 'undefined') return; window.__rfConsoleGateInstalled = true; window.__rfConsoleOriginal = { debug: console.debug ? console.debug.bind(console) : null, log: console.log ? console.log.bind(console) : null, info: console.info ? console.info.bind(console) : null, warn: console.warn ? console.warn.bind(console) : null }; ['debug', 'log', 'info', 'warn'].forEach(method => { const original = window.__rfConsoleOriginal[method]; if (typeof original !== 'function') return; console[method] = (...args) => { if (!DebugTraceToggle._isDebugConsoleCall(method, args) || DebugTrace.shouldAllowConsoleCall(args)) { original(...args); } }; }); },
  _indicator() { return document.getElementById('rf-debug-indicator'); },
  syncIndicator() { const indicator = this._indicator(); if (!indicator) return; const enabled = DebugTrace.getState().enabled === true; indicator.classList.toggle('is-on', enabled); DebugChannelsPanel.render(); if (typeof DebugOverlay !== 'undefined') DebugOverlay.syncVisibility(); },
  setEnabled(nextValue) { DebugTrace.setEnabled(!!nextValue); if (nextValue) DebugTrace.applyPreset('elements'); this.syncIndicator(); console.info(`[ReportForge] RF_DEBUG ${DebugTrace.getState().enabled ? 'enabled' : 'disabled'}`); },
  toggle() { this.setEnabled(!DebugTrace.getState().enabled); },
  _handleHomeClick() { const now = Date.now(); this._clickCount = (now - this._lastClickAt <= this._maxGapMs) ? this._clickCount + 1 : 1; this._lastClickAt = now; if (this._clickCount >= 4) { this._clickCount = 0; this._lastClickAt = 0; this.toggle(); } },
  init() { DebugTrace._ensureState(); this._installConsoleGate(); const homeTab = Array.from(document.querySelectorAll('.file-tab')).find(node => (node.textContent || '').trim() === 'Página de inicio'); if (!homeTab) return; homeTab.addEventListener('click', () => this._handleHomeClick()); this.syncIndicator(); },
};

window.DebugTraceToggle = DebugTraceToggle;
