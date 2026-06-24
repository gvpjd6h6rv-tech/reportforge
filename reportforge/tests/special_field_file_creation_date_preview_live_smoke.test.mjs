/**
 * RF-SPECIAL-FIELDS-PREVIEW-RENDER — reopened regression check, scoped to
 * the exact field reported by the user: "Fecha de creación del archivo"
 * (_special.file_creation_date).
 *
 * Reproduces the bug report end-to-end through the REAL user-facing path,
 * not a synthetic DS.setElements injection:
 *   1. Expand "Campos especiales" in the live Field Explorer tree.
 *   2. Find the node by its exact visible Spanish label (what the user
 *      actually sees and double-clicks/drags).
 *   3. Double-click it — this is FieldExplorerEngine._insertField(), the
 *      same code path drag-and-drop uses.
 *   4. Enter Preview, which POSTs the live layout to /designer-preview ->
 *      EnterpriseEngine -> engines/element_renderers.py element_value().
 *   5. Assert the rendered DOM node (found within its OWN section, not
 *      "last cr-el in the whole document" — sections render more than one
 *      element and picking the wrong one masks real bugs) is not an empty
 *      box, and shows the explicit "(no disponible)" gap marker since RF
 *      has no real file-creation-date backend (Crystal Reports itself
 *      shows this from file metadata RF does not have).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  enterPreview,
} from './runtime_harness.mjs';

const FIELD_LABEL = 'Fecha de creación del archivo';
const EXPECTED_PATH = '_special.file_creation_date';
const EXPECTED_TEXT = '(no disponible)';

test('LIVE: "Fecha de creación del archivo" dragged from the Field Explorer renders "(no disponible)" in Preview, not an empty box', { timeout: 60000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page } = await launchRuntimePage(server.baseUrl);
  try {
    await page.evaluate(() => {
      FieldExplorerEngine._expanded.add('special');
      FieldExplorerEngine.render();
    });
    await page.waitForTimeout(150);

    const found = await page.evaluate((label) => {
      const nodes = [...document.querySelectorAll('#field-tree .tree-field')];
      return nodes.some(n => n.querySelector('.tree-text')?.textContent.trim() === label);
    }, FIELD_LABEL);
    assert.ok(found, `Field Explorer node "${FIELD_LABEL}" not found in the rendered tree`);

    await page.evaluate((label) => {
      const nodes = [...document.querySelectorAll('#field-tree .tree-field')];
      const target = nodes.find(n => n.querySelector('.tree-text')?.textContent.trim() === label);
      target.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, FIELD_LABEL);
    await page.waitForTimeout(200);

    const inserted = await page.evaluate(() => {
      const el = DS.elements[DS.elements.length - 1];
      return { id: el.id, sectionId: el.sectionId, fieldPath: el.fieldPath };
    });
    assert.equal(inserted.fieldPath, EXPECTED_PATH,
      `Field Explorer inserted the wrong fieldPath for "${FIELD_LABEL}"`);

    await enterPreview(page);
    await page.waitForTimeout(350);

    const rendered = await page.evaluate(() => {
      // s-ph (Page Header) already has pre-existing sample-layout elements
      // before this test's insertion — it is APPENDED last (DS.elements
      // push order == render order), so the LAST node in the page-header
      // section is the one we just inserted.
      const nodes = [...document.querySelectorAll('#preview-content .preview-render-layer .cr-section[data-stype="ph"] .cr-el')];
      const last = nodes[nodes.length - 1];
      return last ? { text: last.textContent.trim(), html: last.outerHTML } : null;
    });

    assert.notEqual(rendered, null, `"${FIELD_LABEL}" produced no rendered node in Preview at all`);
    assert.notEqual(rendered.text, '', `"${FIELD_LABEL}" rendered as an EMPTY box in Preview — this is the reported bug`);
    assert.equal(rendered.text, EXPECTED_TEXT,
      `"${FIELD_LABEL}" must show the explicit "(no disponible)" gap marker (RF has no file-creation-date backend), got: ${JSON.stringify(rendered.text)}`);
  } finally {
    await browser.close();
    await server.stop();
  }
});
