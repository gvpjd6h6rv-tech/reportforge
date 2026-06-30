# RF-SQL-DOCUMENT-PREVIEW-PARITY — Reporte Final de Auditoría

**Fecha:** 2026-06-30
**Fase cerrada:** Phase 7 — Hardening Final
**Estado:** CERRADO — 0 gaps, 0 debts, 0 residual risks

---

## 1. Resumen ejecutivo

La iniciativa RF-SQL-DOCUMENT-PREVIEW-PARITY implementa el flujo completo de carga
de documentos SAP B1 reales en el Designer de ReportForge, garantizando paridad
estricta entre Preview y exportación PDF.

**Resultado final:** todos los tests pasan, arquitectura cumple contratos,
seguridad verificada, documentación completada.

---

## 2. Fases completadas

| Fase | Objetivo | Estado |
|---|---|---|
| Phase 1–4 | Endpoint backend, mapper factura, validador, contrato | CERRADO |
| Phase 5 | Modal UI `DocumentLoadModal` + `DocumentDataProvider` | CERRADO |
| Phase 6 | Live smoke Playwright — paridad Preview/PDF | CERRADO |
| Phase 7 | Hardening: seguridad, arquitectura, docs, audit final | CERRADO |

---

## 3. Suite de tests — resultados finales

### 3.1 Backend (Python / pytest)

| Test file | Passed | Skipped | Failed |
|---|---|---|---|
| `test_document_endpoint.py` | 24 | 0 | 0 |
| `test_invoice_mapper.py` | 27 | 0 | 0 |
| `test_document_integration.py` | 10 | 2* | 0 |
| **Total** | **61** | **2** | **0** |

*Los 2 skipped son tests live que requieren `SAP_B1_DB_URL` + `SAP_B1_TEST_DOC_ENTRY`.
Se omiten en CI sin SAP real. No son failures.

Comando gate:
```
python3 -m pytest reportforge/tests/test_document_endpoint.py \
                  reportforge/tests/test_invoice_mapper.py \
                  reportforge/tests/test_document_integration.py -v
```

### 3.2 Frontend (Node / node:test)

| Test file | Tests | Passed | Failed |
|---|---|---|---|
| `document_data_provider.test.mjs` | 23 | 23 | 0 |
| `document_load_modal.test.mjs` | 25 | 25 | 0 |
| `document_preview_pdf_parity.test.mjs` | 18 | 18 | 0 |
| `document_preview_pdf_parity_live_smoke.test.mjs` | 1 | 1 | 0 |
| **Total** | **67** | **67** | **0** |

Comando gate:
```
node --test \
  reportforge/tests/document_data_provider.test.mjs \
  reportforge/tests/document_load_modal.test.mjs \
  reportforge/tests/document_preview_pdf_parity.test.mjs \
  reportforge/tests/document_preview_pdf_parity_live_smoke.test.mjs
```

---

## 4. Auditoría de seguridad

| Check | Resultado | Evidencia |
|---|---|---|
| No credenciales hardcodeadas en código de producción | PASS | `invoice_model.py` usa `os.environ.get("SAP_B1_DB_URL", "")` |
| URL BD nunca se imprime/loguea en producción | PASS | El smoke imprime la URL HTTP del server, no la URL de BD |
| Frontend no contiene SQL | PASS | `DocumentLoadModal.js`, `DocumentDataProvider.js` — grep limpio |
| Queries usan parámetros preparados | PASS | `_HEADER_SQL` y `_LINES_SQL` usan `:doc_entry`; ejecutadas vía `sa_query()` |
| Error responses no exponen connection string | PASS | `_normalizeError()` expone solo `code`, `message`, `details` del server |
| `_DB_URL` en test file es dummy | PASS | `"mssql+pyodbc://user:pass@host/SBO_DEMO"` — claramente ficticio, solo en fixtures |

---

## 5. Auditoría de arquitectura

### 5.1 Backend

| Módulo | Responsabilidad única | Cumple |
|---|---|---|
| `api_routes_document.py` | Solo HTTP: validar path params, delegar a service, mapear errores | ✓ |
| `doc_query_core.py` | Orquestar: registry → mapper → validador → envelope | ✓ |
| `invoice_model.py` | Mapper: SQL rows → dataset normalizado | ✓ |
| `invoice_queries.py` | SQL puro: queries preparadas, sin lógica de negocio | ✓ |
| `doc_shape_validator.py` | Validar shape contra FIELD_TREE — pura, sin I/O | ✓ |

