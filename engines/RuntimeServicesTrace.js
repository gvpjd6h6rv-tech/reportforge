'use strict';

(function initRuntimeServicesTrace(global) {
  global.RF = global.RF || {};
  const root = global.RF;
  if (root.RuntimeServicesTrace) return;

  const S = root.RuntimeServicesState || null;
  const T = {
    isEngineCoreInteractionEnabled() { return (S?.getFlag('engineCoreInteraction', true) !== false); },
    trace(channel, event, payload) {
      if (typeof global.rfTrace !== 'function') return;
      if (!global.DebugTrace?.isEnabled(channel)) return;
      global.rfTrace(channel, event, payload);
    },
  };

  root.RuntimeServicesTrace = T;
})(window);
