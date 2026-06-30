# RF-SQL-DOCUMENT-PREVIEW-PARITY-1 — AUDIT ONLY

> Estado: AUDITORÍA. No implementación. No fix. No commit.
> Objetivo del feature (no ejecutado aquí): conectar a SQL → ingresar número de
> documento → traer datos reales → renderizar Preview tal como saldría el PDF,
> sin editar JSON a mano.

---

## 0. Resumen ejecutivo (gap principal)

El backend **ya tiene** una capa de datasource SQL real (SQLAlchemy + prepared
params + cache + introspección) y un **contrato de mapper SAP→dataset
normalizado** (`build_invoice_model(doc_entry)`), pero:

1. El mapper SAP es un **stub** (`raise NotImplementedError`).
2. **No existe endpoint HTTP** "documento por número" que invoque ese mapper.
3. El **designer (Preview + Export PDF) está cableado a datos hardcodeados**
   (`DS._sampleData` ← `SAMPLE_DATA` / `DOC_TYPES[x].sampleData`). No hay puente
   designer→backend para datos reales.
4. **No hay UI** de conexión ni de ingreso de número de documento.

Lo bueno: **Preview y Export PDF ya consumen exactamente la misma fuente de
datos** (`DS._sampleData`), así que la regla "mismo dataset normalizado" se
cumple estructuralmente hoy — sólo que esa fuente es mock, no SQL.

---

## 1. Crystal Reports — modelo de paridad

| Aspecto CR | Cómo lo hace CR |
|---|---|
| Conexión SQL | Database Expert → connection (ODBC/OLEDB/nativo). Credenciales en el connection info, separadas del report. |
| Parámetros | Parameter Fields (`?param`); en preview pide valores; pueden ir a Record Selection o a SQL command. |
| Dataset | Resuelve el SQL command / tablas → un rowset; subreports = datasets separados. |
| Field binding | Cada objeto del canvas referencia un Database Field por nombre/path; el binding es por path lógico, no por valor. |
| Preview vs PDF | **Mismo dataset**. Preview es el render-engine a pantalla; Export PDF reusa el mismo rowset ya resuelto. Sin doble fetch ni doble shape. |

**Invariante CR a replicar:** el SQL/connection vive en la capa de datos; el
render-engine (preview) consume un dataset ya resuelto y normalizado, idéntico
al que alimenta el export.

---

## 2. Estado actual RF (evidencia en código)

### 2.1 FIELD_TREE
- `engines/RuntimeData.js:45` (`window.FIELD_TREE`) — árbol de paths lógicos
  (`empresa.*`, `cliente.*`, `fiscal.*`, `item.*`, `totales.*`, `_special.*`).
  Espejo en `designer/crystal-reports-designer-v3.html:1655`.
- Es **sólo catálogo de binding** (path + label + vtype). No describe ni ejecuta
  ninguna conexión. Define el **shape contractual** que el dataset real debe
  cumplir.

### 2.2 DS._sampleData (fuente de datos del designer)
- `window.SAMPLE_DATA` definido en `engines/RuntimeData.js:134` (hardcoded).
- Asignaciones a `DS._sampleData`:
  - `engines/CommandRuntimeInit.js:5` → `= SAMPLE_DATA`
  - `engines/CommandRuntimeDocType.js:30` → `= dt.sampleData || SAMPLE_DATA`
  - `engines/CommandRuntimeFile.js:39` → `= DOC_TYPES[docType].sampleData || SAMPLE_DATA`
  - `engines/DocTypeAndProbes.js:145` → `= null`
- **Conclusión:** la única vía de datos del preview/export es mock por doc-type.

### 2.3 Data binding en PreviewEngine
- `engines/PreviewEngineData.js:65` y `:108` →
  `data = rootData || DS._sampleData || SAMPLE_DATA`.
- `engines/PreviewEngineRenderer.js:18` (`_buildPayload`) →
  `sampleData = DM._sampleData || SAMPLE_DATA`.
- `_resolveField()` resuelve `path` contra ese objeto. **Correcto: el engine ya
  consume un dataset ya provisto; no hace fetch ni SQL.** (Cumple la regla
  "SQL NO vive dentro de PreviewEngine".)

### 2.4 Export PDF — data source
- `engines/CommandRuntimeFileIO.js:185-205` (`exportPDF`):
  `data = DS._sampleData || SAMPLE_DATA` → `POST /render {layout, data, format:'pdf'}`.
- **Misma fuente que el preview.** Paridad de dataset ya existe; falta que la
  fuente sea real.

### 2.5 Endpoints backend existentes
- `reportforge/server/api_routes_datasources.py`:
  - `GET /datasources`, `POST /datasources` (registrar alias+url+query+ttl),
    `DELETE /datasources/{alias}`
  - `POST /datasources/{alias}/query` (query + params → rows)
  - `GET /datasources/{alias}/tables`, `.../tables/{table}/schema`
