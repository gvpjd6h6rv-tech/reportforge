/**
 * core/scene-graph-engine.js — RF.Core.SceneGraphEngine
 * Layer   : Core
 * Purpose : Intermediate scene graph between LayoutEngine and RenderPipeline.
 *           Evolves RF from "DOM → state" to "SceneGraph → DOM".
 *
 *   Before (legacy):  Designer mutates DOM → state reads DOM
 *   After (v8):       LayoutEngine builds SceneGraph → SceneGraph drives DOM
 *
 * SceneGraph is a tree of SceneNodes with computed layout properties.
 * RenderPipeline walks the SceneGraph to produce DOM patches.
 * ExecutionGraph calls SceneGraphEngine.build(ctx) after LayoutEngine.
 *
 * Node types:
 *   page         → { type:'page', pageNum, children:[] }
 *   section      → { type:'section', sectionId, stype, y, height, children:[] }
 *   element      → { type:'element', elId, x, y, w, h, data, style }
 *   group-header → { type:'group-header', level, key, children:[] }
 *   group-footer → { type:'group-footer', level, key, children:[] }
 *
 * Public API:
 *   SceneGraphEngine.build(ctx)         → SceneGraph (tree of nodes)
 *   SceneGraphEngine.diff(prev, next)   → Patch[]
 *   SceneGraphEngine.applyPatches(patches) → DOM mutations
 *   SceneGraphEngine.getNode(id)
 *   SceneGraphEngine.toJSON()
 *   SceneGraphEngine.invalidate()
 */
import RF from '../rf.js';

