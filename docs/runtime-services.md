# RuntimeServices

## Qué Es

[`engines/RuntimeServices.js`](/home/mimi/Escritorio/RF/engines/RuntimeServices.js) es el registro central del runtime para dependencias estructurales compartidas.

Su objetivo es reemplazar globals crudos usados como infraestructura, por ejemplo:

- owners canónicos
- flags de interacción
- refs DOM compartidas
- contract guards
- metadatos de runtime

## Qué Centraliza

API principal:

- `expose(name, value)`
- `getExport(name)`
- `setFlag(name, value)`
- `getFlag(name, fallback)`
- `setOwner(kind, value)`
- `getOwner(kind)`
- `setDomRef(name, value)`
- `getDomRef(name)`
- `setMeta(name, value)`
- `getMeta(name)`
- `setDebugFlags(value)`
- `getDebugFlags()`
- `setContractGuards(value)`
- `getContractGuards()`
- `isEngineCoreInteractionEnabled()`
- `trace(channel, event, payload)`

## Por Qué Existe

Antes, el runtime dependía de globals estructurales sueltos como:

- `window.__RF_CANONICAL_*`
- `window.RF_USE_ENGINECORE_INTERACTION`
- `window.RFContractGuards`
- `window.__rfCommandRegistry`
- refs `_rf*`

Eso hacía difícil:

- auditar ownership
- congelar boundaries
- gobernar regresiones

Ahora, esos datos viven detrás de una API única.

## Cómo Debe Usarse

Correcto:

- leer owners desde `RuntimeServices.getOwner(...)`
- fijar flags desde `RuntimeServices.setFlag(...)`
- registrar refs estructurales desde `RuntimeServices.setDomRef(...)`
- publicar guards desde `RuntimeServices.setContractGuards(...)`

Incorrecto:

- escribir nuevos globals estructurales en `window.*`
- leer flags estructurales desde `window.*` directo
- duplicar owners/refs/flags fuera del registry

## Qué Está Prohibido

- `window.__RF_CANONICAL_*`
- `window.RF_USE_ENGINECORE_INTERACTION`
- `window.RFContractGuards`
- `window.__rfCommandRegistry`
- `window._rfCanvas`, `window._rfViewport`, `window._rfWorkspace`

Si reaparecen en módulos frontera, `governance` debe fallar.

## Relación Con Globals Públicos

`RuntimeServices` no elimina automáticamente todos los globals históricos del runtime.  
Lo que sí hace es mover la infraestructura estructural crítica a una superficie controlada.

Los globals públicos todavía permitidos se rigen por la whitelist de governance, no por libertad abierta.
