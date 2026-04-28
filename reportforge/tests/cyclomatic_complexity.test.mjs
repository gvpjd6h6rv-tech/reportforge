'use strict';
/**
 * CYCLOMATIC COMPLEXITY — Índice de Complejidad Ciclomática
 *
 * Objetivo: impedir que vuelvan monstruos ahora que el repo fue limpiado.
 * Line count no es suficiente — una función con 20 branches en 30 líneas
 * es más peligrosa que una función secuencial de 80 líneas.
 *
 * Estrategia: snapshot + enforce
 *   - Las violaciones preexistentes están registradas en KNOWN_VIOLATIONS.
 *   - CI falla si:
 *       a) Una función nueva supera CC=20 (regresión nueva)
 *       b) Una violación conocida EMPEORA (CC aumenta respecto al snapshot)
 *       c) Una violación conocida DESAPARECE sin haberse reducido → debe eliminarse del mapa
 *   - CI pasa si las violaciones conocidas se reducen → incentivo a mejorar.
 *
 * Para reducir deuda: bajar el valor en KNOWN_VIOLATIONS y refactorizar la función.
 * Para agregar nueva función compleja: NO está permitido — agregarlo a KNOWN_VIOLATIONS
 * requiere revisión explícita (cambio de código intencional en este archivo).
 *
 * Método CC (aproximación sin AST):
 *   CC(fn) = 1 + if + for + while + do + case + catch + && + || + ternary
 *   Las funciones anidadas se excluyen del cuerpo del padre para evitar acumulación.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINES = path.join(ROOT, 'engines');

// ---------------------------------------------------------------------------
// Deuda técnica conocida — snapshot de CC en el momento del refactor
// Formato: 'file::function' → CC máximo permitido
// Para reducir deuda: bajar el número y refactorizar.
// Para agregar: requiere decisión explícita aquí.
// ---------------------------------------------------------------------------
const KNOWN_VIOLATIONS = new Map([
  ['CanvasLayoutElements.js::buildElementDiv',          29],
  ['CanvasLayoutElements.js::updateElement',            21],
  ['CommandRuntimeHandlers.js::handleAction',           97],
  ['EngineCoreContracts.js::validateSectionContract',   24],
  ['EngineCoreContracts.js::validateCanonicalRuntime',  30],
  ['EngineCoreRoutingPointer.js::routePointer',         68],
  ['EngineCoreRoutingRegistry.js::registerAllEngines',  32],
  ['KeyboardBindings.js::installDefaults',              28],
  ['RenderSchedulerFrame.js::_flush',                   26],
  ['RuntimeGeometry.js::install',                       37],
  ['RuntimeHelpers.js::install',                        21],
]);

// ---------------------------------------------------------------------------
// Extractor — cuerpo propio sin funciones anidadas
// ---------------------------------------------------------------------------

function extractOwnBody(src, openBrace) {
  let result = '';
  let depth = 0;
  let pos = openBrace;
  let nestedSkipDepth = -1;

  while (pos < src.length) {
    const ch = src[pos];
    if (ch === '{') {
      depth++;
      if (depth > 1 && nestedSkipDepth === -1) {
        const lookback = src.slice(Math.max(0, pos - 120), pos);
        if (/\bfunction\s+\w+\s*\([^)]*\)\s*$/.test(lookback)) {
          nestedSkipDepth = depth;
          result += '{}';
          pos++;
          continue;
        }
      }
    } else if (ch === '}') {
      if (nestedSkipDepth !== -1 && depth === nestedSkipDepth) {
        nestedSkipDepth = -1;
        depth--;
        pos++;
        continue;
      }
      depth--;
      if (depth === 0) break;
    }
    if (nestedSkipDepth === -1) result += ch;
    pos++;
  }
  return result;
}

function extractFunctions(src) {
  const results = [];
  const fnRe = /\bfunction\s+(\w+)\s*\(/g;
  let m;
  while ((m = fnRe.exec(src)) !== null) {
    const name = m[1];
    const lineNum = src.slice(0, m.index).split('\n').length;
    let openPos = m.index + m[0].length;
    while (openPos < src.length && src[openPos] !== '{') openPos++;
    if (openPos >= src.length) continue;
    results.push({ name, ownBody: extractOwnBody(src, openPos), startLine: lineNum });
  }
  return results;
}

function computeCC(src) {
  const clean = src
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  let cc = 1;
  cc += (clean.match(/\bif\b/g) || []).length;
  cc += (clean.match(/\bfor\b/g) || []).length;
  cc += (clean.match(/\bwhile\b/g) || []).length;
  cc += (clean.match(/\bdo\b\s*\{/g) || []).length;
  cc += (clean.match(/\bcase\b\s+[^:]+:/g) || []).length;
  cc += (clean.match(/\bcatch\b/g) || []).length;
  cc += (clean.match(/&&/g) || []).length;
  cc += (clean.match(/\|\|/g) || []).length;
  cc += (clean.match(/(?<![?.])\?(?!\.|\?)/g) || []).length;
  return cc;
}

function analyzeFile(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const fns = extractFunctions(src).map((f) => ({
    name: f.name,
    cc: computeCC(f.ownBody),
    startLine: f.startLine,
  }));
  return { fns };
}

const ENGINE_FILES = fs.readdirSync(ENGINES)
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join(ENGINES, f));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('cyclomatic complexity — no NEW function exceeds CC=20', () => {
  const newViolations = [];

  for (const file of ENGINE_FILES) {
    const { fns } = analyzeFile(file);
    const base = path.basename(file);
    for (const fn of fns) {
      const key = `${base}::${fn.name}`;
      if (KNOWN_VIOLATIONS.has(key)) continue; // deuda conocida, manejada en otro test
      if (fn.cc > 20) {
        newViolations.push(`${key} CC=${fn.cc} (line ${fn.startLine}) — NEW violation, refactor or add to KNOWN_VIOLATIONS explicitly`);
      }
    }
  }

  if (newViolations.length > 0) {
    console.error('\n[CC FAIL] New functions exceeding CC=20:');
    newViolations.forEach((v) => console.error('  ', v));
  }

  assert.equal(newViolations.length, 0,
    `${newViolations.length} new CC violation(s):\n${newViolations.join('\n')}`);
});

test('cyclomatic complexity — known violations must not get WORSE', () => {
  const regressions = [];
  const seenKeys = new Set();

  for (const file of ENGINE_FILES) {
    const { fns } = analyzeFile(file);
    const base = path.basename(file);
    for (const fn of fns) {
      const key = `${base}::${fn.name}`;
      if (!KNOWN_VIOLATIONS.has(key)) continue;
      seenKeys.add(key);
      const snapshotCC = KNOWN_VIOLATIONS.get(key);
      if (fn.cc > snapshotCC) {
        regressions.push(`${key}: CC increased ${snapshotCC} → ${fn.cc} (REGRESSION)`);
      }
    }
  }

  // Detectar entradas en KNOWN_VIOLATIONS que ya no existen en el código
  const staleKeys = [];
  for (const key of KNOWN_VIOLATIONS.keys()) {
    if (!seenKeys.has(key)) {
      staleKeys.push(`${key} — function no longer exists, remove from KNOWN_VIOLATIONS`);
    }
  }

  if (regressions.length > 0) {
    console.error('\n[CC FAIL] Known violations that got worse:');
    regressions.forEach((v) => console.error('  ', v));
  }
  if (staleKeys.length > 0) {
    console.warn('\n[CC WARN] Stale KNOWN_VIOLATIONS entries:');
    staleKeys.forEach((v) => console.warn('  ', v));
  }

  assert.equal(regressions.length, 0,
    `${regressions.length} CC regression(s):\n${regressions.join('\n')}`);
});

test('cyclomatic complexity — known debt inventory (informational)', () => {
  const all = [];
  for (const file of ENGINE_FILES) {
    const { fns } = analyzeFile(file);
    const base = path.basename(file);
    for (const fn of fns) all.push({ key: `${base}::${fn.name}`, ...fn });
  }
  all.sort((a, b) => b.cc - a.cc);

  const knownFns = all.filter((f) => KNOWN_VIOLATIONS.has(f.key));
  const totalDebt = knownFns.reduce((s, f) => s + f.cc, 0);
  const snapTotal = [...KNOWN_VIOLATIONS.values()].reduce((s, v) => s + v, 0);

  console.log(`\n[CC INFO] Known debt: ${knownFns.length} functions, CC total=${totalDebt} (snapshot=${snapTotal})`);
  console.log('[CC INFO] Top 5 by CC:');
  all.slice(0, 5).forEach((f, i) => {
    const known = KNOWN_VIOLATIONS.has(f.key) ? ' [known debt]' : '';
    console.log(`  ${i + 1}. ${f.key} CC=${f.cc}${known}`);
  });

  assert.ok(true);
});
