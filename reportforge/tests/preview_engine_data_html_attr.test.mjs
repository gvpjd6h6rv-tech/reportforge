'use strict';
/**
 * Pins a real bug found while auditing the FontStack change: the resolved
 * Linux-safe font stack was double-quoted ('"Liberation Sans", ...'), and
 * PreviewEngineData.js interpolates font-family straight into a
 * double-quoted HTML style="..." attribute. The embedded double quotes
 * prematurely closed that attribute, silently truncating every declaration
 * after font-family (font-weight, font-size, text-align, color, ...) —
 * confirmed live: a bold element rendered as fontWeight 400 in preview.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function loadPreviewEngineData() {
  const ctx = {
    window: {}, globalThis: undefined, module: { exports: {} },
    DS: { _sampleData: {} }, SAMPLE_DATA: {},
    resolveField: undefined, formatValue: undefined, FORMATS: undefined,
  };
  ctx.globalThis = ctx.window;
  vm.createContext(ctx);

  const contractsSrc = fs.readFileSync(resolve(ROOT, 'engines/PreviewEngineContracts.js'), 'utf8');
  vm.runInContext(contractsSrc, ctx);
  const fontStackSrc = fs.readFileSync(resolve(ROOT, 'engines/FontStack.js'), 'utf8');
  vm.runInContext(fontStackSrc, ctx);
  const dataSrc = fs.readFileSync(resolve(ROOT, 'engines/PreviewEngineData.js'), 'utf8');
  vm.runInContext(dataSrc, ctx);

  return ctx.window.PreviewEngineData;
}

function makeEl(overrides = {}) {
  return {
    id: 'e1', type: 'text', sectionId: 's1', x: 0, y: 0, w: 100, h: 20,
    fontSize: 10, bold: false, italic: false, underline: false,
    align: 'left', color: '#000', bgColor: 'transparent',
    borderWidth: 0, borderStyle: 'solid', borderColor: '#000',
    content: 'hello',
    ...overrides,
  };
}

test('PreviewEngineData.renderElement — default (Arial) font-family does not corrupt the style attribute: font-weight survives', () => {
  const P = loadPreviewEngineData();
  const html = P.renderElement(makeEl({ bold: true }));

  const styleMatch = html.match(/style="([^"]*)"/);
  assert.ok(styleMatch, `style attribute must be a single, well-formed double-quoted string. Got: ${html}`);
  assert.match(styleMatch[1], /font-weight:bold/, `font-weight must survive inside the style attribute. Got: ${html}`);
  assert.match(styleMatch[1], /font-family:/, `font-family must be present. Got: ${html}`);
});

test('PreviewEngineData.renderElement — resolved font-family value contains no double quotes (would break the surrounding HTML attribute)', () => {
  const P = loadPreviewEngineData();
  const html = P.renderElement(makeEl());
  const fontFamilyMatch = html.match(/font-family:([^;"]*)/);
  assert.ok(fontFamilyMatch, `font-family declaration must be present. Got: ${html}`);
  assert.doesNotMatch(fontFamilyMatch[1], /"/, `font-family value must not contain double quotes. Got: ${html}`);
});
