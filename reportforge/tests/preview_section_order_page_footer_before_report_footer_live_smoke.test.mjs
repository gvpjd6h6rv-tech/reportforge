'use strict';
/**
 * PREVIEW-SECTION-ORDER-PAGE-FOOTER-01 — live smoke.
 *
 * Primary evidence for this bug: real browser DOM order, not just HTML
 * text position. Renders the sentinel layout through the REAL Python
 * AdvancedHtmlEngine.render_preview() (subprocess, always current code),
 * loads the output in a real Chromium page, and reads the actual DOM via
 * compareDocumentPosition()/getBoundingClientRect() — never a regex on
 * the HTML source string.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function renderSentinelPreviewHtml() {
  const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(ROOT)})
from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine

layout = {
    "name": "sentinel-order-test", "pageWidth": 754, "pageHeight": 1123, "pageSize": "A4",
    "margins": {"top": 0, "right": 0, "bottom": 0, "left": 0},
    "sections": [
        {"id": "s-rh", "stype": "rh", "label": "Report Header", "height": 20},
        {"id": "s-ph", "stype": "ph", "label": "Page Header", "height": 20},
        {"id": "s-det", "stype": "det", "label": "Detail", "height": 14, "iterates": "items"},
        {"id": "s-pf", "stype": "pf", "label": "Page Footer", "height": 20, "bgColor": "#ADD8E6"},
        {"id": "s-rf", "stype": "rf", "label": "Report Footer", "height": 20, "bgColor": "#FFC0CB"},
    ],
    "elements": [
        {"id": "e-pf-text", "type": "text", "sectionId": "s-pf", "x": 0, "y": 0, "w": 200, "h": 16, "content": "PAGE_FOOTER_SENTINEL", "fontSize": 8},
        {"id": "e-rf-text", "type": "text", "sectionId": "s-rf", "x": 0, "y": 0, "w": 200, "h": 16, "content": "REPORT_FOOTER_SENTINEL", "fontSize": 8},
    ],
}
data = {"items": [{"id": 1}]}
print(AdvancedHtmlEngine(layout, data).render_preview())
`;
  return execFileSync('python3', ['-c', script], { encoding: 'utf8' });
}

test('LIVE: PAGE_FOOTER_SENTINEL DOM node comes before REPORT_FOOTER_SENTINEL DOM node in a real browser', { timeout: 30000 }, async () => {
  const html = renderSentinelPreviewHtml();
  const tmpFile = path.join(os.tmpdir(), `rf-section-order-sentinel-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
    await page.goto(`file://${tmpFile}`, { waitUntil: 'load' });

    const result = await page.evaluate(() => {
      const leafWithText = (text) =>
        [...document.querySelectorAll('*')].find(
          (el) => el.textContent.trim() === text && el.children.length === 0,
        );
      const pfNode = leafWithText('PAGE_FOOTER_SENTINEL');
      const rfNode = leafWithText('REPORT_FOOTER_SENTINEL');
      if (!pfNode || !rfNode) return { found: false };
      const cmp = pfNode.compareDocumentPosition(rfNode);
      const rfComesAfterPfInDom = !!(cmp & Node.DOCUMENT_POSITION_FOLLOWING);
      const pfTop = pfNode.getBoundingClientRect().top;
      const rfTop = rfNode.getBoundingClientRect().top;
      return { found: true, rfComesAfterPfInDom, pfVisuallyAboveRf: pfTop < rfTop };
    });

    assert.equal(result.found, true, 'both sentinel text nodes must be present in the real DOM');
    assert.equal(result.rfComesAfterPfInDom, true, 'REPORT_FOOTER_SENTINEL DOM node must come after PAGE_FOOTER_SENTINEL (real compareDocumentPosition)');
    assert.equal(result.pfVisuallyAboveRf, true, 'Page Footer must render visually above Report Footer (real getBoundingClientRect)');
  } finally {
    await browser.close();
    fs.rmSync(tmpFile, { force: true });
  }
});

test('LIVE: .cr-section DOM order for factura_a4.json has pf immediately before rf', { timeout: 30000 }, async () => {
  const script = `
import sys, json
sys.path.insert(0, ${JSON.stringify(ROOT)})
from reportforge.core.render.engines.advanced_engine import AdvancedHtmlEngine
layout = json.load(open(${JSON.stringify(path.join(ROOT, 'reportforge/layouts/factura_a4.json'))}, encoding="utf-8"))
data = {"items": [{"codigo": "C001", "descripcion": "x", "cantidad": 1, "precio_unitario": 1.0, "descuento": 0, "subtotal": 1.0}]}
print(AdvancedHtmlEngine(layout, data).render_preview())
`;
  const html = execFileSync('python3', ['-c', script], { encoding: 'utf8' });
  const tmpFile = path.join(os.tmpdir(), `rf-section-order-factura-${Date.now()}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 1300 } });
    await page.goto(`file://${tmpFile}`, { waitUntil: 'load' });
    const stypes = await page.evaluate(() =>
      [...document.querySelectorAll('.cr-section')].map((s) => s.dataset.stype),
    );
    const pfIndex = stypes.indexOf('pf');
    const rfIndex = stypes.indexOf('rf');
    assert.notEqual(pfIndex, -1);
    assert.notEqual(rfIndex, -1);
    assert.ok(pfIndex < rfIndex, `expected pf before rf in real DOM order, got: ${JSON.stringify(stypes)}`);
  } finally {
    await browser.close();
    fs.rmSync(tmpFile, { force: true });
  }
});