- `reportforge/server/api_routes_render.py`: `POST /render`, `/render-jrxml`,
  `/preview` (reciben `data` o un `dataSource` spec vía `load_data`).
- Capa de datos:
  - `datasource/db_source*.py` — SQLAlchemy engine pool, `pool_pre_ping`,
    `connect_timeout=10`; `sa_query` usa `sa_text(query)` + dict params
    (**prepared, sin concatenación**). Cache TTL.
  - `datasource/live_source.py` — REST/file con timeout configurable.

### 2.6 Mock / sample / hardcoded
- `engines/RuntimeData.js:134` `SAMPLE_DATA`; valores por doc-type en
  `designer/...-v3.html:4217,4284,4351,4422`; `doc_entry:20482` hardcodeado.
- `reportforge/core/models/invoice_model.py` → **STUB**
  (`raise NotImplementedError`) pero con **contrato documentado** del shape
  (`meta/empresa/cliente/fiscal/pago/items/totales`).
- Builders análogos: `remision_model`, `nota_credito_model`, `retencion_model`,
  `liquidacion_model` (vía `DocType.call_builder(doc_entry)` en
  `doc_registry.py:40`). Sólo se invocan por **CLI/RenderEngine**
  (`cli.py:66`, `render_engine_runtime.py:99`), **nunca por HTTP ni por el
  designer**.

