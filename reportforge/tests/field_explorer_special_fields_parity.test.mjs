/**
 * RF-FIELD-EXPLORER-SPECIAL-FIELDS-PARITY-1
 *
 * Crystal Reports' Field Explorer ships a fixed, alphabetically-sorted list
 * of 26 "Special Fields" (Autor del archivo ... Zona horaria del usuario de
 * CE actual). RF's engines/RuntimeData.js FIELD_TREE.special.children only
 * defined 4 of them (page_num, total_pages, print_date, report_name), two
 * with labels that didn't match CR's wording ("Nombre del informe" vs CR's
 * "Título del informe"; "Total de páginas" vs CR's "Número total de
 * páginas"), and not in CR's alphabetical order.
 *
 * This test locks in the full 26-field list, in CR's exact order and
 * wording, and guards the existing categories (DB/formula/running/group)
 * and the Parámetros category structure against regression.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
} from './runtime_harness.mjs';

// CR's Special Fields list, in CR's own alphabetical (Spanish) order — the
// reference this whole test is locking in. Source: live CR Field Explorer
// screenshots (conversation evidence), not invented.
const CR_SPECIAL_FIELDS_ORDER = [
  'Autor del archivo',
  'Comentarios de Informe',
  'Configuración regional de la selección',
  'Configuración regional del contenido',
  'Fecha de creación del archivo',
  'Fecha de impresión',
  'Fecha de los datos',
  'Fecha de modificación',
  'Fórmula de selección de grupos',
  'Fórmula de selección de registros',
  'Hora de impresión',
  'Hora de los datos',
  'Hora de modificación',
  'Id. de usuario actual de CE',
  'Nombre de usuario actual de CE',
  'Número de grupo',
  'Número de página',
  'Número de página horizontal',
  'Número de registro',
  'Número total de páginas',
  'Página N de M',
  'Ruta y nombre del archivo',
  'Título del informe',
  'Zona horaria de impresión',
  'Zona horaria de los datos',
  'Zona horaria del usuario de CE actual',
];

test('LIVE: FIELD_TREE.special has all 26 CR special fields, in CR order, with stable paths', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const special = await page.evaluate(() => window.FIELD_TREE.special);
    const labels = Object.values(special.children).map((f) => f.label);

    assert.deepEqual(labels, CR_SPECIAL_FIELDS_ORDER, 'special fields must match CR\'s exact 26-item list, in CR\'s alphabetical order');

    // Backward-compat: the 4 fields that existed before this fix keep their
    // original keys/paths so any layout JSON already referencing them
    // (e.g. {_special.page_num}) keeps resolving — only labels/order changed.
    const byPath = Object.fromEntries(Object.values(special.children).map((f) => [f.path, f]));
    assert.equal(byPath['_special.page_num']?.label, 'Número de página');
    assert.equal(byPath['_special.total_pages']?.label, 'Número total de páginas');
    assert.equal(byPath['_special.print_date']?.label, 'Fecha de impresión');
    assert.equal(byPath['_special.report_name']?.label, 'Título del informe');

    // Every special field must have a unique, resolvable path and a vtype
    // (drives the FieldExplorerEngine leaf icon) — no half-added entries.
    const paths = Object.values(special.children).map((f) => f.path);
    assert.equal(new Set(paths).size, paths.length, 'special field paths must be unique');
    for (const f of Object.values(special.children)) {
      assert.ok(f.path.startsWith('_special.'), `${f.label} must use a _special.* path`);
      assert.ok(['string', 'number', 'date'].includes(f.vtype), `${f.label} must declare a known vtype`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: special fields resolve to a non-empty mock value (window.resolveField), not silently blank', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const results = await page.evaluate(() => {
      const out = {};
      Object.values(window.FIELD_TREE.special.children).forEach((f) => {
        out[f.path] = window.resolveField(f.path, {}, null);
      });
      return out;
    });
    // report_comments / *_selection_formula are legitimately empty by
    // default — CR itself shows them blank when the report has no comments
    // or no selection formula defined. Every other special field must
    // resolve to something visible.
    const legitimatelyEmpty = new Set([
      '_special.report_comments',
      '_special.group_selection_formula',
      '_special.record_selection_formula',
    ]);
    for (const [path, value] of Object.entries(results)) {
      if (legitimatelyEmpty.has(path)) continue;
      assert.notEqual(value, '', `${path} resolved to an empty string — dragging it onto canvas would render blank`);
    }
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: Field Explorer tree renders the 26 special fields in order and expand/collapse works', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.waitForSelector('#field-tree .tree-node');

    // Find the "Campos especiales" top-level node and its label/arrow.
    const specialLabel = page.locator('#field-tree .tree-node-label', { hasText: 'Campos especiales' });
    await specialLabel.scrollIntoViewIfNeeded();

    const arrowBefore = await specialLabel.locator('.tree-arrow').textContent();
    assert.equal(arrowBefore, '▶', 'Campos especiales must start collapsed');

    await specialLabel.click();
    const arrowAfter = await specialLabel.locator('.tree-arrow').textContent();
    assert.equal(arrowAfter, '▼', 'clicking Campos especiales must expand it');

    const fieldTexts = await page.evaluate(() => {
      const label = [...document.querySelectorAll('#field-tree .tree-node-label')]
        .find((l) => l.querySelector('.tree-text')?.textContent === 'Campos especiales');
      const children = label.parentElement.querySelector('.tree-children');
      return [...children.querySelectorAll('.tree-field .tree-text')].map((el) => el.textContent);
    });
    assert.deepEqual(fieldTexts, CR_SPECIAL_FIELDS_ORDER, 'rendered special-field nodes must match CR order exactly');

    // Collapse again — round-trip.
    await specialLabel.click();
    const arrowCollapsed = await specialLabel.locator('.tree-arrow').textContent();
    assert.equal(arrowCollapsed, '▶', 'clicking again must collapse it');

    // Campos de parámetro: structure/icon/position unchanged, still expandable.
    const paramLabel = page.locator('#field-tree .tree-node-label', { hasText: 'Campos de parámetro' });
    const paramIcon = await paramLabel.locator('.tree-icon').textContent();
    assert.equal(paramIcon, '?', 'Campos de parámetro icon must be unchanged');
    const paramArrow = await paramLabel.locator('.tree-arrow').textContent();
    assert.equal(paramArrow, '', 'Campos de parámetro has no children yet — no arrow (no fabricated parameters)');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: no regression in DB / formula / running-totals / group categories', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const categories = await page.evaluate(() => Object.keys(window.FIELD_TREE));
    assert.deepEqual(categories, ['database', 'formula', 'parameter', 'running', 'group', 'special'], 'top-level category set/order must be unchanged');

    const dbChildCount = await page.evaluate(() => Object.keys(window.FIELD_TREE.database.children).length);
    assert.equal(dbChildCount, 7, 'database category children must be untouched');

    // Drag-to-insert regression guard: inserting a DB field must still work
    // exactly as before (same code path FieldExplorerEngine._insertField
    // uses for every category, including the new special fields).
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements));
    const before = await page.evaluate(() => DS.elements.length);
    await page.evaluate(() => {
      FieldExplorerEngine._insertField({ path: 'empresa.ruc', vtype: 'string' });
    });
    const after = await page.evaluate(() => DS.elements.length);
    assert.equal(after, before + 1, 'FieldExplorerEngine._insertField must still insert a DB field element');
  } finally {
    await browser.close();
    await server.stop();
  }
});
