/**
 * core/data-engine.js — RF.Core.DataEngine
 * Layer   : Core
 * Purpose : Dataset registry, joins, filtering, grouping, caching,
 *           and transformation pipeline. Single source of truth for
 *           all report data. Acts as the data tier in the pipeline:
 *           DataEngine → QueryGraph → FormulaEngine → LayoutEngine → RenderPipeline
 *
 * Deps    : RF (namespace only)
 *
 * Public API:
 *   registerDataset(alias, rows, schema?)
 *   getDataset(alias)
 *   joinDatasets(aliasA, aliasB, opts)  → virtual dataset
 *   filterDataset(alias, predicateFn)  → filtered view
 *   groupDataset(alias, keyFn)         → grouped map
 *   cacheDataset(alias, key, data)     / getCached(alias, key)
 *   transform(alias, ...fns)           → pipeline result
 *   clearCache(alias?)
 *   listDatasets()
 */
import RF from '../rf.js';

RF.Core.DataEngine = (() => {

  // ── Internal storage ──────────────────────────────────────────────────────
  /** @type {Map<string, {rows:any[], schema:Record<string,string>, meta:object}>} */
  const _registry = new Map();

  /** @type {Map<string, Map<string, any>>} */
  const _cache    = new Map();

  // ── Schema inference ──────────────────────────────────────────────────────
  function inferSchema(rows) {
    if (!rows.length) return {};
    const schema = {};
    const sample = rows[0];
    for (const key of Object.keys(sample)) {
      const v = sample[key];
      schema[key] = v === null ? 'null'
        : typeof v === 'number'  ? 'number'
        : typeof v === 'boolean' ? 'boolean'
        : v instanceof Date      ? 'date'
        : 'string';
    }
    return schema;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Register (or replace) a named dataset.
   * @param {string} alias        Unique name used across the report.
   * @param {any[]}  rows         Array of plain objects.
   * @param {object} [schema]     Optional explicit type map { field: 'number'|'string'|... }
   */
  function registerDataset(alias, rows, schema = null) {
    if (typeof alias !== 'string' || !alias) throw new TypeError('DataEngine: alias must be a non-empty string');
    if (!Array.isArray(rows)) throw new TypeError('DataEngine: rows must be an array');
    const s = schema ?? inferSchema(rows);
    _registry.set(alias, { rows: [...rows], schema: s, meta: { registeredAt: Date.now(), rowCount: rows.length } });
    RF.emit?.(RF.E?.DATA_REGISTERED ?? 'data:registered', { alias, rowCount: rows.length });
    return { alias, rowCount: rows.length, schema: s };
  }

  /**
   * Retrieve a dataset by alias.
   * @returns {{ rows, schema, meta }} or throws if not found.
   */
  function getDataset(alias) {
    const ds = _registry.get(alias);
    if (!ds) throw new ReferenceError(`DataEngine: dataset "${alias}" not registered`);
    return { rows: [...ds.rows], schema: { ...ds.schema }, meta: { ...ds.meta } };
  }

  /**
   * Join two datasets into a new virtual dataset.
   * @param {string} aliasA
   * @param {string} aliasB
   * @param {{ type:'inner'|'left'|'right', on: (a,b)=>boolean, as?: string }} opts
   */
  function joinDatasets(aliasA, aliasB, opts = {}) {
    const { type = 'inner', on: predicate, as: resultAlias } = opts;
    if (typeof predicate !== 'function') throw new TypeError('DataEngine.joinDatasets: opts.on must be a function');
    const dsA = _registry.get(aliasA);
    const dsB = _registry.get(aliasB);
    if (!dsA) throw new ReferenceError(`DataEngine: dataset "${aliasA}" not found`);
    if (!dsB) throw new ReferenceError(`DataEngine: dataset "${aliasB}" not found`);

    const result = [];
    for (const rowA of dsA.rows) {
      const matches = dsB.rows.filter(rowB => predicate(rowA, rowB));
      if (type === 'inner' && matches.length) {
        for (const rowB of matches) result.push({ ...rowA, ...rowB });
      } else if (type === 'left') {
        if (matches.length) { for (const rowB of matches) result.push({ ...rowA, ...rowB }); }
        else result.push({ ...rowA });
      } else if (type === 'right') {
        if (matches.length) { for (const rowB of matches) result.push({ ...rowA, ...rowB }); }
      }
    }
    if (type === 'right') {
      for (const rowB of dsB.rows) {
        if (!dsA.rows.some(rowA => predicate(rowA, rowB))) result.push({ ...rowB });
      }
    }
    const joined = { rows: result, schema: { ...dsA.schema, ...dsB.schema }, meta: { join: { type, aliasA, aliasB } } };
    if (resultAlias) _registry.set(resultAlias, joined);
    return { rows: [...result], schema: joined.schema };
  }

  /**
   * Filter a dataset without mutating the original.
   * @param {string}   alias
   * @param {Function} predicateFn  (row, index) => boolean
   * @returns {{ rows, schema }}
   */
  function filterDataset(alias, predicateFn) {
    if (typeof predicateFn !== 'function') throw new TypeError('DataEngine.filterDataset: predicateFn must be a function');
    const ds = _registry.get(alias);
    if (!ds) throw new ReferenceError(`DataEngine: dataset "${alias}" not found`);
    return { rows: ds.rows.filter(predicateFn), schema: { ...ds.schema } };
  }

  /**
   * Group a dataset by a key function.
   * @param {string}   alias
   * @param {Function} keyFn  (row) => string | number
   * @returns {Map<key, row[]>}
   */
  function groupDataset(alias, keyFn) {
    if (typeof keyFn !== 'function') throw new TypeError('DataEngine.groupDataset: keyFn must be a function');
    const ds = _registry.get(alias);
    if (!ds) throw new ReferenceError(`DataEngine: dataset "${alias}" not found`);
    const map = new Map();
    for (const row of ds.rows) {
      const key = keyFn(row);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return map;
  }

  /**
   * Store arbitrary computed data in the cache for a dataset.
   * Used by the ExecutionGraph to avoid re-computing expensive aggregates.
   */
  function cacheDataset(alias, key, data) {
    if (!_cache.has(alias)) _cache.set(alias, new Map());
    _cache.get(alias).set(key, data);
  }

  function getCached(alias, key) {
    return _cache.get(alias)?.get(key) ?? null;
  }

  /**
   * Composable transformation pipeline.
   * @param {string}   alias
   * @param {...Function} fns  Each fn receives rows and returns rows.
   * @returns {any[]}
   */
  function transform(alias, ...fns) {
    const ds = _registry.get(alias);
    if (!ds) throw new ReferenceError(`DataEngine: dataset "${alias}" not found`);
    return fns.reduce((rows, fn) => fn(rows), [...ds.rows]);
  }

  /** Remove cached entries. Pass alias to clear one dataset's cache, omit to clear all. */
  function clearCache(alias) {
    if (alias) { _cache.delete(alias); } else { _cache.clear(); }
  }

  /** List all registered dataset aliases with metadata. */
  function listDatasets() {
    return [..._registry.entries()].map(([alias, ds]) => ({
      alias, rowCount: ds.rows.length, schema: ds.schema, meta: ds.meta,
    }));
  }

  // ── Expose ────────────────────────────────────────────────────────────────
  return Object.freeze({
    registerDataset, getDataset, joinDatasets, filterDataset,
    groupDataset, cacheDataset, getCached, transform, clearCache, listDatasets,
  });
})();

export default RF;

/* ── Integration exports (for sandbox tests) ────────────────────────────── */
if (typeof module !== 'undefined') module.exports = { DataEngine: RF?.Core?.DataEngine };
