# RF — Contrato de Endpoint `/document/{type}/{number}`

> CONTRACT FIRST. No implementación todavía.
> Fuente de evidencia: `engines/RuntimeData.js` (FIELD_TREE + SAMPLE_DATA),
> `reportforge/core/models/invoice_model.py`, `nota_credito_model.py`,
> `doc_registry.py`, `api_contracts.py`.
> Identificador estable: **`rf.document.dataset.v1`** — schemaVersion: **1.0.0**

---

## 1. Identificación del endpoint

| Campo | Valor |
|---|---|
| Método | `GET` |
| Path | `/document/{type}/{number}` |
| Owner backend | `api_routes_document.py` (nuevo) + `doc_query_core.py` (nuevo, `services/`) |
| Owner frontend | `DocumentDataProvider.js` (nuevo, `engines/`) |
| Identificador estable | `contract: "rf.document.dataset.v1"` |
| Versión contrato | `schemaVersion: "1.0.0"` |
| Blocking | `false` (Phase 2 de SQL parity) |

**Justificación de `GET`:** el endpoint es idempotente y solo lee datos. No muta
estado en backend. Permite cacheo HTTP natural en el futuro.

---

## 2. Path parameters

| Parámetro | Tipo | Valores válidos | Ejemplo |
|---|---|---|---|
| `type` | `string` | `factura`, `remision`, `nota_credito`, `retencion`, `liquidacion` | `factura` |
| `number` | `integer` | entero positivo (SAP DocNum / DocEntry) | `20482` |

`type` proviene del `REGISTRY` de `doc_registry.py` — la lista de claves es
exactamente `["factura", "remision", "nota_credito", "retencion", "liquidacion"]`.

`number` es el `DocNum` del documento SAP (el entero que el usuario tipea).
El mapper puede necesitar resolver DocEntry internamente via SQL; eso es
responsabilidad del mapper, no del contrato HTTP.

---

## 3. Respuesta exitosa — `200 OK`

```json
{
  "contract":      "rf.document.dataset.v1",
  "schemaVersion": "1.0.0",
  "docType": "factura",
  "docNumber": 20482,
  "retrievedAt": "2026-06-30T00:00:00Z",
  "dataset": {
    "meta": {
      "doc_entry": 20482,
      "doc_num":   20482,
      "obj_type":  "13",
      "currency":  "USD"
    },
    "empresa": {
      "razon_social":          "DISTRIBUIDORA EPSON ECUADOR S.A.",
      "nombre_comercial":      "EPSON",
      "ruc":                   "0991234567001",
      "direccion_matriz":      "Av. 9 de Octubre 1234, Guayaquil",
      "direccion_sucursal":    "",
      "obligado_contabilidad": "SI",
      "agente_retencion":      "NO"
    },
    "cliente": {
      "razon_social":   "CLIENTE EJEMPLO S.A.",
      "identificacion": "0923456789001",
      "direccion":      "Cdla. Kennedy Norte, Guayaquil",
      "email":          "cliente@ejemplo.com"
    },
    "fiscal": {
      "ambiente":             "2",
      "tipo_emision":         "1",
      "numero_documento":     "001-001-000020482",
      "numero_autorizacion":  "2006202401099123456700120010010000204821234567818",
      "fecha_autorizacion":   "2024-06-20T14:30:00",
      "clave_acceso":         "2006202401099123456700120010010000204821234567818"
    },
    "pago": {
      "forma_pago_fe": "01",
      "total":         1234.56
    },
    "items": [
      {
        "codigo":          "BCANA.12",
        "descripcion":     "CANASTILLA INC. POSTERIOR TAIWAN DINT",
        "cantidad":        30,
        "precio_unitario": 0.1,
        "descuento":       0,
        "subtotal":        3.0
      }
    ],
    "totales": {
      "subtotal_12":             1103.18,
      "subtotal_0":              0,
      "subtotal_sin_impuestos":  1103.18,
      "iva_12":                  131.38,
      "importe_total":           1234.56
    }
  },
  "validation": {
    "schemaOk":      true,
    "missingPaths":  [],
    "extraPaths":    [],
    "warnings":      []
  }
}
```

