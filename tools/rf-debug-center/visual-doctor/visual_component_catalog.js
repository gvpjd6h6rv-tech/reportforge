export const VISUAL_COMPONENT_CATALOG = [
  {
    id: 'rf-shell',
    label: 'ReportForge shell',
    selectors: ['#app', 'body'],
    keywords: ['reportforge', 'shell', 'app'],
    notes: 'Contenedor principal de la aplicación ReportForge.',
  },
  {
    id: 'rf-toolbar',
    label: 'ReportForge toolbar',
    selectors: ['.toolbar', '#toolbar', '[role="toolbar"]', '.classic-toolbar'],
    keywords: ['toolbar', 'menu', 'button'],
    notes: 'Barra superior y controles de edición.',
  },
  {
    id: 'rf-canvas',
    label: 'Designer canvas',
    selectors: ['#canvas-area', '.canvas-area', '.designer-canvas', '.cr-report'],
    keywords: ['canvas', 'report', 'designer'],
    notes: 'Área principal de diseño visual del reporte.',
  },
  {
    id: 'rf-report-sections',
    label: 'Report sections',
    selectors: ['.cr-section', '[data-section]', '.section-band'],
    keywords: ['section', 'band', 'header', 'detail', 'footer'],
    notes: 'Bandas/secciones del reporte Crystal-like.',
  },
  {
    id: 'rf-report-elements',
    label: 'Report elements',
    selectors: ['.cr-element', '[data-field-path]', '[data-element-id]', '.report-element'],
    keywords: ['element', 'field', 'text', 'line', 'rect'],
    notes: 'Elementos editables/renderizados dentro del reporte.',
  },
  {
    id: 'rf-left-panel',
    label: 'Left parameters panel',
    selectors: ['#panel-left', '.panel-left', '.left-panel'],
    keywords: ['parameters', 'left', 'sections'],
    notes: 'Panel izquierdo de parámetros/secciones.',
  },
  {
    id: 'rf-right-panel',
    label: 'Field explorer panel',
    selectors: ['#panel-right', '.panel-right', '.field-explorer', '.explorer'],
    keywords: ['fields', 'explorer', 'right'],
    notes: 'Explorador de campos y estructura de datos.',
  },
  {
    id: 'rf-debug-center',
    label: 'RF Debug Center',
    selectors: ['#rf-debug-center-root', '[data-rf-debug-center-root]', '.rf-debug-center'],
    keywords: ['debug', 'doctor', 'bundle', 'evidence'],
    notes: 'Instrumentación visual/forense de ReportForge.',
  },
];

export const VISUAL_COMPONENT_MAP = new Map(
  VISUAL_COMPONENT_CATALOG.map((component) => [component.id, component])
);
