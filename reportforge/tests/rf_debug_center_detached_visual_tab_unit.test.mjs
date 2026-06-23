'use strict';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDetachedVisualDoctorTab } from '../../tools/rf-debug-center/rf-debug-center-detached-visual-tab.js';

test('buildDetachedVisualDoctorTab — no data at all: idle defaults, no throw', () => {
  const html = buildDetachedVisualDoctorTab(undefined);
  assert.match(html, /VISUAL DOCTOR/);
  assert.match(html, /n\/a/);
  assert.match(html, /status<\/span><b>idle/);
  assert.match(html, /selector<\/span><b>n\/a/);
  assert.match(html, /summary<\/span><b>idle/);
  assert.match(html, /no simulated CSS yet/);
  assert.match(html, /no simulation run yet/);
});

test('buildDetachedVisualDoctorTab — empty data object: same idle defaults as undefined', () => {
  const html = buildDetachedVisualDoctorTab({});
  assert.match(html, /status<\/span><b>idle/);
  assert.match(html, /no simulation run yet/);
});

test('buildDetachedVisualDoctorTab — bundleStatus comes from data.bundleStatus directly, not data.bundle.bundleStatus', () => {
  const html = buildDetachedVisualDoctorTab({ bundleStatus: 'ready', bundle: { bundleStatus: 'wrong-field' } });
  assert.match(html, /bundle status<\/span>\s*<b class="ready">ready/);
});

test('buildDetachedVisualDoctorTab — visualDoctorPreview from data.raw wins over data.bundle', () => {
  const html = buildDetachedVisualDoctorTab({
    raw: { visualDoctorPreview: { status: 'from-raw' } },
    bundle: { visualDoctorPreview: { status: 'from-bundle' } },
  });
  assert.match(html, /status<\/span><b>from-raw/);
});

test('buildDetachedVisualDoctorTab — falls back to data.bundle.visualDoctorPreview when data.raw has none', () => {
  const html = buildDetachedVisualDoctorTab({
    raw: {},
    bundle: { visualDoctorPreview: { status: 'from-bundle' } },
  });
  assert.match(html, /status<\/span><b>from-bundle/);
});

test('buildDetachedVisualDoctorTab — full preview renders safety contract, css plan and regression result', () => {
  const html = buildDetachedVisualDoctorTab({
    raw: {
      visualDoctorPreview: {
        status: 'ready',
        selector: '#totals',
        summary: 'simulated 1 fix',
        safety: { runtimeOnly: true, writesFiles: false, rollbackRequired: true, autopatch: false },
        plan: { cssText: '#totals { color: red; }' },
        result: { applied: true, improved: true, confidence: 'high', recommendation: 'looks good' },
      },
    },
  });
  assert.match(html, /status<\/span><b>ready/);
  assert.match(html, /selector<\/span><b>#totals/);
  assert.match(html, /summary<\/span><b>simulated 1 fix/);
  assert.match(html, /color: red/);
  assert.match(html, /&quot;confidence&quot;: &quot;high&quot;/);
  // runtimeOnly:true -> (true !== false) = true -> safetyRow renders red/yes
  assert.match(html, /runtime only<\/span><b class="red">yes/);
  // writesFiles:false -> !!false = false -> safetyRow renders green/no
  assert.match(html, /writes files<\/span><b class="green">no/);
});

test('buildDetachedVisualDoctorTab — safety flags flip class+text together based on each boolean', () => {
  const html = buildDetachedVisualDoctorTab({
    raw: { visualDoctorPreview: { safety: { runtimeOnly: false, writesFiles: true, rollbackRequired: false, autopatch: true } } },
  });
  // runtimeOnly:false -> (false !== false) = false -> green/no
  assert.match(html, /runtime only<\/span><b class="green">no/);
  // writesFiles:true -> !!true = true -> red/yes
  assert.match(html, /writes files<\/span><b class="red">yes/);
  // rollbackRequired:false -> (false !== false) = false -> green/no
  assert.match(html, /rollback required<\/span><b class="green">no/);
  // autopatch:true -> !!true = true -> red/yes
  assert.match(html, /autopatch<\/span><b class="red">yes/);
});

test('buildDetachedVisualDoctorTab — visual signal count: array, count, total, nested arrays, plain object, zero', () => {
  const cases = [
    [{ raw: { visual: [1, 2, 3] } }, '3'],
    [{ raw: { visual: { count: 7 } } }, '7'],
    [{ raw: { visual: { total: 9 } } }, '9'],
    [{ raw: { visual: { entries: [1, 2] } } }, '2'],
    [{ raw: { visual: { findings: ['a'] } } }, '1'],
    [{ raw: { visual: { a: 1, b: 2 } } }, '2'],
    [{ raw: { visual: {} } }, '0'],
    [{}, '0'],
  ];
  for (const [data, expected] of cases) {
    const html = buildDetachedVisualDoctorTab(data);
    const match = html.match(/visual signals<\/span>\s*<b class="(?:cyan|green)">(\d+)</);
    assert.ok(match, `must render a visual signal count for ${JSON.stringify(data)}`);
    assert.equal(match[1], expected, `expected ${expected} for ${JSON.stringify(data)}`);
  }
});

test('buildDetachedVisualDoctorTab — visualDoctor field takes priority over visualEvidence/visual on raw and bundle', () => {
  const html = buildDetachedVisualDoctorTab({
    raw: { visualDoctor: ['a'], visualEvidence: ['a', 'b'], visual: ['a', 'b', 'c'] },
  });
  const match = html.match(/visual signals<\/span>\s*<b class="cyan">(\d+)</);
  assert.equal(match[1], '1');
});

test('buildDetachedVisualDoctorTab — escapes untrusted text, never emits fetch/eval/window.open/document.write', () => {
  const html = buildDetachedVisualDoctorTab({
    bundleStatus: '<img src=x onerror=alert(1)>',
    raw: { visualDoctorPreview: { selector: '<script>alert(1)</script>' } },
  });
  assert.doesNotMatch(html, /<img src=x onerror=alert/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.doesNotMatch(html, /\bfetch\s*\(/);
  assert.doesNotMatch(html, /\beval\s*\(/);
  assert.doesNotMatch(html, /window\.open\(/);
  assert.doesNotMatch(html, /document\.write\(/);
});

test('buildDetachedVisualDoctorTab — custom esc/safeJson helpers are honored over fallbacks', () => {
  const helpers = {
    esc: (v) => `[esc:${v}]`,
    safeJson: (v) => `[json:${JSON.stringify(v)}]`,
  };
  const html = buildDetachedVisualDoctorTab({ bundleStatus: 'x' }, helpers);
  assert.match(html, /\[esc:x\]/);
  assert.match(html, /\[json:/);
});