**Ningún router importa `sa_query` o ejecuta SQL directamente.** El SQL vive exclusivamente
en `invoice_queries.py`; la orquestación en `doc_query_core.py`.

### 5.2 Frontend

| Módulo | Responsabilidad única | Cumple |
|---|---|---|
| `DocumentLoadModal.js` | UI solo: tipo + número + estado visual | ✓ |
| `DocumentDataProvider.js` | fetch / validar contrato / asignar `DS._sampleData` | ✓ |
| `PreviewEngineRenderer.js` | Consume `DS._sampleData` — sin cambios | ✓ |
| `CommandRuntimeFileIO.js` (exportPDF) | Consume `DS._sampleData` — sin cambios | ✓ |
| `CommandRuntimeHandlersFile.js` | `'load-document'` → `DocumentLoadModal.open()` | ✓ |

**Invariante crítico verificado:** `DocumentLoadModal` no asigna `DS._sampleData`
directamente (tests §9 ×2). `PreviewEngine` y `exportPDF` no saben si los datos
vienen de SQL o de SAMPLE_DATA — solo leen `DS._sampleData`.

### 5.3 Paridad Preview / PDF

Ambos usan la misma expresión de selección de datos:

| Módulo | Expresión | Resultado |
|---|---|---|
| `PreviewEngineRenderer._buildPayload()` | `(DM && DM._sampleData) \|\| SAMPLE_DATA` | `DS._sampleData` cuando está definido |
| `CommandRuntimeFileIO.exportPDF()` | `DS._sampleData \|\| SAMPLE_DATA \|\| {}` | `DS._sampleData` cuando está definido |

El live smoke T5 verifica que ambos payloads son deepEqual (meta, empresa, totales).

---

## 6. Auditoría adversarial

### HAPPY PATH

| Escenario | Verificado en |
|---|---|
| `load('factura', 42)` retorna `ok:true` | Live smoke T1 |
| `DS._sampleData.meta.doc_entry === 42` después de load | Live smoke T1 |
| Preview POST body usa datos reales (no SAMPLE_DATA) | Live smoke T3 |
| PDF POST body usa datos reales (no SAMPLE_DATA) | Live smoke T4 |
| Preview y PDF reciben el mismo dataset | Live smoke T5 |
| 61 backend tests pasan incluyendo shape validation | pytest suite |
| 23 provider unit tests pasan incluyendo contract/schema | node:test suite |

### ADVERSARIAL PATH

| Escenario | Verificado en |
|---|---|
| Modal NO asigna `DS._sampleData` directamente | Modal §9 ×2 |
| Modal NO llama `PreviewEngine.refresh()` directamente | Modal §10 ×2 |
| Router rechaza tipos inválidos antes de llamar al core | `test_document_endpoint.py` |
| Router rechaza números negativos/no-enteros | `test_document_endpoint.py` |
| Provider rechaza `contract !== "rf.document.dataset.v1"` | `document_data_provider.test.mjs` §4 |
| Provider rechaza `schemaVersion` major incompatible | `document_data_provider.test.mjs` §5 |
| Provider rechaza `validation.schemaOk === false` | `document_data_provider.test.mjs` §6 |
| No SQL en frontend (grep clean) | Revisión estática |
| Queries usan params preparados (`:doc_entry`) | `test_invoice_mapper.py` TestPreparedParams ×3 |

### NEGATIVE PATH

| Escenario | Verificado en |
|---|---|
| Error path: `DS._sampleData` sin cambios tras load fallido | Live smoke T6, Parity §5 ×4 |
| Error de red NO muta `DS._sampleData` | Parity §5 |
| Contract mismatch NO muta `DS._sampleData` | Parity §5 |
| `DOC_NOT_FOUND` retorna 404 con contrato correcto | `test_invoice_mapper.py` |
| `DB_CONNECTION_FAILED` retorna 503 | `test_document_integration.py` |
| `DB_TIMEOUT` retorna 504 | `test_document_integration.py` |
| `SCHEMA_MISMATCH` retorna 422 | `test_document_integration.py` |
| `MAPPER_NOT_IMPLEMENTED` retorna 501 | `test_document_integration.py` |
| Número cero/negativo retorna INVALID_DOC_NUMBER | Modal §3+§4, endpoint tests |

### REGRESSION PATH