### 3.1 Campos del envelope (inmutables por schemaVersion)

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `contract` | `string` | Sí | Identificador estable del contrato. Fijo: `"rf.document.dataset.v1"`. |
| `schemaVersion` | `string` | Sí | Versión semántica del schema. Cambio mayor = ruptura. |
| `docType` | `string` | Sí | Echo del `{type}` pedido. |
| `docNumber` | `integer` | Sí | Echo del `{number}` pedido. |
| `retrievedAt` | `string` (ISO-8601 UTC) | Sí | Timestamp de resolución del mapper. |
| `dataset` | `object` | Sí | Payload normalizado consumible directamente por `PreviewEngine`. |
| `validation` | `object` | Sí | Resultado de la validación de shape contra FIELD_TREE (ver §5). |

### 3.2 Reglas de compatibilidad del contrato

El campo `contract` es el identificador **estable**: no cambia con las versiones
del schema. El campo `schemaVersion` sigue semver y tiene estas reglas:

| Cambio | Impacto | Qué hacer |
|---|---|---|
| Añadir campo opcional al dataset | Minor version (`1.0` → `1.1`) | Frontend acepta; ignora campos extras |
| Renombrar o eliminar un campo | Major version (`1.x` → `2.0`) | Nuevo `contract` (`rf.document.dataset.v2`) |
| Cambiar tipo de un campo existente | Major version | Nuevo `contract` |
| Añadir sección nueva (e.g. `extra`) | Minor version | Frontend acepta; ignora si no conoce |

**Regla de rechazo en frontend (`DocumentDataProvider.js`):**
- `contract !== "rf.document.dataset.v1"` → rechazar (contract desconocido)
- `major(schemaVersion) !== 1` → rechazar (major incompatible)
- `major(schemaVersion) === 1` y `minor >= current_minor` → aceptar (compatible)

El frontend **nunca** falla silenciosamente: un contrato desconocido o major
incompatible lanza un error explícito antes de asignar a `DS._sampleData`.

### 3.3 Dataset normalizado — shape canónico (derivado de FIELD_TREE + SAMPLE_DATA)

El `dataset` debe satisfacer **exactamente** este shape. Todos los campos son
requeridos en el response; los opcionales pueden ser `null` o `""`.

#### `meta` (requerido, todos los campos)

| Campo | Tipo | Fuente | FIELD_TREE path |
|---|---|---|---|
| `doc_entry` | `integer` | SAP `DocEntry` | `meta.doc_entry` |
| `doc_num` | `integer` | SAP `DocNum` | `meta.doc_num` |
| `obj_type` | `string` | SAP `ObjType` (e.g. `"13"` factura) | `meta.obj_type` |
| `currency` | `string` | SAP `DocCurrency` | `meta.currency` |

#### `empresa` (requerido)

| Campo | Tipo | FIELD_TREE path |
|---|---|---|
| `razon_social` | `string` | `empresa.razon_social` |
| `nombre_comercial` | `string` | `empresa.nombre_comercial` |
| `ruc` | `string` | `empresa.ruc` |
| `direccion_matriz` | `string` | `empresa.direccion_matriz` |
| `direccion_sucursal` | `string \| null` | `empresa.direccion_sucursal` |
| `obligado_contabilidad` | `string` | `empresa.obligado_contabilidad` |
| `agente_retencion` | `string` | `empresa.agente_retencion` |

#### `cliente` (requerido)

| Campo | Tipo | FIELD_TREE path |
|---|---|---|
| `razon_social` | `string` | `cliente.razon_social` |
| `identificacion` | `string` | `cliente.identificacion` |
| `direccion` | `string \| null` | `cliente.direccion` |
| `email` | `string \| null` | `cliente.email` |

