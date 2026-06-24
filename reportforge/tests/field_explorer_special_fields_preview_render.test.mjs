/**
 * RF-FIELD-EXPLORER-SPECIAL-FIELDS-PARITY-1 — follow-up: the Field
 * Explorer's "Campos especiales" list parity (field_explorer_special_fields_parity.test.mjs)
 * only fixed the JS Design-canvas mock resolver (engines/RuntimeHelpers.js).
 * The REAL Preview (server-rendered via /designer-preview →
 * EnterpriseEngine → engines/element_renderers.py element_value()) never
 * recognized "_special.*" fieldPath values at all — element_value() only
 * matched _SPECIAL dict keys like "PageNumber" (the {PageNumber}-style
 * formula function name), so every _special.* field dragged from the
 * Field Explorer rendered as an empty box in Preview, even though the
 * Field Explorer list and the Design canvas mock looked complete.
 *
 * Fix: core/render/engines/advanced_engine_shared.py's _SPECIAL dict now
 * also has "_special.<key>" aliases (reusing the same ctx-backed lambdas
 * for fields with a real concept — page/record/group counters, layout
 * title — and an explicit "(no disponible)" placeholder for fields RF has
 * no backend for), and EnterpriseEngine's render pipeline
 * (enterprise_engine_layout.py build_page/build_static/build_row/
 * build_section) now threads a real per-page ctx (page_number,
 * total_pages, report_name) into render_element/element_value, instead of
 * always calling it with ctx={}.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
} from './runtime_harness.mjs';

test('LIVE: special fields dragged from the Field Explorer render real text in Preview, not an empty box', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    // Insert one element per representative special field directly via the
    // exact same path FieldExplorerEngine.dblclick/drag uses.
    const fields = [
      { path: '_special.page_num', vtype: 'number', expectNonEmpty: true },
      { path: '_special.total_pages', vtype: 'number', expectNonEmpty: true },
      { path: '_special.page_n_of_m', vtype: 'string', expectNonEmpty: true },
      { path: '_special.print_date', vtype: 'date', expectNonEmpty: true },
      { path: '_special.print_time', vtype: 'string', expectNonEmpty: true },
      { path: '_special.report_name', vtype: 'string', expectNonEmpty: true },
      { path: '_special.file_author', vtype: 'string', expectText: '(no disponible)' },
      { path: '_special.file_creation_date', vtype: 'date', expectText: '(no disponible)' },
      { path: '_special.file_path_name', vtype: 'string', expectText: '(no disponible)' },
    ];

    const ids = [];
    for (const f of fields) {
      const id = await page.evaluate(({ path, vtype }) => {
        const el = mkEl('field', 's-ph', 4, 4 + DS.elements.length * 16, 150, 14, {
          fieldPath: path, fieldFmt: null, content: path, fontSize: 8,
        });
        DS.setElements([...DS.elements, el], 'test.insertSpecial');
        return el.id;
      }, f);
      ids.push(id);
    }

    await enterPreview(page);
    await page.waitForTimeout(300);

    const renderedTexts = await page.evaluate((ids) => {
      // s-ph (Page Header) already has pre-existing sample-layout elements
      // before these test insertions — the newly inserted ones are
      // APPENDED last (DS.elements push order == render order), so take
      // the trailing N nodes, not nodes[0..N).
      const nodes = [...document.querySelectorAll('#preview-content .preview-render-layer .cr-section[data-stype="ph"] .cr-el')];
      const tail = nodes.slice(nodes.length - ids.length);
      const out = {};
      ids.forEach((id, i) => { out[id] = tail[i] ? tail[i].textContent.trim() : null; });
      return out;
    }, ids);

    fields.forEach((f, i) => {
      const id = ids[i];
      const text = renderedTexts[id];
      assert.notEqual(text, null, `${f.path}: no rendered node found in Preview at all`);
      assert.notEqual(text, '', `${f.path} rendered as an EMPTY box in Preview — this is the reported bug`);
      if (f.expectText) {
        assert.equal(text, f.expectText, `${f.path} must show the explicit gap marker, not be silently blank`);
      }
    });
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('LIVE: page_num/total_pages/report_name special fields reflect REAL per-page values from the render context, not a stale default', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    const layoutName = await page.evaluate(() => {
      const el = mkEl('field', 's-rh', 4, 60, 150, 14, {
        fieldPath: '_special.report_name', fieldFmt: null, content: '_special.report_name', fontSize: 8,
      });
      DS.setElements([...DS.elements, el], 'test.insertReportName');
      return null;
    });

    await enterPreview(page);
    await page.waitForTimeout(300);

    const text = await page.evaluate(() => {
      const nodes = document.querySelectorAll('#preview-content .preview-render-layer .cr-section[data-stype="rh"] .cr-el');
      return nodes.length ? nodes[nodes.length - 1].textContent.trim() : null;
    });
    assert.notEqual(text, null, 'report_name field not found in rendered Preview');
    assert.notEqual(text, '', 'report_name rendered empty in Preview');
    assert.ok(text.length > 0, 'report_name must reflect the real layout title, not be blank');
  } finally {
    await browser.close();
    await server.stop();
  }
});
