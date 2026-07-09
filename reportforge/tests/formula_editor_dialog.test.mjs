'use strict';
/**
 * formula_editor_dialog.test.mjs
 *
 * Behavior suite for engines/FormulaEditorDialog.js (SP-CLEANUP-01,
 * BLOCKED_NEEDS_TESTS resolution). No server, no DOM, no browser.
 *
 * This suite captures CURRENT behavior, including quirks that are real
 * but not necessarily desirable (documented inline where relevant). It
 * does not change or "fix" engines/FormulaEditorDialog.js.
 *
 * §1  open() — modal construction
 * §2  open() — helper columns (fields / functions / operators)
 * §3  open() — pre-fills from an existing formula
 * §4  _getFields()
 * §5  _validate()
 * §6  save()
 */
import test   from 'node:test';
import assert from 'node:assert/strict';
import fs     from 'node:fs';
import vm     from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SRC  = fs.readFileSync(resolve(ROOT, 'engines/FormulaEditorDialog.js'), 'utf8');

// ── MockDOM (same pattern as sql_connection_modal.test.mjs / field_explorer_engine_readonly_field.test.mjs) ──

class MockElement {
  constructor(tag) {
    this.tag         = String(tag).toUpperCase();
    this.tagName     = this.tag;
    this.className   = '';
    this.textContent = '';
    this.innerHTML   = '';
    this.value       = '';
    this.placeholder = '';
    this.title       = '';
    this.style       = { cssText: '' };
    this.selectionStart = 0;
    this.selectionEnd   = 0;
    this._attrs      = {};
    this._listeners  = {};
    this._children   = [];
    this._parent     = null;
    this.onclick      = null;
    this.onmouseenter = null;
    this.onmouseleave = null;
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k)    { return this._attrs[k] ?? null; }
  appendChild(el) {
    if (el && el._parent) el._parent._children = el._parent._children.filter(c => c !== el);
    el._parent = this;
    this._children.push(el);
    return el;
  }
  removeChild(el) { this._children = this._children.filter(c => c !== el); if (el) el._parent = null; return el; }
  remove()  { if (this._parent) this._parent.removeChild(this); }
  focus()   {}
  addEventListener(event, fn) { (this._listeners[event] = this._listeners[event] || []).push(fn); }
  _fire(event, ...args) { (this._listeners[event] || []).forEach(fn => fn(...args)); }
}

class MockDocument {
  constructor() {
    this.body = new MockElement('body');
    this._idMap = {};
  }
  createElement(tag) {
    const el = new MockElement(tag);
    const self = this;
    Object.defineProperty(el, 'id', {
      get() { return el._idVal || ''; },
      set(v) { el._idVal = v; if (v) self._idMap[v] = el; },
    });
    return el;
  }
  getElementById(id) { return this._idMap[id] || null; }
}

function _root(doc) { return doc.body._children[0] || null; }

function _findByText(doc, text) {
  let found = null;
  const walk = (node) => {
    if (found || !node) return;
    if (node.textContent === text) { found = node; return; }
    (node._children || []).forEach(walk);
  };
  walk(doc.body);
  return found;
}

// ── Fixture ──────────────────────────────────────────────────────────────────

function _sampleFieldTree() {
  return {
    database: {
      label: 'Campos de base de datos', icon: '🗄️',
      children: {
        cliente: {
          label: 'cliente', icon: '👤',
          children: {
            razon_social: { path: 'cliente.razon_social', label: 'razon_social', vtype: 'string' },
          },
        },
        empresa: {
          label: 'empresa', icon: '🏢',
          children: {
            ruc: { path: 'empresa.ruc', label: 'ruc', vtype: 'string' },
          },
        },
      },
    },
    formula: { label: 'Campos de fórmula', icon: 'ƒ', children: {} },
  };
}

/**
 * includeFieldTree=false omits the FIELD_TREE global entirely (not even
 * `undefined`) — needed to reproduce the real, unguarded ReferenceError
 * that save() throws in that case (see §6 REAL QUIRK test).
 */
