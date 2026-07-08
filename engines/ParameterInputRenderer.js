'use strict';

/**
 * ParameterInputRenderer — UDS 4.1 Fase 9.
 *
 * Responsabilidad única: renderizar UN input para UN parámetro (date |
 * number | string | boolean), mostrando su valor actual (o default), y
 * wireando Enter/blur a ParameterValueController para validar/actualizar/
 * refrescar. Devuelve el nodo DOM contenedor — no lo inserta en ningún
 * lado (eso es responsabilidad de LeftParametersPanel.js).
 *
 * NO hace:
 *   - no valida por su cuenta (delega 100% a ParameterValueController).
 *   - no construye la lista completa de parámetros.
 *   - no ejecuta SQL ni toca preview directamente.
 */
const ParameterInputRenderer = {
  // CR-like compact block: parameter name on top, editable value below
  // (matches the Crystal Reports 2016 SP5 left-panel layout evidence —
  // NOT a side-by-side label+input row).
  render(param) {
    const wrap = document.createElement('div');
    wrap.className = 'param-input-block';
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:1px;padding:3px 4px;font-size:10px;border-bottom:1px solid #D8D4C4;';

    const label = document.createElement('div');
    label.className = 'param-input-block-name';
    label.textContent = param.label || param.name;
    label.style.cssText = 'color:#333;font-weight:bold;';
    label.title = param.name;
    wrap.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'param-input';
    input.dataset.paramName = param.name;
    input.style.cssText = 'width:100%;box-sizing:border-box;font-size:10px;padding:1px 3px;border:1px inset #ACA899;background:#FFF;';

    const current = ParameterValueController.getValue(param.name);
    const initial = current !== undefined ? current : param.defaultValue;
    input.value = this._displayValue(param, initial);
    if (param.type === 'date') input.placeholder = 'dd/mm/yyyy';

    const commit = () => this._commit(param, input);
    input.addEventListener('blur', commit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); input.blur(); }
    });

    wrap.appendChild(input);
    return wrap;
  },

  // Internamente los valores de fecha se guardan en ISO (yyyy-mm-dd);
  // el input siempre MUESTRA dd/mm/yyyy.
  _displayValue(param, value) {
    if (value == null || value === '') return '';
    if (param.type === 'date') {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
      if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    }
    return String(value);
  },

  _commit(param, input) {
    const result = ParameterValueController.validate(param, input.value);
    if (!result.valid) {
      input.style.borderColor = '#CC0000';
      input.style.background = '#FFF0F0';
      input.title = result.error;
      return;
    }
    input.style.borderColor = '';
    input.style.background = '#FFF';
    input.title = '';
    ParameterValueController.setValue(param.name, result.value);
    ParameterValueController.requestRefresh();
  },
};

window.ParameterInputRenderer = ParameterInputRenderer;
