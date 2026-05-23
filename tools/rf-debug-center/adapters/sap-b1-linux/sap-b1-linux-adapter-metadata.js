'use strict';
// SAP1 — sap_b1_linux Adapter Metadata
// Static metadata only. No runtime calls. No globals. No imports.

export const SAP_B1_LINUX_METADATA = Object.freeze({
  id: 'sap-b1-linux',
  name: 'SAP B1 Linux',
  project: 'sap_b1_linux',
  version: '1.0.0',
  adapterSchema: '1.0.0',
  description: 'SAP B1 Linux adapter v1 — read-only sidecar for RF Debug Center',
  traceSource: 'window.__CAUSAL_LOG__',
  activationFlags: Object.freeze({
    queryParam: 'sapDebugCenter',
    localStorage: 'SAP_DEBUG_CENTER',
    windowFlag: '__SAP_DEBUG_CENTER__',
  }),
  capabilities: Object.freeze(['timeline', 'state', 'dom', 'network', 'ownership', 'bundle']),
  invariants: Object.freeze([
    'does not mutate DocumentModel',
    'does not mutate __CAUSAL_LOG__',
    'does not mutate DOM',
    'does not call safeFetch',
    'no globals created',
  ]),
});

export const SAP_B1_LINUX_UDF_FIELDS = Object.freeze([
  'U_TRANSPORTE',
  'U_TRANSPORTISTA',
  'U_GUIA_TRANSPORTE_PLACA',
  'U_TRANSPORTE_DESC',
  'U_GUIA_TRANSPORTISTA_NOMBRE',
  'U_GUIA_TRANSPORTISTA_RUC',
]);

export const SAP_B1_LINUX_DOM_SELECTORS = Object.freeze({
  feContainer: '#fe-fields-container',
  uTransporte: '[data-udf="U_TRANSPORTE"]',
  uTransportista: '[data-udf="U_TRANSPORTISTA"]',
  uPlaca: '[data-udf="U_GUIA_TRANSPORTE_PLACA"]',
  uTransportistaName: '[data-udf="U_GUIA_TRANSPORTISTA_NOMBRE"]',
  uTransportistaRuc: '[data-udf="U_GUIA_TRANSPORTISTA_RUC"]',
  docNum: '[data-bind="DocNum"]',
  btnCreate: '#btnCreate',
  btnFind: '#btnFind',
  mainTable: '#mainTable',
});

export const SAP_B1_LINUX_NETWORK_PATHS = Object.freeze([
  '/api/document/',
  '/api/vcr_nav',
  '/advanced_search',
  '/create_order',
  '/api/udf/schema/',
  '/api/udf/catalog/',
  '/api/udf/valid-values/',
]);

export const SAP_B1_LINUX_OWNERSHIP_MAP = Object.freeze({
  project: 'sap_b1_linux',
  subsystems: Object.freeze([
    Object.freeze({ name: 'DocumentModel', owner: 'static/js/state/documentModel.js', authorizedWriters: ['documentModel.js'], publicAPI: ['setDocumentModel()', 'patchDocumentModel()', 'getDocumentModel()'], invariants: ['SSOT', 'emits document-model:changed on every write'] }),
    Object.freeze({ name: 'GuideContract', owner: 'static/js/state/guideContract.js', authorizedWriters: [], publicAPI: ['resolveGuideUiContextFromDocumentModel()', 'getGuideContextFieldSets()'], invariants: ['read-only — never writes state'] }),
    Object.freeze({ name: 'UdfFe', owner: 'static/js/features/udf_fe.js', authorizedWriters: ['udf_fe.js', 'udf_fe_write_pipeline.js'], publicAPI: ['mount()', 'boot()', 'validateBeforeCreate()', 'validateBeforeGuide()'], invariants: ['sole owner of #fe-fields-container visibility'] }),
    Object.freeze({ name: 'BindingsDom', owner: 'static/js/ui/bindings_dom.js', authorizedWriters: ['bindings_dom.js'], publicAPI: ['bindUI(model)', 'patchUI(fields)'], invariants: ['sole owner of [data-bind] renders'] }),
    Object.freeze({ name: 'Network', owner: 'static/js/core/http.js', authorizedWriters: [], publicAPI: ['Facade.safeFetch(url, opts)'], invariants: ['all network calls through Facade.safeFetch'] }),
    Object.freeze({ name: 'DocumentSnapshotCore', owner: 'services/shared/document_snapshot_core.py', authorizedWriters: [], publicAPI: ['get_document_snapshot(DocEntry)'], invariants: ['enriches transport/transporter before responding'] }),
  ]),
});