function _load({
  funcs = ['IIf', 'Sum'],
  formulas = {},
  fieldTree = _sampleFieldTree(),
  includeFieldTree = true,
  validateImpl = () => ({ valid: true }),
  confirmImpl = () => true,
} = {}) {
  const doc = new MockDocument();
  const calls = { fieldExplorerInit: 0, saveHistory: 0 };
  const alertLog = [];
  // save() reads document.getElementById('sb-msg') unguarded — in the real
  // designer page this status-bar element always exists at bootstrap.
  const sbMsg = doc.createElement('div');
  sbMsg.id = 'sb-msg';
  const ctx = {
    document: doc,
    FormulaEngine: {
      getFunctions: () => funcs,
      validate: validateImpl,
    },
    DS: { formulas, saveHistory: () => { calls.saveHistory++; } },
    FieldExplorerEngine: { init: () => { calls.fieldExplorerInit++; } },
    alert:   (msg) => alertLog.push(msg),
    confirm: (msg) => confirmImpl(msg),
  };
  if (includeFieldTree) ctx.FIELD_TREE = fieldTree;
  ctx.window = ctx;
  const context = vm.createContext(ctx);
  new vm.Script(SRC).runInContext(context);
  return { dlg: ctx.FormulaEditorDialog, doc, calls, alertLog, fieldTree, sbMsg };
}

// ── §1 — open(): modal construction ───────────────────────────────────────────

test('§1 open() adds exactly one overlay to document.body, id=formula-editor-overlay', () => {
  const { dlg, doc } = _load();
  assert.equal(doc.body._children.length, 0);
  dlg.open();
  assert.equal(doc.body._children.length, 1);
  assert.equal(_root(doc).id, 'formula-editor-overlay');
});

test('§1 open() is idempotent — second call does not leave two overlays open', () => {
  const { dlg, doc } = _load();
  dlg.open();
  dlg.open();
  assert.equal(doc.body._children.length, 1);
});

// ── §2 — open(): helper columns (fields / functions / operators) ─────────────

test('§2 Fields & Parameters column lists every FIELD_TREE leaf path', () => {
  const { dlg, doc } = _load();
  dlg.open();
  assert.ok(_findByText(doc, 'cliente.razon_social'), 'expected cliente.razon_social to be listed');
  assert.ok(_findByText(doc, 'empresa.ruc'), 'expected empresa.ruc to be listed');
});

test('§2 clicking a field item inserts {path} into the expression textarea', () => {
  const { dlg, doc } = _load();
  dlg.open();
  const item = _findByText(doc, 'empresa.ruc');
  assert.ok(item && typeof item.onclick === 'function');
  item.onclick();
  assert.equal(doc.getElementById('fe-expr').value, '{empresa.ruc}');
});

test('§2 clicking a function item inserts "name(" into the expression textarea', () => {
  const { dlg, doc } = _load({ funcs: ['Sum', 'IIf'] });
  dlg.open();
  const item = _findByText(doc, 'Sum');
  assert.ok(item && typeof item.onclick === 'function');
  item.onclick();
  assert.equal(doc.getElementById('fe-expr').value, 'Sum(');
});

test('§2 clicking an operator item inserts " op " (padded) into the expression textarea', () => {
  const { dlg, doc } = _load();
  dlg.open();
  const item = _findByText(doc, 'And');
  assert.ok(item && typeof item.onclick === 'function');
  item.onclick();
  assert.equal(doc.getElementById('fe-expr').value, ' And ');
});

// ── §3 — open(): pre-fills from an existing formula ───────────────────────────

test('§3 open(existingName, existingExpr) pre-fills #fe-name and #fe-expr', () => {
  const { dlg, doc } = _load();
  dlg.open('Formula_Total', '{a} + {b}');
  assert.equal(doc.getElementById('fe-name').value, 'Formula_Total');
  assert.equal(doc.getElementById('fe-expr').value, '{a} + {b}');
});

