import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  enterPreview,
  exitPreview,
  assertNoConsoleErrors,
} from '../runtime_harness.mjs';
import {
  collectUserParityState,
  assertDesignParity,
} from './helpers.mjs';
import { buildSmokeLayerCoverage, formatSmokeCoverageSummary } from './reporting.mjs';

// Content-edit smoke: edits text-type elements via the #prop-text-content property panel input.
//
// FIELD TYPE NOT COVERED — field elements show #prop-field-path (a data binding path),
// not a free-text content input. Editing the field path would change data binding, not
// the rendered label — a different operation outside the scope of this smoke test.
//
// Scenarios:
//   A) short text replacement
//   B) long text (100 chars)
//   C) empty string (verify model accepts '' and DS.undo() restores)
//   D) special characters
//
// For each: edit → verify model updated → check design parity → preview round-trip → DS.undo() restore.
// Uses DS.undo() (programmatic) — keyboard ctrl+z does not work after property panel edit
// because focus leaves the canvas.

const SCENARIOS = [
  { name: 'short text', value: 'SMOKE_SHORT' },
  { name: 'long text', value: 'SMOKE_LONG_' + 'X'.repeat(90) },
  { name: 'empty string', value: '' },
  { name: 'special chars', value: '!@#$%^&*()_+<>' },
];

async function editTextElement(page, id, newValue) {
  await page.locator(`.cr-element:not(.pv-el)[data-id="${id}"]`).click();
  await page.waitForTimeout(120);
  const inp = page.locator('#prop-text-content');
  await inp.click({ clickCount: 3 });
  // For empty string: typing '' does nothing after select-all; use Backspace to clear.
  if (newValue === '') {
    await page.keyboard.press('Backspace');
  } else {
    await page.keyboard.type(newValue);
  }
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
}

test('USER-PARITY content-edit smoke: text type elements, undo restore, preview parity', { timeout: 240000 }, async (t) => {
  const server = await startRuntimeServer();

  try {
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
    try {
      await reloadRuntime(page, server.baseUrl);

      // Find a text-type element to use for all scenarios
      const textEl = await page.evaluate(() => {
        const el = DS.elements.find((e) => e.type === 'text');
        return el ? { id: el.id, type: el.type, originalContent: el.content || '' } : null;
      });
      assert.ok(textEl, 'content edit smoke: no text-type element found in template');
      t.diagnostic(`using text element id=${textEl.id} originalContent="${textEl.originalContent}"`);

      // Verify #prop-text-content is present for text elements
      await page.locator(`.cr-element:not(.pv-el)[data-id="${textEl.id}"]`).click();
      await page.waitForTimeout(120);
      const inputExists = await page.evaluate(() => !!document.querySelector('#prop-text-content'));
      assert.ok(inputExists, 'content edit smoke: #prop-text-content must exist for text-type element');

      for (const scenario of SCENARIOS) {
        await t.test(scenario.name, async (t) => {
          // Reset to a known state: undo back to original content
          await reloadRuntime(page, server.baseUrl);

          const originalContent = await page.evaluate((id) => {
            const el = DS.elements.find((e) => e.id === id);
            return el?.content ?? null;
          }, textEl.id);
          t.diagnostic(`before edit: content="${originalContent}"`);

          await editTextElement(page, textEl.id, scenario.value);

          const afterEdit = await page.evaluate((id) => {
            const el = DS.elements.find((e) => e.id === id);
            return { content: el?.content ?? null, historyIndex: DS.historyIndex ?? -1 };
          }, textEl.id);
          t.diagnostic(`after edit: content="${afterEdit.content}" historyIndex=${afterEdit.historyIndex}`);
          assert.equal(afterEdit.content, scenario.value, `${scenario.name}: model must reflect edited content`);

          // Design parity: edited element exists in DOM
          const designState = await collectUserParityState(page);
          assertDesignParity(designState, `${scenario.name} design parity`);

          // Preview round-trip: model count must not change during round-trip.
          // Full preview parity (exact ID match) is not used here because section elements
          // are repeated per data row in preview, producing duplicate IDs that break deepEqual.
          const modelCountBeforePreview = designState.modelIds.length;
          await enterPreview(page);
          const inPreviewState = await collectUserParityState(page);
          assert.equal(
            inPreviewState.modelIds.length,
            modelCountBeforePreview,
            `${scenario.name}: model count must not change in preview (before=${modelCountBeforePreview} in-preview=${inPreviewState.modelIds.length})`,
          );
          t.diagnostic(`in-preview: modelCount=${inPreviewState.modelIds.length} previewIds=${inPreviewState.previewIds.length}`);
          await exitPreview(page);

          // Undo restore via programmatic call (focus was on property panel, not canvas)
          await page.evaluate(() => DS.undo());
          await page.waitForTimeout(200);

          const afterUndo = await page.evaluate((id) => {
            const el = DS.elements.find((e) => e.id === id);
            return el?.content ?? null;
          }, textEl.id);
          t.diagnostic(`after undo: content="${afterUndo}"`);
          assert.equal(afterUndo, originalContent, `${scenario.name}: undo must restore original content`);
        });
      }

      // Coverage accounting
      t.diagnostic(formatSmokeCoverageSummary(buildSmokeLayerCoverage([
        { category: 'content_edit_short', exercised: 1, total: 1 },
        { category: 'content_edit_long', exercised: 1, total: 1 },
        { category: 'content_edit_empty', exercised: 1, total: 1 },
        { category: 'content_edit_special_chars', exercised: 1, total: 1 },
        {
          category: 'content_edit_field_type',
          exercised: 0,
          total: 1,
          notCoveredNotes: ['field elements show #prop-field-path (data binding), not free-text content'],
        },
      ])));

      await assertNoConsoleErrors(consoleErrors, 'USER-PARITY content-edit smoke');
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
});
