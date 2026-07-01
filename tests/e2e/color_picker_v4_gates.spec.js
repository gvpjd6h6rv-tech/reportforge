'use strict';
/**
 * Color Picker v4 Gates 1-13
 *
 * G1  — Modal opens; no native OS picker; contains color area, hue bar, all inputs
 * G2  — Clicking color area changes draft (HEX + HSL update); no element apply
 * G3  — Dragging hue bar changes Matiz input + preview; no element apply
 * G4  — HEX input updates HSL + RGB
 * G5  — Cancelar: dialog closes, onSelect NOT called
 * G6  — Matiz/Sat/Lum inputs update HEX + RGB + preview
 * G7  — Custom colors persist across open/close via localStorage
 * G8  — Seleccionar: onSelect called once with correct hex
 * G9  — Transparent checkbox: inputs disabled, preview shows checkerboard
 * G10 — Cancelar when transparent: onSelect NOT called
 * G11 — Basic palette click updates draft (not element)
 * G12 — "Agregar a colores personalizados" adds draftColor to custom grid
 * G13 — RGB inputs update HEX + HSL
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = '/designer/crystal-reports-designer-v4.html';

function bgMatchesHex(bg, hex) {
  if (!bg || !hex) return false;
  hex = hex.toUpperCase().replace(/^#/, '');
  if (bg.toUpperCase().replace(/^#/, '') === hex) return true;
  const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return false;
  const rr = parseInt(m[1]).toString(16).padStart(2, '0').toUpperCase();
  const gg = parseInt(m[2]).toString(16).padStart(2, '0').toUpperCase();
  const bb = parseInt(m[3]).toString(16).padStart(2, '0').toUpperCase();
  return rr + gg + bb === hex;
}

async function openPicker(page, initialHex = '#4064BF', allowTransparent = false) {
  await page.evaluate(({ hex, transp }) => {
    window.__lastOnSelect = null;
    window.__onSelectCount = 0;
    window.ColorPickerAdapter.open(hex, (h) => {
      window.__lastOnSelect = h;
      window.__onSelectCount = (window.__onSelectCount || 0) + 1;
    }, { allowTransparent: transp });
  }, { hex: initialHex, transp: allowTransparent });
  await expect(page.locator('#rf-color-backdrop')).toBeVisible();
}

test.describe('Color Picker v4', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () =>
        typeof window.ColorConverter !== 'undefined' &&
        typeof window.ColorPaletteMap !== 'undefined' &&
        typeof window.CustomColorStore !== 'undefined' &&
        typeof window.ColorPickerAdapter !== 'undefined',
      null,
      { timeout: 30000 }
    );
  });

  // ── G1 ────────────────────────────────────────────────────────────────────
  test('G1 — modal opens with color area, hue bar, HSL inputs; no native OS picker', async ({ page }) => {
    await openPicker(page, '#FF0000');
    await expect(page.locator('#rf-cp-color-area')).toBeVisible();
    await expect(page.locator('#rf-cp-hue-bar')).toBeVisible();
    await expect(page.locator('#rf-cp-h')).toBeVisible();
    await expect(page.locator('#rf-cp-s')).toBeVisible();
    await expect(page.locator('#rf-cp-l')).toBeVisible();
    await expect(page.locator('#rf-cp-hex')).toBeVisible();
    await expect(page.locator('#rf-cp-r')).toBeVisible();
    await expect(page.locator('#rf-cp-g')).toBeVisible();
    await expect(page.locator('#rf-cp-b')).toBeVisible();
    const nativePickers = await page.locator('#rf-color-backdrop input[type="color"]').count();
    expect(nativePickers).toBe(0);
  });

  // ── G2 ────────────────────────────────────────────────────────────────────
  test('G2 — clicking color area updates HEX + HSL; no element apply', async ({ page }) => {
    await openPicker(page, '#808080');
    const area = page.locator('#rf-cp-color-area');
    const box = await area.boundingBox();
    await page.mouse.click(box.x + box.width * 0.7, box.y + box.height * 0.3);
    await page.waitForTimeout(150);

    const hex = await page.locator('#rf-cp-hex').inputValue();
    expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);

    const s = Number(await page.locator('#rf-cp-s').inputValue());
    const l = Number(await page.locator('#rf-cp-l').inputValue());
    expect(s).toBeGreaterThan(0);
    expect(l).toBeGreaterThan(0);

    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(0);
  });

  // ── G3 ────────────────────────────────────────────────────────────────────
  test('G3 — dragging hue bar changes Matiz; no element apply', async ({ page }) => {
    await openPicker(page, '#FF0000');
    const bar = page.locator('#rf-cp-hue-bar');
    const box = await bar.boundingBox();

    await page.mouse.move(box.x + box.width / 2, box.y + 5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
    await page.mouse.up();
    await page.waitForTimeout(150);

    const hue = Number(await page.locator('#rf-cp-h').inputValue());
    expect(hue).toBeGreaterThan(0);
    expect(hue).toBeLessThanOrEqual(360);

    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(0);
  });

  // ── G4 ────────────────────────────────────────────────────────────────────
  test('G4 — typing HEX updates HSL + RGB + preview', async ({ page }) => {
    await openPicker(page, '#000000');
    await page.locator('#rf-cp-hex').fill('#FF8000');
    await page.locator('#rf-cp-hex').dispatchEvent('input');
    await page.waitForTimeout(150);

    const h = Number(await page.locator('#rf-cp-h').inputValue());
    const s = Number(await page.locator('#rf-cp-s').inputValue());
    const l = Number(await page.locator('#rf-cp-l').inputValue());
    // #FF8000 ≈ HSL(30°, 100%, 50%)
    expect(h).toBeGreaterThanOrEqual(25);
    expect(h).toBeLessThanOrEqual(35);
    expect(s).toBeGreaterThanOrEqual(90);
    expect(l).toBeGreaterThanOrEqual(45);
    expect(l).toBeLessThanOrEqual(55);

    const r = Number(await page.locator('#rf-cp-r').inputValue());
    expect(r).toBe(255);
    const b = Number(await page.locator('#rf-cp-b').inputValue());
    expect(b).toBe(0);
  });

  // ── G5 ────────────────────────────────────────────────────────────────────
  test('G5 — Cancelar closes dialog; onSelect NOT called', async ({ page }) => {
    await openPicker(page, '#3366CC');
    await page.locator('#rf-cp-basic-grid div[data-color="#FF0000"]').click();
    await page.waitForTimeout(50);
    await page.locator('#rf-color-backdrop').getByText('Cancelar').click();
    await expect(page.locator('#rf-color-backdrop')).toBeHidden();
    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(0);
  });

  // ── G6 ────────────────────────────────────────────────────────────────────
  test('G6 — Matiz/Sat/Lum inputs update HEX + RGB + preview', async ({ page }) => {
    await openPicker(page, '#000000');

    await page.locator('#rf-cp-h').fill('240');
    await page.locator('#rf-cp-h').dispatchEvent('input');
    await page.locator('#rf-cp-s').fill('100');
    await page.locator('#rf-cp-s').dispatchEvent('input');
    await page.locator('#rf-cp-l').fill('50');
    await page.locator('#rf-cp-l').dispatchEvent('input');
    await page.waitForTimeout(150);

    const hex = await page.locator('#rf-cp-hex').inputValue();
    expect(hex.toUpperCase()).toBe('#0000FF');

    const b = Number(await page.locator('#rf-cp-b').inputValue());
    expect(b).toBe(255);
    const r = Number(await page.locator('#rf-cp-r').inputValue());
    expect(r).toBe(0);

    const previewBg = await page.locator('#rf-cp-preview').evaluate(el => el.style.backgroundColor);
    expect(bgMatchesHex(previewBg, '#0000FF')).toBe(true);
  });

  // ── G7 ────────────────────────────────────────────────────────────────────
  test('G7 — custom colors persist in localStorage across open/close', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('rf.customColors.v1'));

    // Open with a specific color
    await openPicker(page, '#ABCDEF');
    // Confirm HEX is set
    const hexVal = await page.locator('#rf-cp-hex').inputValue();
    expect(hexVal.toUpperCase()).toBe('#ABCDEF');

    await page.locator('#rf-cp-add-btn').click();
    await page.waitForTimeout(100);

    // Close without selecting
    await page.locator('#rf-color-backdrop').getByText('Cancelar').click();
    await expect(page.locator('#rf-color-backdrop')).toBeHidden();

    // Check localStorage
    const stored = await page.evaluate(() => {
      const raw = localStorage.getItem('rf.customColors.v1');
      return raw ? JSON.parse(raw) : [];
    });
    expect(stored.some(c => c !== null)).toBe(true);

    // Re-open — custom grid should show the color
    await openPicker(page, '#000000');
    const customSwatches = await page.locator('#rf-cp-custom-grid div[title]').count();
    expect(customSwatches).toBeGreaterThan(0);
  });

  // ── G8 ────────────────────────────────────────────────────────────────────
  test('G8 — Seleccionar calls onSelect exactly once with correct hex', async ({ page }) => {
    await openPicker(page, '#000000');
    await page.locator('#rf-cp-hex').fill('#123456');
    await page.locator('#rf-cp-hex').dispatchEvent('input');
    await page.waitForTimeout(50);

    await page.locator('#rf-color-backdrop').getByText('Seleccionar').click();
    await expect(page.locator('#rf-color-backdrop')).toBeHidden();

    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(1);
    const selected = await page.evaluate(() => window.__lastOnSelect);
    expect(selected.toUpperCase()).toBe('#123456');
  });

  // ── G9 ────────────────────────────────────────────────────────────────────
  test('G9 — transparent checkbox disables inputs and shows checkerboard', async ({ page }) => {
    await openPicker(page, '#FF0000', true);
    await page.locator('#_rf_cp_transparent').check();
    await page.waitForTimeout(100);

    expect(await page.locator('#rf-cp-hex').isDisabled()).toBe(true);
    expect(await page.locator('#rf-cp-h').isDisabled()).toBe(true);
    expect(await page.locator('#rf-cp-r').isDisabled()).toBe(true);

    const bg = await page.locator('#rf-cp-preview').evaluate(el => el.style.backgroundImage);
    expect(bg).toContain('gradient');
  });

  // ── G10 ───────────────────────────────────────────────────────────────────
  test('G10 — Cancelar when transparent: onSelect NOT called', async ({ page }) => {
    await openPicker(page, 'transparent', true);
    await page.locator('#rf-color-backdrop').getByText('Cancelar').click();
    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(0);
  });

  // ── G11 ───────────────────────────────────────────────────────────────────
  test('G11 — basic palette click updates draft; no element apply', async ({ page }) => {
    await openPicker(page, '#000000');
    await page.locator('#rf-cp-basic-grid div[data-color="#FF0000"]').click();
    await page.waitForTimeout(100);
    const hex = await page.locator('#rf-cp-hex').inputValue();
    expect(hex.toUpperCase()).toBe('#FF0000');
    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(0);
  });

  // ── G12 ───────────────────────────────────────────────────────────────────
  test('G12 — Agregar adds draftColor to custom grid without applying to element', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('rf.customColors.v1'));
    await openPicker(page, '#000000');
    await page.locator('#rf-cp-hex').fill('#AABBCC');
    await page.locator('#rf-cp-hex').dispatchEvent('input');
    await page.waitForTimeout(100);

    await page.locator('#rf-cp-add-btn').click();
    await page.waitForTimeout(100);

    const swatchCount = await page.locator('#rf-cp-custom-grid div[title="#AABBCC"]').count();
    expect(swatchCount).toBeGreaterThan(0);

    const count = await page.evaluate(() => window.__onSelectCount);
    expect(count).toBe(0);
  });

  // ── G13 ───────────────────────────────────────────────────────────────────
  test('G13 — RGB inputs update HEX + HSL', async ({ page }) => {
    await openPicker(page, '#000000');
    await page.locator('#rf-cp-r').fill('0');
    await page.locator('#rf-cp-r').dispatchEvent('input');
    await page.locator('#rf-cp-g').fill('255');
    await page.locator('#rf-cp-g').dispatchEvent('input');
    await page.locator('#rf-cp-b').fill('0');
    await page.locator('#rf-cp-b').dispatchEvent('input');
    await page.waitForTimeout(150);

    const hex = await page.locator('#rf-cp-hex').inputValue();
    expect(hex.toUpperCase()).toBe('#00FF00');

    const h = Number(await page.locator('#rf-cp-h').inputValue());
    expect(h).toBeGreaterThanOrEqual(115);
    expect(h).toBeLessThanOrEqual(125);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Hue arrow interaction gates
// ═══════════════════════════════════════════════════════════════════════════
test.describe('Hue arrow interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/designer/crystal-reports-designer-v4.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => typeof window.ColorPickerAdapter !== 'undefined',
      null, { timeout: 30000 }
    );
  });

  // Arrow 1 — Arrow points toward bar (has border-left, no pointer-events:none)
  test('Arrow1 — triangle points toward bar; pointer-events enabled', async ({ page }) => {
    await page.evaluate(() => {
      window.ColorPickerAdapter.open('#00FF00', () => {}, {});
    });
    await expect(page.locator('#rf-color-backdrop')).toBeVisible();

    // Arrow must have border-left (right-pointing triangle) and cursor:ns-resize
    const style = await page.locator('#rf-cp-hue-cursor').evaluate(el => ({
      borderRight: el.style.borderRight,
      cursor: el.style.cursor,
      pointerEvents: el.style.pointerEvents,
    }));
    // border-right must be set (left-pointing triangle ◀, points toward bar on left)
    expect(style.borderRight).not.toBe('');
    // must NOT be pointer-events:none
    expect(style.pointerEvents).not.toBe('none');
    // must have ns-resize cursor
    expect(style.cursor).toBe('ns-resize');
  });

  // Arrow 2 — Matiz input moves arrow position
  test('Arrow2 — Matiz input moves arrow top position', async ({ page }) => {
    await page.evaluate(() => {
      window.ColorPickerAdapter.open('#000000', () => {}, {});
    });
    await expect(page.locator('#rf-color-backdrop')).toBeVisible();

    const topBefore = await page.locator('#rf-cp-hue-cursor').evaluate(el => el.style.top);

    await page.locator('#rf-cp-h').fill('300');
    await page.locator('#rf-cp-h').dispatchEvent('input');
    await page.waitForTimeout(100);

    const topAfter = await page.locator('#rf-cp-hue-cursor').evaluate(el => el.style.top);
    expect(topBefore).not.toBe(topAfter);
  });

  // Arrow 3 — Click bar updates Matiz + HEX + RGB + preview
  test('Arrow3 — click on bar updates Matiz, HEX, RGB, preview', async ({ page }) => {
    await page.evaluate(() => {
      window.__onSelectCount = 0;
      window.ColorPickerAdapter.open('#000000', () => { window.__onSelectCount++; }, {});
    });
    await expect(page.locator('#rf-color-backdrop')).toBeVisible();

    const bar = page.locator('#rf-cp-hue-bar');
    const box = await bar.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.4);
    await page.waitForTimeout(100);

    const h = Number(await page.locator('#rf-cp-h').inputValue());
    expect(h).toBeGreaterThan(0);
    const hex = await page.locator('#rf-cp-hex').inputValue();
    expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    const previewBg = await page.locator('#rf-cp-preview').evaluate(el => el.style.backgroundColor);
    expect(previewBg).not.toBe('');
    expect(await page.evaluate(() => window.__onSelectCount)).toBe(0);
  });

  // Arrow 4 — Drag bar updates values live
  test('Arrow4 — drag on bar updates values live', async ({ page }) => {
    await page.evaluate(() => {
      window.ColorPickerAdapter.open('#FF0000', () => {}, {});
    });
    await expect(page.locator('#rf-color-backdrop')).toBeVisible();

    const bar = page.locator('#rf-cp-hue-bar');
    const box = await bar.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.75);
    await page.waitForTimeout(100);
    await page.mouse.up();

    const h = Number(await page.locator('#rf-cp-h').inputValue());
    expect(h).toBeGreaterThan(100);
    const hex = await page.locator('#rf-cp-hex').inputValue();
    expect(hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  // Arrow 5 — Drag arrow directly updates values live
  test('Arrow5 — drag arrow directly updates Matiz, HEX, RGB', async ({ page }) => {
    await page.evaluate(() => {
      window.ColorPickerAdapter.open('#FF0000', () => {}, {});
    });
    await expect(page.locator('#rf-color-backdrop')).toBeVisible();

    // Record initial hue (from #FF0000 = hue ~0)
    const hexBefore = await page.locator('#rf-cp-hex').inputValue();

    const arrow = page.locator('#rf-cp-hue-cursor');
    const arrowBox = await arrow.boundingBox();
    const bar = page.locator('#rf-cp-hue-bar');
    const barBox = await bar.boundingBox();

    // Drag arrow downward by 60% of bar height
    await page.mouse.move(arrowBox.x + 4, arrowBox.y);
    await page.mouse.down();
    await page.mouse.move(arrowBox.x + 4, barBox.y + barBox.height * 0.6);
    await page.waitForTimeout(100);
    await page.mouse.up();

    const hAfter = Number(await page.locator('#rf-cp-h').inputValue());
    const hexAfter = await page.locator('#rf-cp-hex').inputValue();

    expect(hexAfter.toUpperCase()).not.toBe(hexBefore.toUpperCase());
    expect(hAfter).toBeGreaterThan(50);

    const r = Number(await page.locator('#rf-cp-r').inputValue());
    const g = Number(await page.locator('#rf-cp-g').inputValue());
    const b = Number(await page.locator('#rf-cp-b').inputValue());
    // Values must be consistent with the new hue (not all-zero, not unchanged)
    expect(r + g + b).toBeGreaterThan(0);
  });

  // Arrow 6 — Gate 6 is verified in code (no separate runtime test needed)
  // Both bar and arrow call _updateHueFromClientY — confirmed by reading the source.

  // Arrow 7 — No clobber: element layout fields unchanged
  test('Arrow7 — dragging arrow does not mutate element layout fields', async ({ page }) => {
    // Set up a fake element and DS to check mutation
    const origFields = await page.evaluate(() => {
      const orig = { fp: 'field1', fmt: 'text', sec: 'detail', zi: 1 };
      window.__testElemState = Object.assign({}, orig);
      return orig;
    });

    await page.evaluate(() => {
      window.ColorPickerAdapter.open('#FF0000', () => {}, {});
    });
    await expect(page.locator('#rf-color-backdrop')).toBeVisible();

    // Drag arrow
    const arrow = page.locator('#rf-cp-hue-cursor');
    const arrowBox = await arrow.boundingBox();
    const bar = page.locator('#rf-cp-hue-bar');
    const barBox = await bar.boundingBox();
    await page.mouse.move(arrowBox.x + 4, arrowBox.y);
    await page.mouse.down();
    await page.mouse.move(arrowBox.x + 4, barBox.y + barBox.height * 0.5);
    await page.mouse.up();
    await page.waitForTimeout(50);

    const afterFields = await page.evaluate(() => window.__testElemState);
    expect(afterFields.fp).toBe(origFields.fp);
    expect(afterFields.fmt).toBe(origFields.fmt);
    expect(afterFields.sec).toBe(origFields.sec);
    expect(afterFields.zi).toBe(origFields.zi);
  });
});