test('§3 opening with a valid existing expression shows the OK badge immediately (open() calls _validate())', () => {
  const { dlg, doc } = _load({ validateImpl: () => ({ valid: true }) });
  dlg.open('Formula_Total', '{a} + {b}');
  assert.equal(doc.getElementById('fe-valid').textContent, '✓ Syntax OK');
});

// ── §4 — _getFields() ──────────────────────────────────────────────────────────

test('§4 walks nested FIELD_TREE.database.children and collects every leaf .path, skipping label/icon', () => {
  const { dlg } = _load();
  const fields = dlg._getFields();
  assert.ok(fields.includes('cliente.razon_social'));
  assert.ok(fields.includes('empresa.ruc'));
  assert.ok(!fields.includes('Campos de base de datos'), 'label values must never leak into the field list');
});

test('§4 includes every key from DS.formulas', () => {
  const { dlg } = _load({ formulas: { Formula_TotalConIVA: '{a}*1.21' } });
  const fields = dlg._getFields();
  assert.ok(fields.includes('Formula_TotalConIVA'));
});

test('§4 REAL QUIRK: does NOT deduplicate when a DS.formulas name collides with an existing FIELD_TREE leaf path', () => {
  const { dlg } = _load({ formulas: { 'empresa.ruc': '1+1' } });
  const fields = dlg._getFields();
  const occurrences = fields.filter((f) => f === 'empresa.ruc').length;
  assert.equal(occurrences, 2, 'current code has no dedup logic — both the tree leaf and the colliding formula name appear');
});

test('§4 does not throw when FIELD_TREE is entirely undeclared (typeof-guarded read)', () => {
  const { dlg } = _load({ includeFieldTree: false, formulas: { MyFormula: '2+2' } });
  let fields;
  assert.doesNotThrow(() => { fields = dlg._getFields(); });
  // fields is an Array from the vm realm — compare by value, not by
  // deepEqual (which also checks [[Prototype]] and fails cross-realm).
  assert.equal(fields.length, 1);
  assert.equal(fields[0], 'MyFormula');
});

test('§4 does not throw when DS.formulas is undefined', () => {
  const { dlg } = _load({ formulas: undefined });
  let fields;
  assert.doesNotThrow(() => { fields = dlg._getFields(); });
  assert.ok(Array.isArray(fields));
});

// ── §5 — _validate() ───────────────────────────────────────────────────────────

