'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadFontStack() {
  const src = fs.readFileSync(resolve(ROOT, 'engines/FontStack.js'), 'utf8');
  const ctx = { window: {}, globalThis: {}, module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx.window.FontStack;
}

test('FontStack — resolves Arial to the Linux-safe sans stack, no Arial token in the output', () => {
  const F = loadFontStack();
  const css = F.resolveCssFontFamily('Arial');
  assert.match(css, /Liberation Sans/);
  assert.match(css, /DejaVu Sans/);
  assert.match(css, /Noto Sans/);
  assert.match(css, /sans-serif/);
  assert.doesNotMatch(css, /Arial/);
});

test('FontStack — resolves Helvetica the same way as Arial', () => {
  const F = loadFontStack();
  assert.equal(F.resolveCssFontFamily('Helvetica'), F.resolveCssFontFamily('Arial'));
});

test('FontStack — case-insensitive and trims whitespace', () => {
  const F = loadFontStack();
  assert.equal(F.resolveCssFontFamily('  ARIAL  '), F.resolveCssFontFamily('Arial'));
  assert.equal(F.resolveCssFontFamily('arial'), F.resolveCssFontFamily('Arial'));
});

test('FontStack — empty/undefined/null falls back to the Linux-safe sans stack', () => {
  const F = loadFontStack();
  assert.equal(F.resolveCssFontFamily(''), F.LINUX_SAFE_SANS_STACK);
  assert.equal(F.resolveCssFontFamily(undefined), F.LINUX_SAFE_SANS_STACK);
  assert.equal(F.resolveCssFontFamily(null), F.LINUX_SAFE_SANS_STACK);
});

test('FontStack — non-Arial fonts pass through unchanged (explicit user choice, out of scope)', () => {
  const F = loadFontStack();
  assert.equal(F.resolveCssFontFamily('Tahoma'), 'Tahoma');
  assert.equal(F.resolveCssFontFamily('Courier New'), 'Courier New');
  assert.equal(F.resolveCssFontFamily('Times New Roman'), 'Times New Roman');
});

test('FontStack — resolved stack uses single quotes, never double quotes (consumers interpolate this into double-quoted HTML attributes)', () => {
  const F = loadFontStack();
  const css = F.resolveCssFontFamily('Arial');
  assert.doesNotMatch(css, /"/, 'a double quote here would prematurely close style="..." and corrupt every declaration after font-family');
  assert.match(css, /'Liberation Sans'/);
});