RF.Core.SceneGraphEngine = (() => {

  /** @type {SceneNode|null} The current committed scene graph */
  let _current = null;

  // ── Node factories ─────────────────────────────────────────────────────────

  function pageNode(pageNum, children = []) {
    return { type: 'page', id: `page-${pageNum}`, pageNum, children, _dirty: false };
  }

  function sectionNode(sectionId, stype, y, height, children = []) {
    return { type: 'section', id: `sec-${sectionId}`, sectionId, stype, y, height, children, _dirty: false };
  }

  function elementNode(el, y, data = {}) {
    return {
      type:  'element',
      id:    `el-${el.id}`,
      elId:  el.id,
      x:     el.x, y: el.y + y,
      w:     el.w, h: el.h,
      data,
      style: { fontFamily: el.fontFamily, fontSize: el.fontSize, color: el.color, align: el.align },
      _dirty: false,
    };
  }

  function groupNode(type, level, key, children = []) {
    return { type, id: `${type}-${level}-${key}`, level, key, children, _dirty: false };
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  /**
   * Build a complete scene graph from the ExecutionGraph context.
   * @param {object} ctx  Has: ctx.pages (from LayoutEngine.paginate), ctx.rows,
   *                       RF.Core.DocumentModel.layout
   * @returns {SceneNode}  Root node { type:'root', children: pageNode[] }
   */
  function build(ctx) {
    const layout   = RF.Core.DocumentModel?.layout ?? {};
    const sections = layout.sections ?? [];
    const elements = layout.elements ?? [];
    const pages    = ctx.pages ?? [{ pageNum: 1, bands: [] }];

    const root = { type: 'root', id: 'root', children: [] };

    for (const page of pages) {
      const pNode = pageNode(page.pageNum);

      for (const band of page.bands) {
        const section = sections.find(s => s.id === band.sectionId) ?? { id: band.sectionId, stype: 'det', height: band.height };
        const secElems = elements.filter(e => e.sectionId === section.id);

        // Build element nodes with resolved data
        const elNodes = secElems.map(el => {
          const rowData = band.row ?? {};
          // Resolve field paths against row data
          const resolved = el.fieldPath ? (rowData[el.fieldPath] ?? el.fieldPath) : (el.content ?? '');
          return elementNode(el, band.y, { content: resolved, row: rowData });
        });

        const sNode = sectionNode(section.id, section.stype, band.y, band.height, elNodes);
        pNode.children.push(sNode);
      }
      root.children.push(pNode);
    }

    _current = root;
    return root;
  }

  // ── Diff ───────────────────────────────────────────────────────────────────

  /**
   * Compute a minimal patch list from prev → next scene graphs.
   * Patch types: 'insert', 'remove', 'update', 'move'
   * @returns {Patch[]}
   */
  function diff(prev, next) {
    if (!prev) return [{ op: 'insert', node: next, parentId: null }];
    const patches = [];
    _diffNode(prev, next, patches);
    return patches;
  }

  function _diffNode(prev, next, patches) {
    if (!prev && next) { patches.push({ op: 'insert', node: next, parentId: null }); return; }
    if (prev && !next) { patches.push({ op: 'remove', id: prev.id }); return; }

    // Check for property changes
    if (_nodeChanged(prev, next)) {
      patches.push({ op: 'update', id: next.id, changes: _getDiff(prev, next) });
    }

    // Recurse into children
    const prevKids = prev.children ?? [];
    const nextKids = next.children ?? [];
    const maxLen   = Math.max(prevKids.length, nextKids.length);
    for (let i = 0; i < maxLen; i++) {
      _diffNode(prevKids[i] ?? null, nextKids[i] ?? null, patches);
    }
  }

  function _nodeChanged(a, b) {
    return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h
        || JSON.stringify(a.data) !== JSON.stringify(b.data)
        || JSON.stringify(a.style) !== JSON.stringify(b.style);
  }

  function _getDiff(prev, next) {
    const changes = {};
    for (const key of ['x', 'y', 'w', 'h', 'data', 'style']) {
      if (JSON.stringify(prev[key]) !== JSON.stringify(next[key])) {
        changes[key] = { from: prev[key], to: next[key] };
      }
    }
    return changes;
  }

  // ── Apply patches ──────────────────────────────────────────────────────────

  /**
   * Apply patches to the live DOM using minimal mutations.
   * Delegates to RenderPipeline for element DOM updates.
   * @param {Patch[]} patches
   */
  function applyPatches(patches) {
    for (const patch of patches) {
      switch (patch.op) {
        case 'update': {
          const { id, changes } = patch;
          const dom = document.getElementById(id) ?? document.querySelector(`[data-id="${id.replace('el-','')}"]`);
          if (!dom) break;
          if (changes.x || changes.y) {
            dom.style.left = (changes.x?.to ?? parseFloat(dom.style.left)) + 'px';
            dom.style.top  = (changes.y?.to ?? parseFloat(dom.style.top))  + 'px';
          }
          if (changes.w) dom.style.width  = changes.w.to + 'px';
          if (changes.h) dom.style.height = changes.h.to + 'px';
          if (changes.data?.to?.content !== undefined) {
            const span = dom.querySelector('.el-content');
            if (span) span.textContent = changes.data.to.content;
          }
          break;
        }
        case 'insert':
        case 'remove':
          // Delegate to RenderPipeline for full re-render
          RF.RP?.invalidate?.('sections');
          RF.RP?.flush?.();
          break;
      }
    }
  }

  // ── Utilities ──────────────────────────────────────────────────────────────

  /**
   * Walk the current scene graph to find a node by id.
   * @param {string} id
   * @returns {SceneNode|null}
   */
  function getNode(id) {
    if (!_current) return null;
    return _walk(_current, id);
  }

  function _walk(node, id) {
    if (node.id === id) return node;
    for (const child of node.children ?? []) {
      const found = _walk(child, id);
      if (found) return found;
    }
    return null;
  }

  function toJSON() {
    return _current ? JSON.parse(JSON.stringify(_current)) : null;
  }

  /** Mark the scene graph stale — next build() will rebuild from scratch. */
  function invalidate() {
    _current = null;
    RF.emit?.(RF.E?.SCENE_INVALIDATED ?? 'scene:invalidated', {});
  }

  // ── Integration hook ───────────────────────────────────────────────────────
  // Register as an ExecutionGraph stage AFTER layout
  if (RF.Core.ExecutionGraph) {
    try {
      RF.Core.ExecutionGraph.addStage('scene-graph', async ctx => {
        const sg = build(ctx);
        ctx.sceneGraph = sg;
        return ctx;
      });
    } catch { /* stage may already be registered */ }
  }

  return Object.freeze({ build, diff, applyPatches, getNode, toJSON, invalidate, pageNode, sectionNode, elementNode });
})();

export default RF;