#### `fiscal` (requerido)

| Campo | Tipo | FIELD_TREE path |
|---|---|---|
| `ambiente` | `string` | `fiscal.ambiente` |
| `tipo_emision` | `string` | `fiscal.tipo_emision` |
| `numero_documento` | `string` | `fiscal.numero_documento` |
| `numero_autorizacion` | `string` | `fiscal.numero_autorizacion` |
| `fecha_autorizacion` | `string` (ISO-8601) | `fiscal.fecha_autorizacion` |
| `clave_acceso` | `string` | `fiscal.clave_acceso` |

#### `pago` (requerido)

| Campo | Tipo | FIELD_TREE path |
|---|---|---|
| `forma_pago_fe` | `string` | `pago.forma_pago_fe` |
| `total` | `number` | `pago.total` |

#### `items` (array, mínimo 0 elementos)

Cada elemento:

| Campo | Tipo | FIELD_TREE path |
|---|---|---|
| `codigo` | `string` | `item.codigo` |
| `descripcion` | `string` | `item.descripcion` |
| `cantidad` | `number` | `item.cantidad` |
| `precio_unitario` | `number` | `item.precio_unitario` |
| `descuento` | `number` | `item.descuento` |
| `subtotal` | `number` | `item.subtotal` |

#### `totales` (requerido)

| Campo | Tipo | FIELD_TREE path |
|---|---|---|
| `subtotal_12` | `number` | `totales.subtotal_12` |
| `subtotal_0` | `number` | `totales.subtotal_0` |
| `subtotal_sin_impuestos` | `number` | `totales.subtotal_sin_impuestos` |
| `iva_12` | `number` | `totales.iva_12` |
| `importe_total` | `number` | `totales.importe_total` |

---

## 4. Errores — catálogo completo

Cada error es **distinguible** por `code`. El `status` HTTP es secundario.
No hay errores genéricos: el cliente debe saber exactamente qué pasó.

Los campos `contract` y `schemaVersion` **siempre** están presentes en el
envelope de error — el frontend puede inspeccionarlos incluso cuando el
backend falla, y rechazar errores de contratos desconocidos si fuera necesario.

```json
{
  "contract":      "rf.document.dataset.v1",
  "schemaVersion": "1.0.0",
  "error": {
    "code":    "DOC_NOT_FOUND",
    "message": "Documento factura #99999 no encontrado.",
    "details": "DocNum 99999 does not exist in ObjType 13."
  }
}
```

### Catálogo de errores

| `code` | HTTP status | Cuándo | Responsable |
|---|---|---|---|
| `INVALID_DOC_TYPE` | 400 | `{type}` no está en el REGISTRY | router (validación de path) |
| `INVALID_DOC_NUMBER` | 400 | `{number}` no es entero positivo | router |
| `DOC_NOT_FOUND` | 404 | DocNum/DocEntry no existe en SAP | `doc_query_core` |
| `DB_CONNECTION_FAILED` | 503 | No se puede conectar al datasource SAP | `db_source` / `doc_query_core` |
| `DB_TIMEOUT` | 504 | La query SQL superó el timeout configurado | `db_source` |
| `SCHEMA_MISMATCH` | 422 | El mapper retornó un dataset incompleto/incorrecto | `doc_query_core` → validador |
| `MAPPER_NOT_IMPLEMENTED` | 501 | `build_*_model` levanta `NotImplementedError` | `doc_query_core` |
| `INTERNAL_ERROR` | 500 | Error inesperado no clasificado | `doc_query_core` (fallback) |

### Reglas de error