### 2.7 Flujo actual Preview → PDF
```
DOC_TYPES[x].sampleData (HARDCODED)
        │
        ▼
   DS._sampleData ──────────────┬───────────────────────────┐
        │                       │                           │
        ▼                       ▼                           ▼
PreviewEngineData._resolveField   exportPDF()           (mismo objeto)
        │                       │
        ▼                       ▼  POST /render {layout,data}
   Preview en pantalla      Backend EnterpriseEngine → PDF
```
Preview y PDF: misma data, mismo binding. **Falta el origen real (SQL+doc#).**

---

## 3. Matriz CR vs RF

| Capability | CR | RF actual | Gap | Owner propuesto |
|---|---|---|---|---|
| Definir conexión SQL | Database Expert / connection info | `db_source*` engine + `/datasources` (alias) | Sin UI; alias no ligado al designer | `datasource/db_source.py` (existe) + nuevo módulo UI conexión |
| Manejo de parámetros | Parameter Fields → SQL/Record Selection | `params` dict en query/render (prepared) | No hay "número de documento" como parámetro de 1ª clase en UI | `doc_query_core` (nuevo) + modal UI |
| Resolver dataset | rowset del SQL command | `DbSource.load` / `query_registered` | No produce el shape normalizado SAP (empresa/cliente/items/...) | `doc_mapper` (nuevo, sobre contrato de `invoice_model`) |
| Mapper doc# → dataset | implícito en el report | `build_invoice_model(doc_entry)` **STUB** | No implementado; sin SQL real | `core/models/invoice_model.py` (implementar) |
| Endpoint "doc por número" | n/a (cliente CR) | **No existe** | Falta `GET/POST /document/{type}/{num}` | `api_routes_document.py` (nuevo) |
| Field binding | por path lógico | `FIELD_TREE` + `_resolveField` | OK (ya por path) | `PreviewEngineData.js` (existe) |
| Preview usa dataset | render-engine | `DS._sampleData` | OK pero mock | `RF preview data provider` (nuevo) |
| PDF usa mismo dataset | sí | `exportPDF` usa `DS._sampleData` | OK pero mock | provider compartido (nuevo) |
| Errores conexión/timeout | dialogs | `DbSourceError`, 400/404/500 en rutas | Sin clasificación doc-not-found / schema-mismatch | `doc_query_core` (nuevo) |

---

## 4. Diseño modular mínimo propuesto (NO implementar aún)

Owners propuestos, respetando "SQL fuera de PreviewEngine" y "Preview/PDF mismo
dataset normalizado":

1. **Backend SQL connector** — *(ya existe)* `datasource/db_source*.py`.
   Reuso directo: engine pool, prepared params, timeout, cache.
2. **Doc mapper / dataset normalizado** — `core/models/*_model.py`
   (`build_invoice_model` y hermanos). Implementan el contrato shape
   (`meta/empresa/cliente/fiscal/pago/items/totales`) desde filas SQL.
   *SQL parametrizado vive aquí, no en el engine de preview.*
3. **Endpoint query document by number** — nuevo `api_routes_document.py`:
   `GET /document/{doc_type}/{doc_num}` → invoca `doc_query_core` →
   devuelve dataset normalizado. Sin SQL inline en el router (sólo HTTP).
4. **doc_query_core** (nuevo, `services`/`core`) — orquesta:
   resolver conexión → ejecutar query parametrizada por doc# → llamar mapper →
   validar shape contra FIELD_TREE → clasificar errores.
5. **RF preview data provider** (frontend, nuevo, p.ej.
   `engines/DocumentDataProvider.js`) — único punto que hace
   `fetch('/document/...')` y asigna a `DS._sampleData`. PreviewEngine y
   exportPDF siguen leyendo `DS._sampleData` → **dataset compartido garantizado**.
6. **UI modal conexión + número de documento** — nuevo módulo designer
   (sin tocar owners DOM existentes). Inputs: alias/conexión + tipo doc + número.
7. **PDF/export data provider compartido** — *(ya es el mismo `DS._sampleData`)*;
   no se duplica. `exportPDF` no cambia de fuente.

---

## 5. Flujo propuesto (target)

```
UI modal (conexión + tipo + número doc)
        │  fetch GET /document/{type}/{num}
        ▼
api_routes_document  (sólo HTTP)
        │
        ▼
doc_query_core ── db_source (prepared SQL, timeout) ──► rows
        │
        ▼
doc_mapper (build_*_model) ──► dataset NORMALIZADO (shape FIELD_TREE)
        │  (valida shape; errores clasificados)
        ▼
DocumentDataProvider.js  →  DS._sampleData = dataset
        │
        ├──► PreviewEngineData (preview en pantalla)
        └──► exportPDF → POST /render {layout, data:DS._sampleData}
                 (Preview y PDF = MISMO dataset normalizado)
```

---

## 6. Endpoints: existentes vs faltantes

| Endpoint | Estado |
|---|---|
| `GET/POST/DELETE /datasources`, `/datasources/{alias}/query`, `/tables`, `/schema` | EXISTE |
| `POST /render`, `/preview`, `/render-jrxml` | EXISTE |
| `GET /document/{doc_type}/{doc_num}` (dataset normalizado por número) | **FALTA** |
| `POST /datasources/{alias}/ping` o validación de conexión desde UI | parcial (`DbSource.ping` interno, expuesto sólo en register) |

---

## 7. Riesgos

1. **Mapper stub**: `build_invoice_model` no implementado → todo el flujo real
   depende de completarlo respetando el contrato shape exacto.
2. **Schema mismatch**: si el SQL real no produce todas las claves de FIELD_TREE,
   `_resolveField` devuelve `''` silenciosamente → preview "en blanco" sin error.
   Requiere validación de shape explícita.
3. **Acoplamiento doc_type↔mapper**: 5 builders distintos; el endpoint debe rutear
   por `doc_type` (usar `doc_registry.call_builder`).
4. **Credenciales**: hoy `url` se registra en `/datasources` con credenciales en
   claro en memoria; UI no debe hardcodearlas ni loguearlas.
5. **Cache TTL**: dataset cacheado podría servir documento desactualizado tras
   edición en SAP; definir TTL/invalidación por doc#.
6. **Paridad preview↔PDF**: si la UI inyecta data sólo en preview y no en el
   objeto que lee `exportPDF`, se rompe la igualdad. Mantener un único
   `DS._sampleData`.
7. **Timeout/errores**: clasificar conexión fallida / doc no encontrado /
   timeout / schema mismatch como errores distintos (hoy todo cae en
   `DbSourceError` genérico → 400).

---

## 8. Tests requeridos (cuando se implemente)

- **Backend unit**: `doc_mapper` produce todas las claves del contrato shape;
  query usa params (no concatenación) — assert prepared statement.
- **Backend errores**: conexión fallida, doc-no-encontrado (404), timeout,
  schema-mismatch → códigos/cuerpos distintos.
- **Endpoint**: `GET /document/{type}/{num}` happy-path + cada error.
- **Parity dataset**: el dataset devuelto por el endpoint == el objeto que
  consume `exportPDF` (mismo JSON), test de igualdad preview vs render.
- **Frontend**: `DocumentDataProvider` asigna `DS._sampleData` y dispara refresh;
  no escribe DOM fuera de owners.
- **No-regresión**: PreviewEngine sigue sin hacer fetch/SQL (guardrail).

## 9. Live smoke requerido

- Levantar server + designer, abrir modal, conexión a SQLite/PG de prueba,
  ingresar número de documento real → Preview se puebla con datos reales →
  Export PDF → verificar que el PDF refleja **los mismos valores** que el preview.
- Medir gate de toolbar/preview a **1280px** de viewport (no 1600) —
  ver memoria `live-smoke-toolbar-viewport`.
- Caso de error en vivo: número inexistente → mensaje "documento no encontrado";
  conexión caída → mensaje de conexión; ambos sin romper el canvas.

---

## 10. NO ROOT CAUSE / NO FIX

Esta entrega es sólo auditoría. No se modificó código de feature, no se
implementó mapper/endpoint/UI, no se hizo commit. Próximo paso (si se aprueba):
diseñar contrato exacto del endpoint `/document/{type}/{num}` y del shape de
validación antes de tocar `invoice_model.py`.
```
```
