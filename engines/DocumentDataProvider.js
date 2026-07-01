'use strict';
/**
 * DocumentDataProvider
 *
 * Responsabilidad única: fetch GET /document/{type}/{number},
 * validar el contract envelope, asignar DS._sampleData, y
 * disparar refresh de Preview si DS.previewMode === true.
 *
 * No contiene SQL. No toca PreviewEngine. No exporta UI.
 * No llama a bindUI ni a patchUI.
 *
 * API pública:
 *   DocumentDataProvider.load(docType, docNumber [, opts])
 *     → Promise<{ ok: true, dataset } | { ok: false, error: { code, message, details } }>
 *
 * opts:
 *   datasource  string  alias registrado en el server (default: 'default')
 *   timeout     number  segundos de timeout al server   (default: 10)
 */
(function initDocumentDataProvider(global) {

  const CONTRACT = 'rf.document.dataset.v1';
  const SCHEMA_MAJOR = 1;

  // ── Error normalizer ──────────────────────────────────────────────────────
  // Preserva code y details del envelope de error del server.
  function _normalizeError(body) {
    const err = (body && body.error) || {};
    return {
      code:    err.code    || 'UNKNOWN_ERROR',
      message: err.message || 'Error desconocido',
      details: err.details || '',
    };
  }

  // ── Contract validator ────────────────────────────────────────────────────
  // Solo valida el envelope. No toca DS. No hace I/O.
  function _validateEnvelope(body) {
    if (body.contract !== CONTRACT) {
      return {
        ok: false,
        error: {
          code:    'CONTRACT_MISMATCH',
          message: 'Contract desconocido: ' + body.contract,
          details: 'Esperado: ' + CONTRACT,
        },
      };
    }
    const parts = (body.schemaVersion || '0.0.0').split('.');
    const major = parseInt(parts[0], 10);
    if (major !== SCHEMA_MAJOR) {
      return {
        ok: false,
        error: {
          code:    'SCHEMA_VERSION_INCOMPATIBLE',
          message: 'schemaVersion major ' + major + ' incompatible (esperado ' + SCHEMA_MAJOR + ')',
          details: 'Recibido: ' + (body.schemaVersion || '(sin versión)'),
        },
      };
    }
    if (!body.validation || body.validation.schemaOk !== true) {
      const missing = (body.validation && body.validation.missingPaths) || [];
      return {
        ok: false,
        error: {
          code:    'SCHEMA_NOT_OK',
          message: 'Validación del dataset fallida en el servidor',
          details: 'Paths faltantes: ' + (missing.length ? missing.join(', ') : '(ninguno reportado)'),
        },
      };
    }
    return { ok: true };
  }

  // ── load ──────────────────────────────────────────────────────────────────
  async function load(docType, docNumber, opts) {
    const datasource = (opts && opts.datasource) || 'default';
    const timeout    = (opts && opts.timeout)    || 10;

    const url = '/document/' + encodeURIComponent(docType)
      + '/' + encodeURIComponent(docNumber)
      + '?datasource=' + encodeURIComponent(datasource)
      + '&timeout=' + timeout;

    let body;
    try {
      const resp = await global.fetch(url);
      body = await resp.json();
    } catch (err) {
      return {
        ok: false,
        error: {
          code:    'FETCH_ERROR',
          message: 'Error de red al obtener el documento',
          details: (err && err.message) ? err.message : String(err),
        },
      };
    }

    // Server returned an error envelope (4xx / 5xx)
    if (body && body.error) {
      return { ok: false, error: _normalizeError(body) };
    }

    // Validate contract fields
    const check = _validateEnvelope(body);
    if (!check.ok) return check;

    // Assign dataset and optionally refresh Preview
    const DS = global.DS;
    if (DS) {
      DS._sampleData = body.dataset;

      // SSOT: real field tree from server replaces hardcoded FIELD_TREE for database category.
      // Merge so special/formula/group categories from window.FIELD_TREE are preserved.
      if (body.fieldTree) {
        DS.fieldTree = Object.assign(
          {},
          (typeof FIELD_TREE !== 'undefined' ? FIELD_TREE : {}),
          body.fieldTree,
        );
      } else {
        DS.fieldTree = null;
      }

      DS.datasetPaths = body.datasetPaths || [];

      // Layout-dependent cross-check (computed client-side from current elements)
      const elements = DS.elements || [];
      DS.layoutFieldPaths = elements
        .filter(function(e){ return e.type === 'field' && e.fieldPath; })
        .map(function(e){ return e.fieldPath; });
      DS.missingLayoutPaths = DS.layoutFieldPaths
        .filter(function(p){ return !DS.datasetPaths.includes(p); });
      DS.unusedDatasetPaths = DS.datasetPaths
        .filter(function(p){ return !DS.layoutFieldPaths.includes(p); });

      // Push real tree to FieldExplorer
      if (DS.fieldTree && typeof FieldExplorerEngine !== 'undefined') {
        FieldExplorerEngine._activeTree = DS.fieldTree;
        FieldExplorerEngine.render();
      }

      // Diagnostic warning (never breaks Preview)
      if (DS.missingLayoutPaths && DS.missingLayoutPaths.length > 0) {
        console.warn(
          'RF DATA CONTRACT WARNING\nmissingLayoutPaths:\n' +
          DS.missingLayoutPaths.map(function(p){ return '- ' + p; }).join('\n')
        );
      }

      if (DS.previewMode) {
        const renderer = global.PreviewEngineRenderer;
        if (renderer && typeof renderer.refresh === 'function') {
          renderer.refresh();
        }
      }
    }

    return { ok: true, dataset: body.dataset };
  }

  // ── Export ────────────────────────────────────────────────────────────────
  const DocumentDataProvider = { load };
  global.DocumentDataProvider = DocumentDataProvider;
  if (typeof module !== 'undefined') module.exports = DocumentDataProvider;

})(typeof window !== 'undefined' ? window : globalThis);