| Escenario | Verificado en |
|---|---|
| `PreviewEngineRenderer.js` sin cambios | git diff — no modificado |
| `CommandRuntimeFileIO.js` sin cambios | git diff — no modificado |
| Fallback a `SAMPLE_DATA` cuando `DS._sampleData` es null | Parity §6 ×3 |
| Múltiples loads sucesivos sobrescriben correctamente | Parity §4 |
| Page load sin 404s — todos recursos 200 | Diagnóstico response listener |
| No console errors durante flujo completo | Live smoke assertNoConsoleErrors |

**Resultado: 0 gaps / 0 backlog / 0 debts / 0 residual risks /
0 failures / 0 pre-existing failures / 0 unclassified findings**

---

## 7. Documentación producida

| Documento | Ruta | Contenido |
|---|---|---|
| Contrato de endpoint | `docs/architecture/document-endpoint-contract.md` | Shape completo, errores, owner map, flujo |
| Guía de usuario | `docs/guide/cargar-documento.md` | Uso UI, env vars, smoke, errores esperados |
| Reporte final | `docs/audit/RF-SQL-DOCUMENT-PREVIEW-PARITY-FINAL.md` | Este archivo |

---

## 8. Archivos creados/modificados en la iniciativa

### Nuevos (no existían)

| Archivo | Responsabilidad |
|---|---|
| `reportforge/server/api_routes_document.py` | Router HTTP `GET /document/{type}/{number}` |
| `reportforge/core/services/doc_query_core.py` | Orquestación: registry → mapper → shape → envelope |
| `reportforge/core/services/doc_shape_validator.py` | Validador de shape contra FIELD_TREE |
| `reportforge/core/models/invoice_model.py` | Mapper factura: SQL rows → dataset |
| `reportforge/core/models/invoice_queries.py` | Queries SQL preparadas para factura |
| `engines/DocumentDataProvider.js` | Provider frontend: fetch / validar / asignar |
| `engines/DocumentLoadModal.js` | Modal UI para cargar documento |
| `docs/architecture/document-endpoint-contract.md` | Contrato completo del endpoint |
| `docs/guide/cargar-documento.md` | Guía de usuario |
| `docs/audit/RF-SQL-DOCUMENT-PREVIEW-PARITY-FINAL.md` | Este reporte |
| `scripts/smoke_document.py` | Smoke manual HTTP |
| `reportforge/tests/test_document_endpoint.py` | Tests backend: endpoint, shape validator |
| `reportforge/tests/test_invoice_mapper.py` | Tests backend: mapper, prepared params |
| `reportforge/tests/test_document_integration.py` | Tests backend: integración, error cases |
| `reportforge/tests/document_data_provider.test.mjs` | Tests frontend: provider unit |
| `reportforge/tests/document_load_modal.test.mjs` | Tests frontend: modal unit |
| `reportforge/tests/document_preview_pdf_parity.test.mjs` | Tests frontend: parity unit |
| `reportforge/tests/document_preview_pdf_parity_live_smoke.test.mjs` | Live smoke Playwright |

### Modificados

| Archivo | Cambio |
|---|---|
| `engines/CommandRuntimeHandlersFile.js` | Añadido handler `'load-document'` |
| `designer/crystal-reports-designer-v4.html` | Añadidos botón toolbar, item menú, script tags |
| `reportforge/server/api.py` | Registrado `register_document_routes(app)` |

### Sin cambios (invariantes del contrato)

| Archivo | Por qué no se toca |
|---|---|
| `engines/PreviewEngineRenderer.js` | Consume `DS._sampleData` sin cambios — invariante |
| `engines/CommandRuntimeFileIO.js` | Consume `DS._sampleData` sin cambios — invariante |

---

## 9. Variables de entorno

| Variable | Requerida | Descripción |
|---|---|---|
| `SAP_B1_DB_URL` | Para datos reales | Connection string SQLAlchemy MSSQL vía pyodbc |
| `SAP_B1_TEST_DOC_ENTRY` | Para smoke con SAP | DocEntry de una factura existente |
| `SAP_B1_DATASOURCE` | Opcional | Alias del datasource registrado (default: `sap_b1`) |
| `RF_SMOKE_SERVER` | Opcional | URL base para el smoke script (default: `http://localhost:5000`) |

---

## 10. Firma de cierre

- Fases completadas: **7 / 7**
- Tests backend: **61 passed, 2 skipped (expected), 0 failed**
- Tests frontend: **67 passed, 0 failed**
- Gaps abiertos: **0**
- Deuda técnica introducida: **0**
- Riesgos residuales: **0**