- `contract` y `schemaVersion` siempre presentes en el envelope, incluso en errores.
- `DB_TIMEOUT` y `DB_CONNECTION_FAILED` nunca se colapsan en `INTERNAL_ERROR`.
- `SCHEMA_MISMATCH` incluye en `details` las claves faltantes (de `validation.missingPaths`).
- `MAPPER_NOT_IMPLEMENTED` es informativo: indica que el stub no fue reemplazado.
- Los errores **nunca** exponen el SQL de la query ni el connection string.
- El campo `details` es para el desarrollador; `message` es legible por humanos.

---

## 5. Validación de shape contra FIELD_TREE

El `doc_query_core` debe validar el dataset **antes** de devolverlo al router.
Esto previene que `PreviewEngine` reciba un dataset incompleto y falle
silenciosamente (el `_resolveField` devuelve `''` sin error — gap conocido del
audit Phase 1).

### Paths obligatorios (extraídos del FIELD_TREE de `RuntimeData.js`)

```
meta.doc_entry          meta.doc_num         meta.currency       meta.obj_type
empresa.razon_social    empresa.ruc          empresa.direccion_matriz
empresa.obligado_contabilidad               empresa.agente_retencion
cliente.razon_social    cliente.identificacion
fiscal.ambiente         fiscal.tipo_emision  fiscal.numero_documento
fiscal.numero_autorizacion                   fiscal.fecha_autorizacion
fiscal.clave_acceso
pago.forma_pago_fe      pago.total
totales.subtotal_12     totales.subtotal_0   totales.subtotal_sin_impuestos
totales.iva_12          totales.importe_total
```

Plus: `items` es `list` (puede estar vacía, pero debe existir la clave).

### Resultado de la validación en la response

```json
"validation": {
  "schemaOk":     true,
  "missingPaths": [],
  "extraPaths":   [],
  "warnings":     ["fiscal.clave_acceso: valor vacío (autorización pendiente)"]
}
```

- `schemaOk: false` → el endpoint retorna `422 SCHEMA_MISMATCH` y el dataset **no se incluye**.
- `warnings` son informativos; no bloquean la respuesta.
- `extraPaths` son claves presentes en el dataset que no están en el FIELD_TREE
  (no es un error — son campos de extensión del mapper).

---

## 6. Query parameters opcionales

| Parámetro | Tipo | Default | Descripción |
|---|---|---|---|
| `datasource` | `string` | `"default"` | Alias del datasource registrado vía `/datasources`. Si ausente, usa el datasource default configurado en el servidor. |
| `timeout` | `integer` | `10` | Timeout de query en segundos. Rango: 1–60. |
| `ttl` | `integer` | `300` | TTL de cache del resultado en segundos. `0` = sin cache. |

---

## 7. Owner map

| Módulo | Responsabilidad única | Path (propuesto) | Owner |
|---|---|---|---|
| `api_routes_document.py` | HTTP only: validar path params, llamar `doc_query_core`, mapear errores HTTP | `reportforge/server/api_routes_document.py` | rf-backend-api |
| `doc_query_core.py` | Orquestar: resolver datasource → ejecutar query → llamar mapper → validar shape | `reportforge/core/services/doc_query_core.py` | rf-backend-core |
| `build_*_model()` | Mapper SQL rows → dataset normalizado (1 función por doc_type) | `reportforge/core/models/*_model.py` | rf-backend-models |
| `doc_shape_validator.py` | Validar dataset contra paths requeridos del FIELD_TREE | `reportforge/core/services/doc_shape_validator.py` | rf-backend-core |
| `DocumentDataProvider.js` | Único módulo frontend que hace `fetch('/document/...')` y asigna a `DS._sampleData` | `engines/DocumentDataProvider.js` | rf-designer-data |
| `PreviewEngine*.js` | Consume `DS._sampleData` — **sin cambios** | `engines/PreviewEngine*.js` | rf-designer-preview |
| `CommandRuntimeFileIO.js:exportPDF` | Usa `DS._sampleData` — **sin cambios** | `engines/CommandRuntimeFileIO.js` | rf-designer-export |

