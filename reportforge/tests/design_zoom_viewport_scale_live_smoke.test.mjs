/**
 * LIVE SMOKE — Design-mode #viewport scale (white strip below 100% zoom)
 *
 * Corre contra la app REAL (sin mocks). Reproduce el bug manual: en modo
 * diseño, a un zoom < 100% (ej. 91%), aparece una franja blanca a la
 * derecha/abajo del canvas.
 *
 * Root cause confirmado con evidencia directa (no hipótesis): DesignZoomEngine
 * ._apply() fijaba #viewport.style.width = PAGE_W*z Y ADEMÁS aplicaba
 * transform:scale(z) — el mismo factor z aplicado dos veces. El ancho
 * renderizado real (getBoundingClientRect) terminaba en PAGE_W*z*z en vez
 * de PAGE_W*z, dejando un remanente sin pintar (la franja blanca) dentro del
 * espacio de layout reservado para el viewport sin escalar.
 *
 * Contrato: a cualquier zoom, el #viewport renderizado debe medir
 * exactamente PAGE_W*z (con tolerancia subpíxel), nunca PAGE_W*z*z.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  setZoom,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

async function measureViewport(page) {
  return page.evaluate(() => {
    const vp = document.getElementById('viewport');
    const rect = vp.getBoundingClientRect();
    return {
      zoom: DS.zoom,
      pageW: CFG.PAGE_W,
      styleWidth: vp.style.width,
      transform: vp.style.transform,
      renderedWidth: rect.width,
      renderedHeight: rect.height,
    };
  });
}

test('LIVE: design-mode #viewport renders at single scale (PAGE_W*z), not double scale (PAGE_W*z*z)', { timeout: 120000 }, async () => {
  const server = await startRuntimeServer();
  const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);

  try {
    await page.waitForFunction(() => typeof DS !== 'undefined' && Array.isArray(DS.elements) && DS.elements.length > 0);
    await page.waitForTimeout(800);

    for (const zoom of [0.91, 0.5, 0.75, 1, 1.5, 2]) {
      await setZoom(page, zoom);
      const m = await measureViewport(page);
      assert.equal(m.zoom, zoom, `DS.zoom must reflect the requested ${zoom}`);

      const singleScale = m.pageW * zoom;
      const doubleScale = m.pageW * zoom * zoom;
      const drift = Math.abs(m.renderedWidth - singleScale);

      assert.ok(
        drift < 1,
        `zoom=${zoom}: #viewport renderedWidth must be ≈PAGE_W*z (${singleScale.toFixed(2)}px), ` +
        `got ${m.renderedWidth.toFixed(2)}px (drift ${drift.toFixed(2)}px). ` +
        `For reference, the double-scale regression value would be ${doubleScale.toFixed(2)}px.`
      );

      // Adversarial: explicitly assert we are NOT hitting the double-scale
      // value, even by coincidence at a zoom where the two could be close.
      if (Math.abs(singleScale - doubleScale) > 1) {
        assert.ok(
          Math.abs(m.renderedWidth - doubleScale) > 1,
          `zoom=${zoom}: renderedWidth must not match the double-scale regression value (${doubleScale.toFixed(2)}px)`
        );
      }
    }

    await assertNoConsoleErrors(consoleErrors, 'design zoom viewport scale live smoke');
  } finally {
    await browser.close();
    await server.stop();
  }
});
