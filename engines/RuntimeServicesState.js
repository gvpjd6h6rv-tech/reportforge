'use strict';

(function initRuntimeServicesState(global) {
  global.RF = global.RF || {};
  const root = global.RF;
  if (root.RuntimeServicesState) return;

  const state = {
    flags: Object.create(null),
    owners: Object.create(null),
    domRefs: Object.create(null),
    exports: Object.create(null),
    meta: Object.create(null),
    debugFlags: Object.create(null),
    contractGuards: null,
  };

  // Writer conflict log — append-only, survives clearSafeMode, capped at 50 entries.
  const _writerConflicts = [];

  const S = {
    expose(name, value) { state.exports[name] = value; global[name] = value; return value; },
    getExport(name) { return Object.prototype.hasOwnProperty.call(state.exports, name) ? state.exports[name] : (typeof global[name] === 'undefined' ? null : global[name]); },
    setFlag(name, value) { state.flags[name] = value; return value; },
    getFlag(name, fallback = null) { return Object.prototype.hasOwnProperty.call(state.flags, name) ? state.flags[name] : fallback; },
    setOwner(kind, value) {
      const prev = Object.prototype.hasOwnProperty.call(state.owners, kind) ? state.owners[kind] : null;
      if (prev !== null && prev !== value) {
        // Multi-writer conflict: a different caller is trying to claim an already-owned slot.
        const conflict = { kind, prev, next: value, at: new Date().toISOString() };
        if (_writerConflicts.length < 50) _writerConflicts.push(conflict);
        console.error('[RuntimeServicesState] Writer conflict detected', conflict);
        // Escalate to EngineCoreRuntime safe mode if available.
        try {
          const rt = global.RF?.EngineCore?.runtime;
          if (rt && typeof rt.enterSafeMode === 'function') {
            rt.enterSafeMode(
              'writer_conflict',
              new Error(`Writer conflict: ${kind} owned by ${prev}, contested by ${value}`),
              conflict,
            );
          }
        } catch (_) { /* runtime not yet initialised */ }
        // Emit as custom event so tests / debug overlays can observe.
        try {
          global.dispatchEvent(new CustomEvent('rf:writer-conflict', { detail: conflict }));
        } catch (_) {}
      }
      state.owners[kind] = value;
      return value;
    },
    getOwner(kind) { return Object.prototype.hasOwnProperty.call(state.owners, kind) ? state.owners[kind] : null; },
    getWriterConflicts() { return _writerConflicts.slice(); },
    setDomRef(name, value) { state.domRefs[name] = value || null; return value || null; },
    getDomRef(name) { return Object.prototype.hasOwnProperty.call(state.domRefs, name) ? state.domRefs[name] : null; },
    setMeta(name, value) { state.meta[name] = value; return value; },
    getMeta(name) { return Object.prototype.hasOwnProperty.call(state.meta, name) ? state.meta[name] : null; },
    setDebugFlags(value) { state.debugFlags = value && typeof value === 'object' ? { ...value } : Object.create(null); return state.debugFlags; },
    getDebugFlags() { return { ...state.debugFlags }; },
    setContractGuards(value) { state.contractGuards = value || null; return state.contractGuards; },
    getContractGuards() { return state.contractGuards; },
  };

  root.RuntimeServicesState = S;
})(window);