test('§5 valid formula sets the OK badge (text + green background)', () => {
  const { dlg, doc } = _load({ validateImpl: () => ({ valid: true }) });
  dlg.open();
  doc.getElementById('fe-expr').value = '{a} + {b}';
  dlg._validate();
  const badge = doc.getElementById('fe-valid');
  assert.equal(badge.textContent, '✓ Syntax OK');
  assert.match(badge.style.cssText, /background:#1E5F4A/);
});

test('§5 invalid formula sets the error badge with the raw FormulaEngine error, exposed only via textContent', () => {
  const rawError = 'Unexpected token <script>alert(1)</script> at pos 3';
  const { dlg, doc } = _load({ validateImpl: () => ({ valid: false, error: rawError }) });
  dlg.open();
  doc.getElementById('fe-expr').value = 'garbage(';
  dlg._validate();
  const badge = doc.getElementById('fe-valid');
  assert.equal(badge.textContent, '⚠ ' + rawError);
  assert.match(badge.style.cssText, /background:#7D1F1F/);
  // The safety property under test: the raw error string is assigned to
  // .textContent, never .innerHTML — real DOM textContent never parses
  // markup, which is what makes an unescaped error message safe here.
  assert.equal(badge.innerHTML, '', 'error text must never be routed through innerHTML');
});

test('§5 empty/whitespace-only expression clears the badge entirely', () => {
  const { dlg, doc } = _load();
  dlg.open();
  doc.getElementById('fe-expr').value = '   ';
  dlg._validate();
  const badge = doc.getElementById('fe-valid');
  assert.equal(badge.textContent, '');
  assert.doesNotMatch(badge.style.cssText, /background:/);
});

// ── §6 — save() ────────────────────────────────────────────────────────────────

test('§6 empty name → alert("Formula name required"), DS.formulas untouched', () => {
  const { dlg, doc, alertLog } = _load();
  dlg.open('', '{a}+{b}');
  doc.getElementById('fe-name').value = '';
  doc.getElementById('fe-expr').value = '{a}+{b}';
  dlg.save();
  assert.deepEqual(alertLog, ['Formula name required']);
});

test('§6 empty expression → alert("Expression required"), DS.formulas untouched', () => {
  const { dlg, doc, alertLog } = _load();
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = '   ';
  dlg.save();
  assert.deepEqual(alertLog, ['Expression required']);
});

test('§6 valid name+expr → persisted verbatim into DS.formulas[name], DS.saveHistory() called first', () => {
  const formulas = {};
  const { dlg, doc, calls } = _load({ formulas });
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = '{a}+{b}';
  dlg.save();
  assert.equal(formulas.Formula_X, '{a}+{b}');
  assert.equal(calls.saveHistory, 1);
});

test('§6 valid save writes FIELD_TREE.formula.children[name] = {path,label,vtype:"formula"}', () => {
  const { dlg, doc, fieldTree } = _load();
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = '{a}+{b}';
  dlg.save();
  // The written value is an object literal from the vm realm — compare by
  // value, not by deepEqual (which also checks [[Prototype]] and fails
  // cross-realm even when every own-property value matches).
  const node = fieldTree.formula.children.Formula_X;
  assert.equal(node.path, 'Formula_X');
  assert.equal(node.label, 'Formula_X');
  assert.equal(node.vtype, 'formula');
});

test('§6 valid save calls FieldExplorerEngine.init() exactly once', () => {
  const { dlg, doc, calls } = _load();
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = '{a}+{b}';
  dlg.save();
  assert.equal(calls.fieldExplorerInit, 1);
});

test('§6 valid save sets #sb-msg textContent to "Formula added: <name>" and closes the dialog', () => {
  const { dlg, doc, sbMsg } = _load();
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = '{a}+{b}';
  dlg.save();
  assert.equal(sbMsg.textContent, 'Formula added: Formula_X');
  assert.equal(doc.body._children.length, 0, 'save() must close the dialog on success');
});

test('§6 syntax warning + confirm(true) → still saves', () => {
  const { dlg, doc, sbMsg } = _load({ validateImpl: () => ({ valid: false, error: 'bad syntax' }), confirmImpl: () => true });
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = 'garbage(';
  dlg.save();
  assert.equal(sbMsg.textContent, 'Formula added: Formula_X');
});

test('§6 syntax warning + confirm(false) → aborts: DS.formulas untouched, dialog stays open', () => {
  const formulas = {};
  const { dlg, doc } = _load({ formulas, validateImpl: () => ({ valid: false, error: 'bad syntax' }), confirmImpl: () => false });
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = 'garbage(';
  dlg.save();
  assert.equal(formulas.Formula_X, undefined);
  assert.equal(doc.body._children.length, 1, 'dialog must remain open when the user rejects the syntax-warning confirm()');
});

test('§6 REAL QUIRK: save() throws ReferenceError when FIELD_TREE is not declared at all', () => {
  const { dlg, doc } = _load({ includeFieldTree: false });
  dlg.open();
  doc.getElementById('fe-name').value = 'Formula_X';
  doc.getElementById('fe-expr').value = '{a}+{b}';
  // Unlike _getFields() (typeof-guarded), save()'s `if(FIELD_TREE&&...)`
  // is a direct reference — production only works because RuntimeData
  // always installs window.FIELD_TREE before any dialog can open.
  assert.throws(() => dlg.save(), /FIELD_TREE is not defined/);
});