**Invariante crítico:** `PreviewEngine` y `exportPDF` **no saben** si los datos
vienen de SQL o de sample. Ambos leen `DS._sampleData`. El único módulo que
escribe `DS._sampleData` con datos reales es `DocumentDataProvider.js`.

---

## 7.5 Contrato de validación — `DocumentDataProvider.js`

`DocumentDataProvider.js` es el único punto de entrada de datos reales al
designer. Debe aplicar las tres validaciones **antes** de asignar a
`DS._sampleData`. Si cualquiera falla, lanza un error explícito y no asigna.

### Lógica de validación obligatoria

```javascript
// Pseudocódigo normativo — la implementación puede diferir en estilo
function validateAndAssign(response) {
  // 1. Contract check — rechaza contratos desconocidos
  if (response.contract !== 'rf.document.dataset.v1') {
    throw new Error(
      `DocumentDataProvider: contract desconocido "${response.contract}". ` +
      `Esperado "rf.document.dataset.v1".`
    );
  }

  // 2. Major version check — rechaza major incompatible
  const [major] = response.schemaVersion.split('.').map(Number);
  if (major !== 1) {
    throw new Error(
      `DocumentDataProvider: schemaVersion "${response.schemaVersion}" incompatible. ` +
      `Major version debe ser 1.`
    );
  }

  // 3. Schema validation check — rechaza dataset incompleto
  if (!response.validation.schemaOk) {
    throw new Error(
      `DocumentDataProvider: dataset rechazado por validación de schema. ` +
      `Paths faltantes: ${response.validation.missingPaths.join(', ')}.`
    );
  }

  // Todas las validaciones pasaron → asignar
  DS._sampleData = response.dataset;
}
```

### Qué valida y qué no valida `DocumentDataProvider`

| Validación | Responsable | Motivo |
|---|---|---|
| `contract === "rf.document.dataset.v1"` | `DocumentDataProvider.js` | Identidad del contrato |
| `major(schemaVersion) === 1` | `DocumentDataProvider.js` | Compatibilidad de major |
| `minor >= current_minor` (minor compatible) | Aceptar sin validar — campos extra se ignoran | |
| `validation.schemaOk === true` | `DocumentDataProvider.js` | Dataset completo |
| Estructura interna del dataset | No (es responsabilidad del backend) | |
| Errores HTTP (4xx, 5xx) | El caller de `DocumentDataProvider` | Manejo de red |

### Minor version compatible

Si el servidor responde `schemaVersion: "1.3.0"` y el frontend conoce `1.0.0`,
**acepta**: el dataset puede tener campos nuevos que el designer ignorará sin
error. Solo el major determina incompatibilidad.

---

## 8. Flujo de datos (contrato de orquestación)

```
GET /document/{type}/{number}?datasource=sap&timeout=10
        │
        ▼ api_routes_document.py (solo HTTP)
        │  • valida type ∈ REGISTRY → 400 INVALID_DOC_TYPE
        │  • valida number es int > 0 → 400 INVALID_DOC_NUMBER
        │
        ▼ doc_query_core.py (orquestación)
        │  • resuelve datasource alias → db_source.get_registered()
        │  • ejecuta query parametrizada (DocNum, ObjType) → db_source
        │  │   → 503 DB_CONNECTION_FAILED | 504 DB_TIMEOUT
        │  │   → 404 DOC_NOT_FOUND (0 rows)
        │  • llama build_{type}_model(doc_entry) → mapper
        │  │   → 501 MAPPER_NOT_IMPLEMENTED
        │  • pasa resultado a doc_shape_validator
        │  │   → 422 SCHEMA_MISMATCH (dataset incompleto)
        │
        ▼ 200 OK — envelope + dataset + validation
        │
   ← DocumentDataProvider.js
        │  1. contract === "rf.document.dataset.v1" → throw si no
        │  2. major(schemaVersion) === 1            → throw si no
        │  3. validation.schemaOk === true          → throw si no
        │  DS._sampleData = response.dataset        ← único punto de escritura
        │
        ├── PreviewEngine (preview en canvas)   ← lee DS._sampleData, sin cambios
        └── exportPDF → POST /render {layout, data: DS._sampleData}  ← sin cambios
```

