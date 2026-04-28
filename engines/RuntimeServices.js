'use strict';

(function initRuntimeServices(global) {
  global.RF = global.RF || {};
  const root = global.RF;

  if (root.RuntimeServices) return;

  const state = {
    flags: Object.create(null),
    owners: Object.create(null),
    domRefs: Object.create(null),
    exports: Object.create(null),
    meta: Object.create(null),
    debugFlags: Object.create(null),
    contractGuards: null,
  };

  // Writer conflict log — append-only, capped at 50 entries.
  const _writerConflicts = [];

  function expose(name, value) {
    state.exports[name] = value;
    global[name] = value;
    return value;
  }

  function getExport(name) {
    if (Object.prototype.hasOwnProperty.call(state.exports, name)) return state.exports[name];
    return typeof global[name] === 'undefined' ? null : global[name];
  }

  function setFlag(name, value) {
    state.flags[name] = value;
    return value;
  }

  function getFlag(name, fallback = null) {
    return Object.prototype.hasOwnProperty.call(state.flags, name) ? state.flags[name] : fallback;
  }

  function setOwner(kind, value) {
    const prev = Object.prototype.hasOwnProperty.call(state.owners, kind) ? state.owners[kind] : null;
    if (prev !== null && prev !== value) {
      const conflict = { kind, prev, next: value, at: new Date().toISOString() };
      if (_writerConflicts.length < 50) _writerConflicts.push(conflict);
      console.error('[RuntimeServices] Writer conflict detected', conflict);
      try {
        const rt = global.RF?.EngineCore?.runtime;
        if (rt && typeof rt.enterSafeMode === 'function') {
          rt.enterSafeMode(
            'writer_conflict',
            new Error(`Writer conflict: ${kind} owned by ${prev}, contested by ${value}`),
            conflict,
          );
        }
      } catch (_) {}
      try {
        global.dispatchEvent(new CustomEvent('rf:writer-conflict', { detail: conflict }));
      } catch (_) {}
    }
    state.owners[kind] = value;
    return value;
  }

  function getOwner(kind) {
    return Object.prototype.hasOwnProperty.call(state.owners, kind) ? state.owners[kind] : null;
  }

  function getWriterConflicts() {
    return _writerConflicts.slice();
  }

  function setDomRef(name, value) {
    state.domRefs[name] = value || null;
    return value || null;
  }

  function getDomRef(name) {
    return Object.prototype.hasOwnProperty.call(state.domRefs, name) ? state.domRefs[name] : null;
  }

  function setMeta(name, value) {
    state.meta[name] = value;
    return value;
  }

  function getMeta(name) {
    return Object.prototype.hasOwnProperty.call(state.meta, name) ? state.meta[name] : null;
  }

  function setDebugFlags(value) {
    state.debugFlags = value && typeof value === 'object' ? { ...value } : Object.create(null);
    return state.debugFlags;
  }

  function getDebugFlags() {
    return { ...state.debugFlags };
  }

  function setContractGuards(value) {
    state.contractGuards = value || null;
    return state.contractGuards;
  }

  function getContractGuards() {
    return state.contractGuards;
  }

  function isEngineCoreInteractionEnabled() {
    return getFlag('engineCoreInteraction', true) !== false;
  }

  function trace(channel, event, payload) {
    if (typeof global.rfTrace !== 'function') return;
    if (!global.DebugTrace?.isEnabled(channel)) return;
    global.rfTrace(channel, event, payload);
  }

  root.RuntimeServices = {
    expose,
    getExport,
    setFlag,
    getFlag,
    setOwner,
    getOwner,
    getWriterConflicts,
    setDomRef,
    getDomRef,
    setMeta,
    getMeta,
    setDebugFlags,
    getDebugFlags,
    setContractGuards,
    getContractGuards,
    isEngineCoreInteractionEnabled,
    trace,
  };
})(window);
