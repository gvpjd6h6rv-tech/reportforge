'use strict';

(function initCommandRuntimeFileSerialization(global) {
  function _liveMargins(currentLayout, ds) {
    const margins = currentLayout.margins && typeof currentLayout.margins === 'object' ? { ...currentLayout.margins } : {};
    if (Number.isFinite(ds.pageMarginLeft)) margins.left = ds.pageMarginLeft;
    if (Number.isFinite(ds.pageMarginTop)) margins.top = ds.pageMarginTop;
    return Object.keys(margins).length ? margins : null;
  }

  function _liveLayoutMeta(currentLayout, ds, cfg) {
    const model = global.PageFormatModel;
    if (String(currentLayout.pageSize || 'A4').toUpperCase() === 'TICKET'
      && (!model || typeof model.resolvePersistedTicketWidthMm !== 'function')) {
      throw new Error('Falta el SSOT de formato: PageFormatModel.resolvePersistedTicketWidthMm no está disponible');
    }
    return {
      name: currentLayout.name || 'Reporte',
      version: currentLayout.version || '1.0',
      pageWidth: Number.isFinite(cfg.PAGE_W) ? cfg.PAGE_W : currentLayout.pageWidth,
      pageHeight: Number.isFinite(cfg.PAGE_H) ? cfg.PAGE_H : currentLayout.pageHeight,
      pageSize: currentLayout.pageSize || 'A4',
      ticketWidthMm: model && typeof model.resolvePersistedTicketWidthMm === 'function'
        ? model.resolvePersistedTicketWidthMm(currentLayout)
        : null,
      docType: ds._docType || currentLayout.docType || null,
      margins: _liveMargins(currentLayout, ds),
    };
  }

  function serializeLayout(context) {
    const currentLayout = context.currentLayout || {};
    const ds = context.ds || {};
    const sqlCommandStore = context.sqlCommandStore || {};
    const parameters = ds.layout && Array.isArray(ds.layout.parameters) ? ds.layout.parameters : [];
    const sqlCommands = typeof sqlCommandStore.list === 'function' ? sqlCommandStore.list() : [];
    return JSON.stringify({
      ..._liveLayoutMeta(currentLayout, ds, context.cfg || {}),
      sections: Array.isArray(ds.sections) ? ds.sections.map((section) => ({ ...section })) : [],
      elements: Array.isArray(ds.elements) ? ds.elements.map((element) => ({ ...element })) : [],
      parameters,
      parameterValues: { ...(ds.parameterValues || {}) },
      sqlCommands,
      savedAt: new Date().toISOString(),
    }, null, 2);
  }

  function attach(runtime, getContext) {
    runtime.toJSON = function toJSON() {
      return serializeLayout(getContext());
    };
  }

  global.CommandRuntimeFileSerialization = {
    _liveMargins,
    _liveLayoutMeta,
    serializeLayout,
    attach,
  };
})(window);
