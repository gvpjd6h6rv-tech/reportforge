# Cargar documento SAP B1 en el Designer

Esta guía cubre el flujo completo para cargar un documento real desde SAP Business One
en el Designer de ReportForge, validarlo en Preview y exportarlo a PDF con datos reales.

---

## 1. Requisitos previos

### Variables de entorno

El backend necesita acceso a la base de datos SAP B1 antes de poder servir datos reales.

| Variable | Obligatoria | Descripción | Ejemplo |
|---|---|---|---|
| `SAP_B1_DB_URL` | Sí (para datos reales) | Connection string SQLAlchemy para la BD SAP B1 vía ODBC | `mssql+pyodbc://usuario@host/SBO_EMPRESA` |
| `SAP_B1_TEST_DOC_ENTRY` | Solo para smoke | DocEntry de una factura existente para tests automatizados | `20482` |

**`SAP_B1_DB_URL`** sigue el formato de SQLAlchemy con driver pyodbc:

```
mssql+pyodbc://usuario:contraseña@host:1433/SBO_EMPRESA?driver=ODBC+Driver+17+for+SQL+Server
```

Si la variable no está definida y se intenta cargar un documento real, el endpoint
retorna `503 DB_CONNECTION_FAILED`.

Las credenciales **nunca** se registran en logs ni se exponen en respuestas HTTP.
El connection string vive únicamente en la memoria del proceso servidor.

---

## 2. Arrancar el servidor con acceso a SAP

```bash
# Con SAP real
SAP_B1_DB_URL="mssql+pyodbc://usuario@host/SBO_EMPRESA" \
  python -m uvicorn reportforge.server.api:create_app --factory --host 0.0.0.0 --port 5000

# Solo desarrollo (sin SAP — funciona con SAMPLE_DATA del designer)
python3 reportforge_server.py
```

---

## 3. Uso desde el Designer

### Menú Archivo → Cargar documento SAP

1. Abrir el Designer en `http://localhost:5000/` (o `http://localhost:5001/` para dev server).
2. Hacer clic en el menú **Archivo** → **Cargar documento SAP…**
   — o —
   Hacer clic en el botón **📥** de la barra de herramientas (atajo: `F6`).
3. En el modal:
   - Seleccionar el **Tipo de documento** (factura, remisión, nota de crédito, retención, liquidación).
   - Ingresar el **Número de documento** (DocEntry entero positivo).
   - Hacer clic en **Cargar**.
4. El modal muestra el estado:
   - **Cargando…** mientras se hace la petición.
   - **OK** si el documento se cargó correctamente. `DS._sampleData` se actualiza.
   - **Error** con el `code` y `message` si algo falla.

### Verificar que Preview usa los datos reales

1. Después de cargar el documento, abrir la pestaña **Preview**.
2. El Preview llama `PreviewEngineRenderer.refresh()` que lee `DS._sampleData`.
3. Todos los campos del canvas se renderizan con los datos del documento SAP.

### Exportar PDF con datos reales

1. Con el documento cargado, ir a **Archivo → Exportar PDF**.
2. El PDF se genera con exactamente el mismo `DS._sampleData` que usó Preview.
3. No hay diferencia entre lo que ve Preview y lo que va al PDF.

---

## 4. Smoke manual (backend)

El script `scripts/smoke_document.py` verifica el endpoint HTTP directamente,
sin browser. Útil para validar que el server está bien configurado antes de usar el Designer.

```bash
# Escenarios básicos (sin SAP real — verifica respuestas de error)
python scripts/smoke_document.py --server http://localhost:5000

# Con factura existente (requiere SAP_B1_DB_URL en el entorno del servidor)
python scripts/smoke_document.py --server http://localhost:5000 --doc 20482

# Solo mostrar ejemplos curl
python scripts/smoke_document.py --curl --doc 20482

# Usando variable de entorno
SAP_B1_TEST_DOC_ENTRY=20482 python scripts/smoke_document.py
```

### Escenarios que verifica el smoke

