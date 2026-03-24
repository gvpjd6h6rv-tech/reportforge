/**
 * core/parameter-engine.js — RF.Core.ParameterEngine
 * Layer   : Core
 * Purpose : Runtime parameter management for reports.
 *   - registerParameter: declare a parameter with type, default, constraints
 *   - resolveParameter: resolve a dynamic value list (from dataset or function)
 *   - getParameterValue: retrieve the current runtime value
 *   - setParameterValue: set value with type validation
 *   - cascading: parameter B's allowed values depend on parameter A's value
 *   - prompt: emit a UI prompt event when a value is required
 *
 * Public API:
 *   registerParameter(name, opts)
 *   getParameterValue(name)
 *   setParameterValue(name, value)
 *   resolveParameter(name)          → { value, allowedValues, isValid }
 *   promptAll()                     → Promise<Record<name, value>>
 *   resetAll()
 *   listParameters()
 */
import RF from '../rf.js';

RF.Core.ParameterEngine = (() => {

  /** @type {Map<string, ParameterDef>} */
  const _params = new Map();

  /**
   * @typedef {object} ParameterDef
   * @property {string}          name
   * @property {'string'|'number'|'boolean'|'date'|'range'} type
   * @property {any}             defaultValue
   * @property {any}             value
   * @property {boolean}         allowMultiple
   * @property {boolean}         required
   * @property {string}          label
   * @property {string}          description
   * @property {any[]|Function|string} allowedValues  Array, function returning array, or dataset alias
   * @property {string[]}        cascadesFrom    Names of params this one depends on
   * @property {Function}        [validator]     (value) => boolean | string (error msg)
   */

  /**
   * Declare a report parameter.
   * @param {string} name
   * @param {object} opts
   */
  function registerParameter(name, opts = {}) {
    if (!name) throw new TypeError('ParameterEngine.registerParameter: name is required');
    if (_params.has(name)) throw new Error(`ParameterEngine: parameter "${name}" already registered`);

    const def = {
      name,
      type:          opts.type          ?? 'string',
      defaultValue:  opts.defaultValue  ?? null,
      value:         opts.defaultValue  ?? null,
      allowMultiple: opts.allowMultiple ?? false,
      required:      opts.required      ?? true,
      label:         opts.label         ?? name,
      description:   opts.description   ?? '',
      allowedValues: opts.allowedValues ?? null,   // null = no restriction
      cascadesFrom:  opts.cascadesFrom  ?? [],
      validator:     opts.validator     ?? null,
    };
    _params.set(name, def);
    return def;
  }

  /**
   * Get the current value of a parameter.
   * @param {string} name
   * @returns {any}
   */
  function getParameterValue(name) {
    const p = _get(name);
    return p.value;
  }

  /**
   * Set a parameter value with type coercion and validation.
   * @param {string} name
   * @param {any}    value
   */
  function setParameterValue(name, value) {
    const p = _get(name);
    const coerced = _coerce(value, p.type);

    if (p.validator) {
      const result = p.validator(coerced);
      if (result !== true && result !== undefined) {
        throw new RangeError(`ParameterEngine: "${name}" validation failed: ${result}`);
      }
    }

    // Check allowedValues constraint
    if (p.allowedValues && !p.allowMultiple) {
      const allowed = _resolveAllowed(p);
      if (allowed.length && !allowed.includes(coerced)) {
        throw new RangeError(`ParameterEngine: "${name}" value "${coerced}" not in allowed list`);
      }
    }

    p.value = coerced;
    RF.emit?.(RF.E?.PARAM_CHANGED ?? 'param:changed', { name, value: coerced });

    // Cascade: any parameter that depends on this one resets its value
    for (const [depName, depParam] of _params) {
      if (depParam.cascadesFrom.includes(name)) {
        depParam.value = depParam.defaultValue;
        RF.emit?.(RF.E?.PARAM_CHANGED ?? 'param:changed', { name: depName, value: depParam.value, cascade: true });
      }
    }
  }

  /**
   * Resolve a parameter: evaluate its allowedValues and return full state.
   * @param {string} name
   * @returns {{ value, allowedValues:any[], isValid:boolean, missingDeps:string[] }}
   */
  function resolveParameter(name) {
    const p = _get(name);
    const missingDeps = p.cascadesFrom.filter(dep => {
      const d = _params.get(dep);
      return !d || d.value === null || d.value === undefined;
    });

    const allowedValues = missingDeps.length ? [] : _resolveAllowed(p);
    const isValid = !p.required || (p.value !== null && p.value !== undefined && p.value !== '');

    return { value: p.value, allowedValues, isValid, missingDeps };
  }

  /**
   * Prompt the user to fill all required parameters without values.
   * Emits RF.E.PARAM_PROMPT and returns a Promise that resolves when all are set.
   * @returns {Promise<Record<string,any>>}
   */
  function promptAll() {
    const needed = [..._params.values()].filter(p => p.required && (p.value === null || p.value === undefined));
    if (!needed.length) return Promise.resolve(getAll());

    return new Promise((resolve, reject) => {
      const paramList = needed.map(p => ({ name: p.name, label: p.label, type: p.type, allowedValues: _resolveAllowed(p) }));
      RF.emit?.(RF.E?.PARAM_PROMPT ?? 'param:prompt', {
        params: paramList,
        submit(values) {
          try {
            for (const [name, val] of Object.entries(values)) setParameterValue(name, val);
            resolve(getAll());
          } catch (e) { reject(e); }
        },
        cancel() { reject(new Error('ParameterEngine: parameter prompt cancelled')); },
      });
    });
  }

  /** Reset all parameters to their default values. */
  function resetAll() {
    for (const p of _params.values()) { p.value = p.defaultValue; }
  }

  /** Get all current values as a plain object. */
  function getAll() {
    const result = {};
    for (const [name, p] of _params) result[name] = p.value;
    return result;
  }

  /** List all registered parameter definitions. */
  function listParameters() {
    return [..._params.values()].map(p => ({ ...p, validator: !!p.validator }));
  }

  // ── Private ────────────────────────────────────────────────────────────────

  function _get(name) {
    const p = _params.get(name);
    if (!p) throw new ReferenceError(`ParameterEngine: parameter "${name}" not registered`);
    return p;
  }

  function _coerce(value, type) {
    if (value === null || value === undefined) return value;
    switch (type) {
      case 'number':  return Number(value);
      case 'boolean': return Boolean(value);
      case 'date':    return value instanceof Date ? value : new Date(value);
      default:        return String(value);
    }
  }

  function _resolveAllowed(p) {
    if (!p.allowedValues) return [];
    if (typeof p.allowedValues === 'function') {
      // Dynamic list: pass current param values as context
      return p.allowedValues(getAll()) ?? [];
    }
    if (typeof p.allowedValues === 'string') {
      // Dataset alias
      try { return RF.Core.DataEngine?.getDataset(p.allowedValues).rows ?? []; }
      catch { return []; }
    }
    return p.allowedValues;
  }

  return Object.freeze({ registerParameter, getParameterValue, setParameterValue, resolveParameter, promptAll, resetAll, getAll, listParameters });
})();

export default RF;
