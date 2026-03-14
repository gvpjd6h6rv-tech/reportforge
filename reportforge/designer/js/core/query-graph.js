/**
 * core/query-graph.js — RF.Core.QueryGraph
 * Layer   : Core
 * Purpose : Semantic query model — represents a report's data query as a
 *           directed acyclic graph of nodes (table, join, filter, sort,
 *           group, projection) before execution. Compiles to a DataEngine
 *           operation sequence.
 *
 * Node types:
 *   table      → { type:'table',  alias, source }
 *   join       → { type:'join',   left, right, joinType, on }
 *   filter     → { type:'filter', input, predicate }
 *   sort       → { type:'sort',   input, fields:[{field,dir}] }
 *   group      → { type:'group',  input, keys:[], aggregates:[] }
 *   projection → { type:'proj',   input, fields:[] | '*' }
 *
 * Public API:
 *   addTable(alias, source)
 *   addJoin(leftAlias, rightAlias, opts)
 *   addFilter(inputAlias, predicateFn, label?)
 *   addSort(inputAlias, fields)
 *   addGroup(inputAlias, keys, aggregates)
 *   addProjection(inputAlias, fields)
 *   compile()          → executable { steps[], outputAlias }
 *   reset()
 *   toJSON()           → serialisable graph
 *   fromJSON(json)
 */
import RF from '../rf.js';

RF.Core.QueryGraph = (() => {

  /** @type {Map<string, object>} alias → node */
  const _nodes  = new Map();
  /** @type {string[]} topological order */
  const _order  = [];
  let   _nextId = 0;

  function _id() { return `q${++_nextId}`; }

  // ── Node constructors ─────────────────────────────────────────────────────

  /**
   * Register a data source table/dataset.
   * @param {string} alias    Name used in joins/filters.
   * @param {string} source   DataEngine alias or 'inline'.
   */
  function addTable(alias, source) {
    _assertNew(alias);
    const node = Object.freeze({ type: 'table', id: _id(), alias, source });
    _nodes.set(alias, node);
    _order.push(alias);
    return node;
  }

  /**
   * Join two nodes into a new virtual node.
   * @param {string} leftAlias
   * @param {string} rightAlias
   * @param {{ joinType:'inner'|'left'|'right', on:Function, as?:string }} opts
   */
  function addJoin(leftAlias, rightAlias, opts = {}) {
    _assertExists(leftAlias);
    _assertExists(rightAlias);
    const { joinType = 'inner', on, as: alias = `join_${leftAlias}_${rightAlias}` } = opts;
    if (typeof on !== 'function') throw new TypeError('QueryGraph.addJoin: opts.on must be a function');
    const node = Object.freeze({ type: 'join', id: _id(), alias, left: leftAlias, right: rightAlias, joinType, on });
    _nodes.set(alias, node);
    _order.push(alias);
    return node;
  }

  /**
   * Add a filter step on top of an existing node.
   * @param {string}   inputAlias
   * @param {Function} predicateFn  (row, index) => boolean
   * @param {string}   [label]      Human-readable description
   */
  function addFilter(inputAlias, predicateFn, label = '') {
    _assertExists(inputAlias);
    if (typeof predicateFn !== 'function') throw new TypeError('QueryGraph.addFilter: predicateFn must be a function');
    const alias = `filter_${inputAlias}_${_id()}`;
    const node  = Object.freeze({ type: 'filter', id: _id(), alias, input: inputAlias, predicate: predicateFn, label });
    _nodes.set(alias, node);
    _order.push(alias);
    return node;
  }

  /**
   * Add a sort step.
   * @param {string} inputAlias
   * @param {{ field:string, dir:'asc'|'desc' }[]} fields
   */
  function addSort(inputAlias, fields) {
    _assertExists(inputAlias);
    if (!Array.isArray(fields) || !fields.length) throw new TypeError('QueryGraph.addSort: fields must be non-empty array');
    const alias = `sort_${inputAlias}_${_id()}`;
    const node  = Object.freeze({ type: 'sort', id: _id(), alias, input: inputAlias, fields });
    _nodes.set(alias, node);
    _order.push(alias);
    return node;
  }

  /**
   * Add a grouping + aggregation step.
   * @param {string}   inputAlias
   * @param {string[]} keys          Group-by field names.
   * @param {{ field:string, fn:'sum'|'count'|'avg'|'min'|'max', as:string }[]} aggregates
   */
  function addGroup(inputAlias, keys, aggregates = []) {
    _assertExists(inputAlias);
    const alias = `group_${inputAlias}_${_id()}`;
    const node  = Object.freeze({ type: 'group', id: _id(), alias, input: inputAlias, keys: [...keys], aggregates: [...aggregates] });
    _nodes.set(alias, node);
    _order.push(alias);
    return node;
  }

  /**
   * Add a projection (column selection) step.
   * @param {string}          inputAlias
   * @param {string[]|'*'}    fields
   */
  function addProjection(inputAlias, fields = '*') {
    _assertExists(inputAlias);
    const alias = `proj_${inputAlias}_${_id()}`;
    const node  = Object.freeze({ type: 'proj', id: _id(), alias, input: inputAlias, fields });
    _nodes.set(alias, node);
    _order.push(alias);
    return node;
  }

  // ── Compile ───────────────────────────────────────────────────────────────

  /**
   * Compile the graph into a list of executable steps for DataEngine.
   * Returns { steps[], outputAlias } where each step has { op, args }.
   */
  function compile() {
    if (!_nodes.size) return { steps: [], outputAlias: null };
    const steps  = [];
    let   output = null;

    for (const alias of _order) {
      const node = _nodes.get(alias);
      switch (node.type) {
        case 'table':
          steps.push({ op: 'getDataset', args: [node.source], outputAlias: alias });
          break;
        case 'join':
          steps.push({ op: 'joinDatasets', args: [node.left, node.right, { type: node.joinType, on: node.on, as: alias }], outputAlias: alias });
          break;
        case 'filter':
          steps.push({ op: 'filterDataset', args: [node.input, node.predicate], outputAlias: alias });
          break;
        case 'sort':
          steps.push({ op: 'sortDataset', args: [node.input, node.fields], outputAlias: alias });
          break;
        case 'group':
          steps.push({ op: 'groupDataset', args: [node.input, node.keys, node.aggregates], outputAlias: alias });
          break;
        case 'proj':
          steps.push({ op: 'projectDataset', args: [node.input, node.fields], outputAlias: alias });
          break;
      }
      output = alias;
    }
    return { steps, outputAlias: output };
  }

  function reset() { _nodes.clear(); _order.length = 0; _nextId = 0; }

  function toJSON() {
    return {
      nodes: [..._nodes.values()].map(n => ({ ...n, on: n.on?.toString() ?? null, predicate: n.predicate?.toString() ?? null })),
      order: [..._order],
    };
  }

  function fromJSON(json) {
    reset();
    for (const n of json.nodes) {
      const restored = { ...n };
      // Functions cannot be fully restored from JSON — callers must re-attach
      _nodes.set(n.alias, Object.freeze(restored));
    }
    _order.push(...json.order);
  }

  // ── Guards ────────────────────────────────────────────────────────────────
  function _assertNew(alias)    { if (_nodes.has(alias)) throw new Error(`QueryGraph: alias "${alias}" already exists`); }
  function _assertExists(alias) { if (!_nodes.has(alias)) throw new ReferenceError(`QueryGraph: alias "${alias}" not found`); }

  return Object.freeze({ addTable, addJoin, addFilter, addSort, addGroup, addProjection, compile, reset, toJSON, fromJSON });
})();

export default RF;