| # | Escenario | Resultado esperado |
|---|---|---|
| 1 | Factura existente (`--doc <DocEntry>`) | `200`, `schemaOk: true`, `items` no vacío |
| 2 | Factura inexistente (DocEntry 999999999) | `404`, `error.code: DOC_NOT_FOUND` |
| 3 | Tipo de documento desconocido | `400`, `error.code: INVALID_DOC_TYPE` |
| 4 | Número de documento inválido (letra) | `400`, `error.code: INVALID_DOC_NUMBER` |
| 5 | Datasource inválido (`--test-bad-ds`) | `503`, `error.code: DB_CONNECTION_FAILED` |

---

## 5. Errores esperados

Todos los errores siguen el contrato `rf.document.dataset.v1`. El campo `error.code`
es el identificador estable; el `message` es legible por humanos.

```json
{
  "contract":      "rf.document.dataset.v1",
  "schemaVersion": "1.0.0",
  "error": {
    "code":    "DOC_NOT_FOUND",
    "message": "Documento factura #999999999 no encontrado.",
    "details": "OINV DocEntry=999999999 no encontrado."
  }
}
```

### Catálogo de errores

| `error.code` | HTTP | Cuándo aparece | Qué hacer |
|---|---|---|---|
| `INVALID_DOC_TYPE` | 400 | Tipo no válido (ej. `boleta`) | Usar: `factura`, `remision`, `nota_credito`, `retencion`, `liquidacion` |
| `INVALID_DOC_NUMBER` | 400 | Número no es entero positivo | Ingresar un número entero mayor que 0 |
| `DOC_NOT_FOUND` | 404 | El DocEntry no existe en SAP | Verificar el número en SAP Business One |
| `DB_CONNECTION_FAILED` | 503 | No se puede conectar a la BD | Verificar `SAP_B1_DB_URL` y conectividad de red |
| `DB_TIMEOUT` | 504 | La query superó el timeout | Aumentar el parámetro `timeout` (default 10 s, max 60 s) |
| `SCHEMA_MISMATCH` | 422 | El mapper retornó un dataset incompleto | Revisar el mapper del tipo de documento |
| `MAPPER_NOT_IMPLEMENTED` | 501 | Tipo no implementado aún | Solo `factura` está implementado en esta versión |
| `INTERNAL_ERROR` | 500 | Error inesperado no clasificado | Revisar logs del servidor |

### Errores en el modal del Designer

El modal muestra `error.code` y `error.message` directamente.
`DS._sampleData` **no se modifica** cuando hay un error — los datos anteriores
(o el `SAMPLE_DATA` por defecto) se mantienen intactos.

---

## 6. Verificación rápida con curl

```bash
# Factura existente
curl -s 'http://localhost:5000/document/factura/20482' | python -m json.tool

# Factura inexistente
curl -s 'http://localhost:5000/document/factura/999999999' | python -m json.tool

# Tipo inválido
curl -s 'http://localhost:5000/document/boleta/1' | python -m json.tool

# Número inválido
curl -s 'http://localhost:5000/document/factura/abc' | python -m json.tool

# Con timeout personalizado
curl -s 'http://localhost:5000/document/factura/20482?timeout=30' | python -m json.tool
```

---

## 7. Tipos de documento soportados

| Tipo | Implementado | Mapper |
|---|---|---|
| `factura` | Sí | `reportforge/core/models/invoice_model.py` |
| `remision` | No (stub) | `reportforge/core/models/remision_model.py` |
| `nota_credito` | No (stub) | `reportforge/core/models/nota_credito_model.py` |
| `retencion` | No (stub) | `reportforge/core/models/retencion_model.py` |
| `liquidacion` | No (stub) | `reportforge/core/models/liquidacion_model.py` |

Los tipos con stub retornan `501 MAPPER_NOT_IMPLEMENTED`.
Implementar un tipo consiste en reemplazar el `raise NotImplementedError` en el mapper
correspondiente con la lógica SQL real.

---

## 8. Referencia de arquitectura

Ver [`docs/architecture/document-endpoint-contract.md`](../architecture/document-endpoint-contract.md)
para el contrato completo del endpoint, el shape del dataset, y el owner map de módulos.
