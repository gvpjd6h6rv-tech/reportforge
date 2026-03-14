/**
 * core/execution-graph.js — RF.Core.ExecutionGraph
 * Layer   : Core
 * Purpose : Orchestrates the full report execution pipeline:
 *
 *   DataEngine → QueryGraph → FormulaEngine → GroupEngine
 *             → LayoutEngine → RenderPipeline
 *
 *   Each stage is a registered handler that receives { context } and
 *   returns a (possibly mutated) context. Stages run in registration order.
 *   Any stage may throw to abort execution.
 *
 * Public API:
 *   ExecutionGraph.addStage(name, handlerFn)   Register a pipeline stage.
 *   ExecutionGraph.run(input)                  Execute all stages; returns context.
 *   ExecutionGraph.debug(input)                Dry-run with per-stage timing/trace.
 *   ExecutionGraph.getStages()                 List registered stages.
 *   ExecutionGraph.removeStage(name)
 *   ExecutionGraph.clear()
 */
import RF from '../rf.js';

RF.Core.ExecutionGraph = (() => {

  /** @type {{ name:string, fn:(ctx)=>ctx|Promise<ctx> }[]} */
  const _stages = [];

  /**
   * Register a named pipeline stage.
   * @param {string}   name       Unique stage identifier.
   * @param {Function} handlerFn  (context: object) => context | Promise<context>
   *                              Must return the (mutated) context.
   */
  function addStage(name, handlerFn) {
    if (typeof name !== 'string' || !name) throw new TypeError('ExecutionGraph.addStage: name must be a non-empty string');
    if (typeof handlerFn !== 'function')   throw new TypeError('ExecutionGraph.addStage: handlerFn must be a function');
    if (_stages.find(s => s.name === name)) throw new Error(`ExecutionGraph: stage "${name}" already registered`);
    _stages.push({ name, fn: handlerFn });
    return _stages.length;
  }

  /**
   * Execute all stages sequentially.
   * @param {object} input  Initial context passed through every stage.
   * @returns {Promise<object>}  Final context after all stages.
   */
  async function run(input = {}) {
    let ctx = { ...input, _errors: [], _trace: [], _startedAt: Date.now() };
    for (const stage of _stages) {
      try {
        const result = await stage.fn(ctx);
        ctx = result ?? ctx;
      } catch (err) {
        ctx._errors.push({ stage: stage.name, error: err.message });
        throw Object.assign(new Error(`ExecutionGraph: stage "${stage.name}" failed: ${err.message}`), { ctx, stage: stage.name });
      }
    }
    ctx._durationMs = Date.now() - ctx._startedAt;
    RF.emit?.(RF.E?.EXEC_COMPLETE ?? 'exec:complete', { durationMs: ctx._durationMs, errors: ctx._errors });
    return ctx;
  }

  /**
   * Dry-run: execute every stage and collect timing + result snapshot per stage.
   * Does NOT throw on stage failure — captures error and continues.
   * @returns {Promise<{ results: StageResult[], totalMs: number }>}
   */
  async function debug(input = {}) {
    let ctx = { ...input, _errors: [], _trace: [], _startedAt: Date.now() };
    const results = [];

    for (const stage of _stages) {
      const t0 = Date.now();
      let status = 'ok', errorMsg = null;
      try {
        const result = await stage.fn({ ...ctx });  // shallow clone so stages don't mutate debug ctx
        ctx = result ?? ctx;
      } catch (err) {
        status   = 'error';
        errorMsg = err.message;
        ctx._errors.push({ stage: stage.name, error: err.message });
      }
      const durationMs = Date.now() - t0;
      const stageResult = {
        stage:      stage.name,
        status,
        durationMs,
        error:      errorMsg,
        contextKeys: Object.keys(ctx).filter(k => !k.startsWith('_')),
      };
      results.push(stageResult);
      ctx._trace.push(stageResult);
    }

    const totalMs = Date.now() - ctx._startedAt;
    return { results, totalMs, context: ctx };
  }

  function getStages() { return _stages.map(s => s.name); }

  function removeStage(name) {
    const idx = _stages.findIndex(s => s.name === name);
    if (idx === -1) throw new ReferenceError(`ExecutionGraph: stage "${name}" not found`);
    _stages.splice(idx, 1);
  }

  function clear() { _stages.length = 0; }

  // ── Default RF pipeline stages ────────────────────────────────────────────
  // Stages are registered here as stubs; each module overrides with real logic.

  function _registerDefaultPipeline() {
    addStage('data', async ctx => {
      // DataEngine: resolve dataset from QueryGraph compiled output
      const qg = RF.Core.QueryGraph;
      if (!qg) return ctx;
      const compiled = qg.compile();
      if (!compiled.outputAlias) return ctx;
      const de = RF.Core.DataEngine;
      let rows = [];
      for (const step of compiled.steps) {
        if (step.op === 'getDataset') {
          try { rows = de.getDataset(step.args[0]).rows; ctx[step.outputAlias] = rows; }
          catch { ctx[step.outputAlias] = []; }
        } else if (step.op === 'filterDataset') {
          const src = ctx[step.args[0]] ?? [];
          ctx[step.outputAlias] = src.filter(step.args[1]);
        } else if (step.op === 'sortDataset') {
          const src = [...(ctx[step.args[0]] ?? [])];
          const fields = step.args[1];
          src.sort((a, b) => {
            for (const { field, dir } of fields) {
              if (a[field] < b[field]) return dir === 'asc' ? -1 :  1;
              if (a[field] > b[field]) return dir === 'asc' ?  1 : -1;
            }
            return 0;
          });
          ctx[step.outputAlias] = src;
        }
      }
      ctx.rows = ctx[compiled.outputAlias] ?? [];
      return ctx;
    });

    addStage('formulas', async ctx => {
      // FormulaEngine: evaluate WhileReadingRecords formulas
      const fe = RF.Core.FormulaEngine;
      if (!fe || !ctx.rows) return ctx;
      // Attach computed formula fields to each row
      ctx.rows = ctx.rows.map(row => {
        // FormulaEngine.evaluate returns value for each formula in the layout
        return { ...row };  // formulas attached by RenderPipeline per-element
      });
      return ctx;
    });

    addStage('groups', async ctx => {
      // GroupEngine: build group tree from layout.groups
      const layout = RF.Core.DocumentModel?.layout;
      if (!layout?.groups?.length || !ctx.rows) return ctx;
      const groups = layout.groups;
      // Build group hierarchy: nested grouping
      function buildTree(rows, level) {
        if (level >= groups.length) return rows;
        const g = groups[level];
        const map = new Map();
        for (const row of rows) {
          const key = row[g.field] ?? '';
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(row);
        }
        const result = [];
        for (const [key, groupRows] of map) {
          result.push({ _groupKey: key, _groupField: g.field, _level: level, rows: buildTree(groupRows, level + 1) });
        }
        return result;
      }
      ctx.groupTree = buildTree(ctx.rows, 0);
      return ctx;
    });

    addStage('layout', async ctx => {
      // LayoutEngine: paginate the report
      const le = RF.Core.LayoutEngine;
      if (!le) return ctx;
      ctx.pages = le.paginate(ctx);
      return ctx;
    });

    addStage('render', async ctx => {
      // RenderPipeline: produce final HTML/DOM output
      const rp = RF.Core.RenderPipeline ?? RF.RP;
      if (!rp) return ctx;
      rp.invalidate('sections');
      rp.flush?.();
      ctx.rendered = true;
      return ctx;
    });
  }

  // Auto-register default pipeline when the module loads
  // (can be cleared and rebuilt by the app for custom pipelines)
  _registerDefaultPipeline();

  return Object.freeze({ addStage, run, debug, getStages, removeStage, clear });
})();

export default RF;
