import test from 'node:test';
import assert from 'node:assert/strict';
import {
  startRuntimeServer,
  launchRuntimePage,
  reloadRuntime,
  assertNoConsoleErrors,
} from './runtime_harness.mjs';

test('TANDA 11 — DOC-001..020', { timeout: 300000 }, async (t) => {
  const server = await startRuntimeServer();
  try {
    const { browser, page, consoleErrors } = await launchRuntimePage(server.baseUrl);
    try {
      await reloadRuntime(page, server.baseUrl);

      // ─── DOC-001 ──────────────────────────────────────────────────────
      await t.test('DOC-001 DOC_TYPES has 5 keys: factura remision nota_credito retencion liquidacion', async () => {
        const keys = await page.evaluate(() => Object.keys(DOC_TYPES).sort());
        assert.deepEqual(keys, ['factura', 'liquidacion', 'nota_credito', 'retencion', 'remision'].sort());
      });

      // ─── DOC-002 ──────────────────────────────────────────────────────
      await t.test('DOC-002 each DOC_TYPE entry has label, sriCode, color, defaultSections', async () => {
        const checks = await page.evaluate(() =>
          Object.entries(DOC_TYPES).map(([key, dt]) => ({
            key,
            hasLabel: typeof dt.label === 'string' && dt.label.length > 0,
            hasSriCode: typeof dt.sriCode === 'string' && dt.sriCode.length > 0,
            hasColor: typeof dt.color === 'string' && dt.color.startsWith('#'),
            hasSections: Array.isArray(dt.defaultSections) && dt.defaultSections.length > 0,
          }))
        );
        for (const { key, hasLabel, hasSriCode, hasColor, hasSections } of checks) {
          assert.ok(hasLabel, `DOC-002: DOC_TYPES.${key} must have non-empty label`);
          assert.ok(hasSriCode, `DOC-002: DOC_TYPES.${key} must have non-empty sriCode`);
          assert.ok(hasColor, `DOC-002: DOC_TYPES.${key} must have color starting with '#'`);
          assert.ok(hasSections, `DOC-002: DOC_TYPES.${key} must have non-empty defaultSections array`);
        }
      });

      // ─── DOC-003 ──────────────────────────────────────────────────────
      await t.test('DOC-003 DS._docType is initialized to factura on load', async () => {
        await reloadRuntime(page, server.baseUrl);
        const docType = await page.evaluate(() => DS._docType);
        assert.equal(docType, 'factura', `DOC-003: DS._docType must be 'factura' on load, got '${docType}'`);
      });

      // ─── DOC-004 ──────────────────────────────────────────────────────
      await t.test('DOC-004 factura defaultSections has stypes rh ph det pf rf in order', async () => {
        const stypes = await page.evaluate(() =>
          DOC_TYPES.factura.defaultSections.map((s) => s.stype)
        );
        assert.deepEqual(stypes, ['rh', 'ph', 'det', 'pf', 'rf'],
          `DOC-004: factura sections stypes must be [rh,ph,det,pf,rf], got [${stypes}]`);
      });

      // ─── DOC-005 ──────────────────────────────────────────────────────
      await t.test('DOC-005 detail section in DS has iterates:items', async () => {
        await reloadRuntime(page, server.baseUrl);
        const detSection = await page.evaluate(() =>
          DS.sections.find((s) => s.stype === 'det') ?? null
        );
        assert.ok(detSection, 'DOC-005: DS.sections must contain a det section');
        assert.equal(detSection.iterates, 'items',
          `DOC-005: det section must have iterates='items', got '${detSection.iterates}'`);
      });

      // ─── DOC-006 ──────────────────────────────────────────────────────
      await t.test('DOC-006 SAMPLE_DATA.items is a non-empty array', async () => {
        const itemCount = await page.evaluate(() => Array.isArray(SAMPLE_DATA.items) ? SAMPLE_DATA.items.length : -1);
        assert.ok(itemCount > 0, `DOC-006: SAMPLE_DATA.items must be a non-empty array, got length ${itemCount}`);
      });

      // ─── DOC-007 ──────────────────────────────────────────────────────
      await t.test('DOC-007 SAMPLE_DATA.empresa.razon_social is a non-empty string', async () => {
        const val = await page.evaluate(() => SAMPLE_DATA.empresa?.razon_social ?? null);
        assert.ok(typeof val === 'string' && val.length > 0,
          `DOC-007: SAMPLE_DATA.empresa.razon_social must be non-empty string, got ${JSON.stringify(val)}`);
      });

      // ─── DOC-008 ──────────────────────────────────────────────────────
      await t.test('DOC-008 resolveField empresa.razon_social returns correct value', async () => {
        const { resolved, expected } = await page.evaluate(() => ({
          resolved: resolveField('empresa.razon_social', SAMPLE_DATA),
          expected: SAMPLE_DATA.empresa.razon_social,
        }));
        assert.equal(resolved, expected,
          `DOC-008: resolveField must return "${expected}", got "${resolved}"`);
      });

      // ─── DOC-009 ──────────────────────────────────────────────────────
      await t.test('DOC-009 resolveField item.codigo with itemData returns row value', async () => {
        const { resolved, expected } = await page.evaluate(() => {
          const row = SAMPLE_DATA.items[0];
          return {
            resolved: resolveField('item.codigo', SAMPLE_DATA, row),
            expected: row.codigo,
          };
        });
        assert.equal(resolved, expected,
          `DOC-009: resolveField item.codigo must return "${expected}", got "${resolved}"`);
      });

      // ─── DOC-010 ──────────────────────────────────────────────────────
      await t.test('DOC-010 resolveField with missing path returns empty string not error', async () => {
        const result = await page.evaluate(() => resolveField('totally.missing.path', SAMPLE_DATA));
        assert.equal(result, '',
          `DOC-010: resolveField for missing path must return '', got ${JSON.stringify(result)}`);
      });

      // ─── DOC-011 ──────────────────────────────────────────────────────
      await t.test('DOC-011 resolveField with empty string path returns empty string', async () => {
        const result = await page.evaluate(() => resolveField('', SAMPLE_DATA));
        assert.equal(result, '',
          `DOC-011: resolveField('', ...) must return '', got ${JSON.stringify(result)}`);
      });

      // ─── DOC-012 ──────────────────────────────────────────────────────
      await t.test('DOC-012 formatValue currency: 1234.5 → 1,234.50', async () => {
        const result = await page.evaluate(() => formatValue(1234.5, 'currency'));
        assert.equal(result, '1,234.50',
          `DOC-012: formatValue(1234.5, 'currency') must return '1,234.50', got '${result}'`);
      });

      // ─── DOC-013 ──────────────────────────────────────────────────────
      await t.test('DOC-013 formatValue date: 2025-11-19 → 19/11/2025', async () => {
        const result = await page.evaluate(() => formatValue('2025-11-19', 'date'));
        assert.equal(result, '19/11/2025',
          `DOC-013: formatValue('2025-11-19', 'date') must return '19/11/2025', got '${result}'`);
      });

      // ─── DOC-014 ──────────────────────────────────────────────────────
      await t.test('DOC-014 formatValue ruc_mask: 13-char string gets hyphen at position 9', async () => {
        // ruc_mask: s.length===13 ? `${s.slice(0,9)}-${s.slice(9)}` : s
        const ruc = '0991234567001'; // 13 chars
        const expected = `${ruc.slice(0, 9)}-${ruc.slice(9)}`; // '099123456-7001'
        const result = await page.evaluate((r) => formatValue(r, 'ruc_mask'), ruc);
        assert.equal(result, expected,
          `DOC-014: formatValue('${ruc}', 'ruc_mask') must return '${expected}', got '${result}'`);
      });

      // ─── DOC-015 ──────────────────────────────────────────────────────
      await t.test('DOC-015 formatValue float2: 29.43789 → 29.44', async () => {
        const result = await page.evaluate(() => formatValue(29.43789, 'float2'));
        assert.equal(result, '29.44',
          `DOC-015: formatValue(29.43789, 'float2') must return '29.44', got '${result}'`);
      });

      // ─── DOC-016 ──────────────────────────────────────────────────────
      await t.test('DOC-016 formatValue datetime: ISO datetime → DD/MM/YYYY HH:MM:SS', async () => {
        const result = await page.evaluate(() => formatValue('2025-11-19T16:25:46', 'datetime'));
        assert.equal(result, '19/11/2025 16:25:46',
          `DOC-016: datetime format must return '19/11/2025 16:25:46', got '${result}'`);
      });

      // ─── DOC-017 ──────────────────────────────────────────────────────
      await t.test('DOC-017 formatValue upper: converts string to uppercase', async () => {
        const result = await page.evaluate(() => formatValue('factura', 'upper'));
        assert.equal(result, 'FACTURA',
          `DOC-017: formatValue('factura', 'upper') must return 'FACTURA', got '${result}'`);
      });

      // ─── DOC-018 ──────────────────────────────────────────────────────
      await t.test('DOC-018 FormulaEngine.eval evaluates basic arithmetic', async () => {
        const results = await page.evaluate(() => ({
          add: FormulaEngine.eval('2 + 3'),
          sub: FormulaEngine.eval('10 - 4'),
          mul: FormulaEngine.eval('3 * 4'),
          div: FormulaEngine.eval('10 / 2'),
        }));
        assert.equal(results.add, 5, `DOC-018: 2+3 must equal 5, got ${results.add}`);
        assert.equal(results.sub, 6, `DOC-018: 10-4 must equal 6, got ${results.sub}`);
        assert.equal(results.mul, 12, `DOC-018: 3*4 must equal 12, got ${results.mul}`);
        assert.equal(results.div, 5, `DOC-018: 10/2 must equal 5, got ${results.div}`);
      });

      // ─── DOC-019 ──────────────────────────────────────────────────────
      await t.test('DOC-019 FormulaEngine.eval evaluates IIf conditional expression', async () => {
        const { trueCase, falseCase } = await page.evaluate(() => ({
          trueCase: FormulaEngine.eval('IIf(1 > 0, "yes", "no")'),
          falseCase: FormulaEngine.eval('IIf(0 > 1, "yes", "no")'),
        }));
        assert.equal(trueCase, 'yes', `DOC-019: IIf(1>0,...) must return 'yes', got '${trueCase}'`);
        assert.equal(falseCase, 'no', `DOC-019: IIf(0>1,...) must return 'no', got '${falseCase}'`);
      });

      // ─── DOC-020 ──────────────────────────────────────────────────────
      await t.test('DOC-020 FormulaEngine.eval evaluates record field lookup via record context', async () => {
        // FormulaEngine.eval(src, record) — {field} syntax looks up record[field]
        const result = await page.evaluate(() =>
          FormulaEngine.eval('{cantidad} * {precio_unitario}', { cantidad: 6, precio_unitario: 0.72 })
        );
        // 6 * 0.72 = 4.32
        assert.ok(Math.abs(result - 4.32) < 0.001,
          `DOC-020: {cantidad}*{precio_unitario} must return ~4.32, got ${result}`);
      });

      await assertNoConsoleErrors(consoleErrors, 'TANDA 11 — DOC');
    } finally {
      await browser.close();
    }
  } finally {
    await server.stop();
  }
});
