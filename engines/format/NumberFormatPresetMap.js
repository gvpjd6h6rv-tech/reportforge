'use strict';
/**
 * NumberFormatPresetMap
 *
 * Single responsibility: data only.
 * Defines the list of built-in number format presets (Crystal Reports style)
 * and the canonical DEFAULT_NUMBER_CONFIG.
 *
 * No DOM. No DS. No events. No formatting logic.
 *
 * Exports:
 *   NUMBER_FORMAT_PRESETS  — ordered array of preset descriptors
 *   DEFAULT_NUMBER_CONFIG  — canonical default config object
 *   getPreset(id)          — find preset by id, returns undefined if not found
 */
(function initNumberFormatPresetMap(global) {

  const DEFAULT_NUMBER_CONFIG = Object.freeze({
    presetId:           'system_default',
    decimals:           2,
    thousands:          false,
    decimalSeparator:   '.',
    thousandsSeparator: ',',
    currency: Object.freeze({ enabled: false, symbol: '$', position: 'floating' }),
    negative: Object.freeze({ mode: 'minus' }),
    zero:     Object.freeze({ blankIfZero: false, leadingZero: true }),
    // BACKLOG — Phase 2, not active:
    rounding:   Object.freeze({ enabled: false, increment: null }),
    accounting: Object.freeze({ enabled: false }),
  });

  function _cfg(overrides) {
    const c = Object.assign({}, DEFAULT_NUMBER_CONFIG, overrides);
    // Deep-clone mutable sub-objects so presets are independent
    c.currency  = Object.assign({}, DEFAULT_NUMBER_CONFIG.currency,  (overrides.currency  || {}));
    c.negative  = Object.assign({}, DEFAULT_NUMBER_CONFIG.negative,  (overrides.negative  || {}));
    c.zero      = Object.assign({}, DEFAULT_NUMBER_CONFIG.zero,      (overrides.zero      || {}));
    c.rounding  = Object.assign({}, DEFAULT_NUMBER_CONFIG.rounding,  (overrides.rounding  || {}));
    c.accounting= Object.assign({}, DEFAULT_NUMBER_CONFIG.accounting,(overrides.accounting|| {}));
    return c;
  }

  /**
   * Each preset:
   *   id       — unique string
   *   label    — shown in preset list
   *   example  — formatted example string shown to the right of the label
   *   config   — full number config object compatible with NumberFormatter
   */
  const NUMBER_FORMAT_PRESETS = [
    {
      id: 'system_default',
      label: 'Predeterminado del sistema',
      example: '-1,234.00',
      config: _cfg({ presetId: 'system_default', decimals: 2, thousands: true }),
    },
    {
      id: 'fixed_0',
      label: 'Entero sin separador',
      example: '-1234',
      config: _cfg({ presetId: 'fixed_0', decimals: 0, thousands: false }),
    },
    {
      id: 'fixed_1',
      label: 'Un decimal',
      example: '-1234.0',
      config: _cfg({ presetId: 'fixed_1', decimals: 1, thousands: false }),
    },
    {
      id: 'fixed_2',
      label: 'Dos decimales',
      example: '-1234.00',
      config: _cfg({ presetId: 'fixed_2', decimals: 2, thousands: false }),
    },
    {
      id: 'fixed_3',
      label: 'Tres decimales',
      example: '-1234.000',
      config: _cfg({ presetId: 'fixed_3', decimals: 3, thousands: false }),
    },
    {
      id: 'fixed_4',
      label: 'Cuatro decimales',
      example: '-1234.0000',
      config: _cfg({ presetId: 'fixed_4', decimals: 4, thousands: false }),
    },
    {
      id: 'thousands_0',
      label: 'Entero con miles',
      example: '-1,234',
      config: _cfg({ presetId: 'thousands_0', decimals: 0, thousands: true }),
    },
    {
      id: 'thousands_2',
      label: 'Dos decimales con miles',
      example: '-1,234.00',
      config: _cfg({ presetId: 'thousands_2', decimals: 2, thousands: true }),
    },
    {
      id: 'negative_parentheses_2',
      label: 'Paréntesis con miles',
      example: '(1,234.00)',
      config: _cfg({
        presetId: 'negative_parentheses_2',
        decimals: 2,
        thousands: true,
        negative: { mode: 'parentheses' },
      }),
    },
    {
      id: 'currency_2',
      label: 'Moneda dos decimales',
      example: '$ -1,234.00',
      config: _cfg({
        presetId: 'currency_2',
        decimals: 2,
        thousands: true,
        currency: { enabled: true, symbol: '$', position: 'floating' },
      }),
    },
  ];

  function getPreset(id) {
    return NUMBER_FORMAT_PRESETS.find(function(p) { return p.id === id; });
  }

  global.NumberFormatPresetMap = {
    NUMBER_FORMAT_PRESETS: NUMBER_FORMAT_PRESETS,
    DEFAULT_NUMBER_CONFIG: DEFAULT_NUMBER_CONFIG,
    getPreset: getPreset,
  };

  if (typeof module !== 'undefined') {
    module.exports = {
      NUMBER_FORMAT_PRESETS: NUMBER_FORMAT_PRESETS,
      DEFAULT_NUMBER_CONFIG: DEFAULT_NUMBER_CONFIG,
      getPreset: getPreset,
    };
  }

})(typeof window !== 'undefined' ? window : globalThis);
