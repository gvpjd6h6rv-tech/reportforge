# Designer Guide

## Qué Ves en Pantalla

El diseñador actual combina:

- barra de menú
- toolbar principal
- toolbar de formato
- panel de secciones
- canvas con reglas y viewport
- field explorer
- panel de propiedades
- status bar

## Secciones

El canvas trabaja con bandas tipo Crystal Reports:

- encabezado de informe
- encabezado de página
- detalle
- pie de página
- resumen / footer

Operaciones principales:

- seleccionar una sección desde el panel lateral
- cambiar su alto con drag vertical
- insertar, mover o eliminar secciones vía commands

## Elementos

Tipos operativos más comunes:

- `text`
- `field`
- `line`
- `rect`

Flujos principales:

- insertar desde toolbar
- insertar campos desde el explorer
- mover con drag
- redimensionar con handles
- editar propiedades desde el panel derecho

## Selección

La selección canónica la gobierna `SelectionEngine`.

Comportamiento:

- click: selección simple
- `Shift+click`: multiselección
- overlay visible y alineado
- handles activos en selección simple
- bbox único en multiselección

## Formato

Controles principales:

- **bold**
- *italic*
- underline
- font family
- font size
- align left / center / right

Los controles de toolbar no mutan el DOM directo.

Flujo real:

`toolbar -> UIAdapters -> CommandRuntime/FormatEngine -> DS -> render`

## Zoom

El diseñador soporta:

- zoom `45 / 100 / 200`
- zoom libre
- wheel con `Ctrl`
- widget de zoom

Diseño y preview comparten el mismo core, pero pueden mantener estado de zoom por modo.

## Preview

Preview no es read-only.

Regla canónica actual:

- mismo core de interacción que design
- distinto render/chrome

Eso implica que en preview siguen funcionando:

- selección
- multiselección
- drag
- resize
- zoom

## Qué No Debe Pasar

Si ocurre alguno de estos síntomas, es regresión:

- overlay desalineado
- doble selección visual
- canvas duplicado
- preview sin paridad funcional
- toolbar desincronizado del modelo