---

## 9. Notas de implementación (guía para Phase 3)

> Estas notas son anticipaciones contractuales, no decisiones de implementación.

- **SQL no vive en `doc_query_core`**: el core llama al mapper; el mapper
  ejecuta las queries via `db_source`. `doc_query_core` no importa
  `get_sql`, `sa_query` ni `sqlite_query` directamente.
- **Timeout configurable**: `db_source.get_engine` ya soporta `connect_args`.
  El timeout de query (statement timeout) puede pasarse como parámetro al
  SA engine o como `execution_options(timeout=n)`.
- **Credentials**: nunca en query string, nunca en logs. El datasource se
  registra previamente en `/datasources` con el URL (incluyendo credenciales),
  que vive en memoria del servidor, no en HTTP.
- **Cache**: la clave de cache incluye `(doc_type, doc_number, datasource_alias)`.
  El TTL 0 desactiva el cache (útil en desarrollo / datos recientes).
- **`_special` fields**: los campos `_special.*` del FIELD_TREE son campos de
  sistema (fecha de impresión, número de página, etc.) — los rellena el
  `EnterpriseEngine` en render time, no el mapper. No deben ir en el dataset
  del endpoint.

---

## 10. Tests requeridos antes de implementar (Phase 3)

### 10.1 Tests de backend (Python)

| Test | Responsabilidad |
|---|---|
| `test_document_endpoint_contract.py` | Response 200 incluye `contract`, `schemaVersion`, `dataset`, `validation`; shape cumple §3 |
| `test_document_endpoint_errors.py` | Cada error retorna su HTTP status; envelope incluye `contract` y `schemaVersion` |
| `test_doc_shape_validator.py` | Valida paths requeridos; detecta `missingPaths` correctamente |
| `test_doc_query_core_integration.py` | `doc_query_core` produce dataset válido dado un mapper mock |
| `test_document_endpoint_preview_parity.py` | `dataset` del endpoint == objeto que `exportPDF` recibiría (mismo JSON) |

### 10.2 Tests de frontend (JavaScript / Node --test)

| Test | Responsabilidad |
|---|---|
| `document_data_provider_rejects_unknown_contract.test.mjs` | Rechaza response con `contract !== "rf.document.dataset.v1"` |
| `document_data_provider_rejects_major_incompatible.test.mjs` | Rechaza `schemaVersion: "2.0.0"` (major 2) |
| `document_data_provider_accepts_minor_compatible.test.mjs` | Acepta `schemaVersion: "1.3.0"` sin error; asigna `DS._sampleData` |
| `document_data_provider_rejects_invalid_schema.test.mjs` | Rechaza si `validation.schemaOk === false` |
| `document_data_provider_errors_carry_contract.test.mjs` | La response de error incluye `contract` y `schemaVersion` correctos |
| `document_data_provider_preview_pdf_parity.test.mjs` | Preview y PDF reciben exactamente el mismo objeto `DS._sampleData` |

### 10.3 Criterio de aceptación global

Todos los tests de §10.1 y §10.2 deben pasar en verde antes de cualquier
commit. Ningún test puede ser marcado como skip o pending.

---

## 11. Lo que este contrato NO define

- El SQL exacto de cada mapper (es responsabilidad de `build_*_model`).
- El schema de la tabla SAP (depende del cliente).
- La UI del modal de conexión (Phase 4 de SQL parity).
- El mecanismo de autenticación del endpoint (fuera de scope Phase 2).
- El comportamiento cuando hay múltiples documentos con el mismo `DocNum`
  en distintas series (edge case a definir en Phase 3).
