/**
 * Contract test: SelectionHitTest.resolveElementDiv in preview mode
 *
 * Verifies that when target is a .pv-el[data-origin-id], resolveElementDiv
 * returns that pv-el — NOT a hidden .cr-element from the design canvas.
 *
 * This test MUST be RED before the fix and GREEN after.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const src = fs.readFileSync(path.join(ROOT, 'engines', 'SelectionHitTest.js'), 'utf8');

function buildDom() {
  // Minimal element factory
  function el(tag, cls, dataset) {
    const classSet = new Set((cls || '').split(/\s+/).filter(Boolean));
    const children = [];
    const node = {
      tagName: tag.toUpperCase(),
      className: cls || '',
      dataset: { ...dataset },
      style: {},
      children,
      parentElement: null,
      _hidden: false,
      appendChild(c) { children.push(c); c.parentElement = node; },
      closest(sel) {
        let cur = node;
        while (cur) {
          if (matches(cur, sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      matches(sel) { return matches(node, sel); },
      classList: {
        contains(c) { return classSet.has(c); },
      },
    };
    return node;
  }

  function matches(node, sel) {
    return sel.split(',').some(s => matchSingle(node, s.trim()));
  }

  function matchSingle(node, sel) {
    const parts = sel.match(/([.#][\w-]+|\[[\w-]+(?:="[^"]*")?\])/g) || [];
    return parts.every(p => {
      if (p.startsWith('.')) return node.className.split(/\s+/).includes(p.slice(1));
      if (p.startsWith('[')) {
        const m = p.match(/\[([\w-]+)(?:="([^"]*)")?\]/);
        if (!m) return false;
        const [, attr, val] = m;
        if (attr.startsWith('data-')) {
          const key = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
          if (val !== undefined) return node.dataset?.[key] === val;
          return node.dataset?.[key] !== undefined;
        }
        return false;
      }
      return false;
    });
  }

  // ── Design canvas (hidden in preview) ─────────────────────────────
  const crElement = el('div', 'cr-element', { id: 'rh-company-matriz' });
  crElement._hidden = true; // represents display:none in preview

  // ── Preview DOM ───────────────────────────────────────────────────
  const pvEl = el('div', 'pv-el', { originId: 'rh-company-matriz' });

  // Flat registry for querySelector
  const allNodes = [crElement, pvEl];

  const documentMock = {
    querySelector(sel) {
      return allNodes.find(n => matches(n, sel)) || null;
    },
    querySelectorAll(sel) {
      return allNodes.filter(n => matches(n, sel));
    },
  };

  return { crElement, pvEl, documentMock, matches };
}

describe('SelectionHitTest.resolveElementDiv preview contract', () => {

  function loadModule(documentMock, dsMock) {
    const sandbox = {
      document: documentMock,
      DS: dsMock,
      console,
      module: { exports: {} },
    };
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.module.exports;
  }

  it('target=pv-el must return the pv-el, not the hidden cr-element', () => {
    const { crElement, pvEl, documentMock } = buildDom();
    const DS = { previewMode: true };
    const mod = loadModule(documentMock, DS);

    const result = mod.resolveElementDiv(pvEl, 'rh-company-matriz');

    // Must return the pv-el that was the actual target
    assert.ok(result !== null, 'resolveElementDiv must not return null');
    assert.equal(result, pvEl,
      'must return the .pv-el target, not the hidden .cr-element');
    assert.notEqual(result, crElement,
      'must NOT return the hidden .cr-element from design canvas');
  });

  it('target=pv-el must NOT fallback to cr-element when pv-el exists', () => {
    const { crElement, pvEl, documentMock } = buildDom();
    const DS = { previewMode: true };
    const mod = loadModule(documentMock, DS);

    const result = mod.resolveElementDiv(pvEl, 'rh-company-matriz');

    // The returned node must have data-origin-id, not data-id
    assert.ok(result !== null, 'must resolve to a node');
    const isPreviewNode = result.dataset?.originId === 'rh-company-matriz';
    const isDesignNode = result.dataset?.id === 'rh-company-matriz';
    assert.ok(isPreviewNode,
      'resolved node must be the preview element (data-origin-id)');
    assert.ok(!isDesignNode,
      'resolved node must NOT be the design element (data-id)');
  });

  it('design mode: target=cr-element must still return cr-element (no regression)', () => {
    const { crElement, documentMock } = buildDom();
    const DS = { previewMode: false };
    const mod = loadModule(documentMock, DS);

    const result = mod.resolveElementDiv(crElement, 'rh-company-matriz');

    assert.equal(result, crElement,
      'design mode must still resolve .cr-element as before');
  });
});
