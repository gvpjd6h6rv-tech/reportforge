'use strict';

/**
 * LeftParametersPanel — UDS 4.1 Fase 9.
 *
 * Responsabilidad única: renderizar la lista de parámetros del documento
 * actual dentro de #params-list (panel izquierdo, header fijo
 * "Parámetros" ya existente en el HTML — ver GAP-F9-1, resuelto:
 * reusar este contenedor en vez de los tabs inferiores Grupos/
 * Parámetros/Buscar, que quedan sin tocar).
 *
 * UI CR-like, NO CR-complete (C-F9-009): lista simple, no árbol
 * jerárquico completo, no tabs inferiores, sin persistencia real.
 *
 * NO hace:
 *   - no ejecuta SQL.
 *   - no parsea SQL.
 *   - no modifica layout/geometría de secciones.
 *   - no toca Field Explorer, Preview directamente (delega el refresh a
 *     ParameterValueController), ni el document serializer.
 */
const LeftParametersPanel = {
  render() {
    const container = document.getElementById('params-list');
    if (!container) return;
    container.innerHTML = '';

    const parameters = (typeof DS !== 'undefined' && DS.layout && Array.isArray(DS.layout.parameters))
      ? DS.layout.parameters
      : [];

    if (!parameters.length) {
      const empty = document.createElement('div');
      empty.className = 'panel-section-item';
      empty.style.cssText = 'color:#888;font-style:italic;padding:4px;';
      empty.textContent = 'Este reporte no tiene parámetros';
      container.appendChild(empty);
      return;
    }

    parameters.forEach((param) => {
      container.appendChild(ParameterInputRenderer.render(param));
    });
  },
};

window.LeftParametersPanel = LeftParametersPanel;

document.addEventListener('DOMContentLoaded', () => {
  LeftParametersPanel.render();
});
