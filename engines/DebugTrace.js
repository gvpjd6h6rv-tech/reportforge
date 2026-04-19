'use strict';

const DebugTrace = {
  STORAGE_KEY: 'RF_DEBUG_STATE_V1',
  DEFAULT_STATE: { enabled: false, channels: { runtime: false, scheduler: false, invariants: false, elements: true, selection: false, resize: false, edit: false, overlay: false, zoom: false, scroll: false, move: false } },
  PRESETS: { quiet: { runtime: false, scheduler: false, invariants: false, elements: false, selection: false, resize: false, edit: false, overlay: false, zoom: false, scroll: false, move: false }, elements: { runtime: false, scheduler: false, invariants: false, elements: true, selection: true, resize: true, edit: true, overlay: false, zoom: false, scroll: false, move: false }, runtime: { runtime: true, scheduler: true, invariants: true, elements: false, selection: false, resize: false, edit: false, overlay: false, zoom: false, scroll: false, move: false }, geometry: { runtime: false, scheduler: false, invariants: false, elements: false, selection: false, resize: false, edit: false, overlay: true, zoom: true, scroll: true, move: false }, all: { runtime: true, scheduler: true, invariants: true, elements: true, selection: true, resize: true, edit: true, overlay: true, zoom: true, scroll: true, move: true } },
  _clone(v) { return JSON.parse(JSON.stringify(v)); },
  _ensureState() { if (window.RF_DEBUG && window.RF_DEBUG.channels) return window.RF_DEBUG; let nextState = this._clone(this.DEFAULT_STATE); try { const raw = localStorage.getItem(this.STORAGE_KEY); if (raw) { const parsed = JSON.parse(raw); nextState = { enabled: !!parsed.enabled, channels: { ...this.DEFAULT_STATE.channels, ...(parsed.channels || {}) } }; } } catch (_) {} window.RF_DEBUG = nextState; this._syncGlobals(); return window.RF_DEBUG; },
  _persist() { try { localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.getState())); } catch (_) {} },
  _syncGlobals() { const state = this._ensureState(); window.RF_DEBUG_TRACE = state.enabled; window.RF_DEBUG_TRACE_RUNTIME = !!state.channels.runtime; window.RF_DEBUG_TRACE_ELEMENTS = !!state.channels.elements; },
  getState() { return this._clone(this._ensureState()); },
  isEnabled(channel) { const state = this._ensureState(); return state.enabled === true && !!state.channels[channel]; },
  isAnyEnabled(channels) { return (channels || []).some(channel => this.isEnabled(channel)); },
  setEnabled(value) { const state = this._ensureState(); state.enabled = !!value; if (state.enabled && !Object.values(state.channels || {}).some(Boolean)) { state.channels = { ...this.PRESETS.elements }; } this._syncGlobals(); this._persist(); },
  setChannel(channel, value) { const state = this._ensureState(); state.channels[channel] = !!value; this._syncGlobals(); this._persist(); },
  toggleChannel(channel) { this.setChannel(channel, !this.isEnabled(channel)); },
  applyPreset(name) { if (!this.PRESETS[name]) return; const state = this._ensureState(); state.channels = { ...this.PRESETS[name] }; state.enabled = true; this._syncGlobals(); this._persist(); },
  shouldAllowConsoleCall(args) { const first = args && args.length ? args[0] : ''; if (typeof first !== 'string') return this._ensureState().enabled === true; const match = first.match(/^\[RFTRACE:([a-z]+)\]/i); if (match) return this.isEnabled(match[1].toLowerCase()); if (first.startsWith('[RFTRACE]')) return this.isEnabled('runtime'); return this._ensureState().enabled === true; },
  log(channel, source, event, payload) { if (!this.isEnabled(channel)) return; console.log(`[RFTRACE:${channel}]`, event, { source, payload: payload || null }); },
};

window.DebugTrace = DebugTrace;
window.RF_DEBUG = window.RF_DEBUG || DebugTrace.getState();
window.rfTrace = function(channel, event, payload) { if (!window.RF_DEBUG?.enabled) return; if (!window.RF_DEBUG.channels?.[channel]) return; console.log(`[RFTRACE:${channel}]`, event, payload); };
