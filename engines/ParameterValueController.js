'use strict';

/**
 * ParameterValueController — UDS 4.1 Fase 9.
 *
 * Responsabilidad única: validar un valor crudo de parámetro según su
 * tipo, mantener el estado de valores actuales EN MEMORIA (DS.parameterValues
 * — sin persistencia todavía, Fase 10), y pedir un refresh de preview
 * controlado cuando un valor válido cambia.
 *
 * DEBT-F9-1 (aceptada): esta validación es una réplica JS local de
 * reportforge/core/render/datasource/report_parameter_values.py — misma
 * lógica (fecha ISO, número, booleano, string), dos runtimes. Mismo
 * patrón ya usado por FormulaEditorDialog.js/FormulaEngine.validate()
 * (validación 100% local, sin ida y vuelta al servidor).
 *
 * NO hace:
 *   - no ejecuta SQL ni llama a ningún endpoint de ejecución.
 *   - no persiste nada (DS.parameterValues vive solo en memoria).
 *   - no renderiza inputs (ParameterInputRenderer.js).
 *   - no construye la lista (LeftParametersPanel.js).
 */
const ParameterValueController = {
  /**
   * Valida y normaliza un valor crudo (string tal como lo escribió el
   * usuario) contra la definición de un parámetro. Devuelve
   * {valid:true, value} (value ya normalizado: ISO para date, number
   * para number, boolean para boolean) o {valid:false, error}.
   */
  validate(param, rawValue) {
    const trimmed = (rawValue == null ? '' : String(rawValue)).trim();
    if (!trimmed) {
      if (param.required) {
        return { valid: false, error: `Falta el parámetro requerido: ${param.name}` };
      }
      return { valid: true, value: null };
    }
    switch (param.type) {
      case 'date': return this._validateDate(trimmed);
      case 'number': return this._validateNumber(trimmed);
      case 'boolean': return this._validateBoolean(trimmed);
      default: return { valid: true, value: trimmed };
    }
  },

  // Acepta dd/mm/yyyy (formato visible en el input) y lo normaliza a
  // ISO (yyyy-mm-dd) para almacenamiento interno — mismo formato ISO
  // que report_parameter_values.py ya usa/espera.
  _validateDate(raw) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
    if (!m) return { valid: false, error: `Fecha inválida: ${raw} (formato esperado dd/mm/yyyy)` };
    const [, dd, mm, yyyy] = m;
    const day = Number(dd), month = Number(mm), year = Number(yyyy);
    const d = new Date(Date.UTC(year, month - 1, day));
    const isRealDate = d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() === day;
    if (!isRealDate) return { valid: false, error: `Fecha inválida: ${raw}` };
    return { valid: true, value: `${yyyy}-${mm}-${dd}` };
  },

  _validateNumber(raw) {
    const n = Number(raw);
    if (Number.isNaN(n)) return { valid: false, error: `Número inválido: ${raw}` };
    return { valid: true, value: n };
  },

  _validateBoolean(raw) {
    const s = raw.toLowerCase();
    if (s === 'true' || s === 'verdadero') return { valid: true, value: true };
    if (s === 'false' || s === 'falso') return { valid: true, value: false };
    return { valid: false, error: `Booleano inválido: ${raw} (usar true/false)` };
  },

  setValue(name, normalizedValue) {
    if (typeof DS === 'undefined') return;
    if (!DS.parameterValues) DS.parameterValues = {};
    DS.parameterValues[name] = normalizedValue;
  },

  getValue(name) {
    if (typeof DS === 'undefined') return undefined;
    return (DS.parameterValues || {})[name];
  },

  // Refresca preview SOLO si Preview está activo — en Diseño no hay
  // superficie de preview visible para refrescar, pero el valor ya
  // quedó guardado en DS.parameterValues (conserva entre modos).
  requestRefresh() {
    if (typeof DS !== 'undefined' && DS.previewMode && typeof PreviewEngineRenderer !== 'undefined') {
      PreviewEngineRenderer.refresh();
    }
  },
};

window.ParameterValueController = ParameterValueController;
