import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function countMatches(source, regex) {
  return (source.match(regex) || []).length;
}

function normalizeForScan(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/`(?:\\.|[^`])*`/g, '``')
    .replace(/'(?:\\.|[^'])*'/g, "''")
    .replace(/"(?:\\.|[^"])*"/g, '""');
}

function collectViolations(source) {
  const normalized = normalizeForScan(source);
  const rules = [
    {
      code: 'legacy-canvas-facade-call',
      regex: /\bCanvasEngine\.(?:renderAll|renderElement|buildElementDiv|updateElement|updateElementPosition|update|updateSync)\s*\(/g,
    },
    {
      code: 'legacy-preview-facade-call',
      regex: /\bPreviewEngine\.(?:show|hide|toggle|refresh)\s*\(/g,
    },
    {
      code: 'legacy-preview-render-mode-call',
      regex: /\bPreviewEngine\.renderMode\b/g,
    },
    {
      code: 'legacy-canvas-facade-definition',
      regex: /\bconst\s+CanvasEngine\s*=\s*\{/g,
    },
    {
      code: 'legacy-preview-facade-definition',
      regex: /\bconst\s+PreviewEngine\s*=\s*\{/g,
    },
    {
      code: 'legacy-dom-alias',
      regex: /\.rf-el\b/g,
    },
    {
      code: 'legacy-preview-selection-class',
      regex: /\bpv-origin-selected\b/g,
    },
  ];
  const violations = [];
  for (const rule of rules) {
    if (rule.regex.test(normalized)) violations.push(rule.code);
    rule.regex.lastIndex = 0;
  }
  return violations;
}

function retiredEngineRegex(parts) {
  return new RegExp(`\\b${parts.join('')}\\b`);
}

test('guardrail detector catches synthetic architectural violations', () => {
  const bad = `
    CanvasEngine.renderAll();
    PreviewEngine.toggle();
    window.foo = PreviewEngine.renderMode;
    const CanvasEngine = {};
    const PreviewEngine = {};
  `;
  const violations = collectViolations(bad);
  assert.deepEqual(violations, [
    'legacy-canvas-facade-call',
    'legacy-preview-facade-call',
    'legacy-preview-render-mode-call',
    'legacy-canvas-facade-definition',
    'legacy-preview-facade-definition',
  ]);
});

test('canonical runtime files do not call legacy canvas or preview facades', () => {
  const files = [
    path.resolve('designer/crystal-reports-designer-v4.html'),
    path.resolve('engines/EngineCore.js'),
    path.resolve('engines/SelectionEngine.js'),
    path.resolve('engines/HistoryEngine.js'),
    path.resolve('engines/ClipboardEngine.js'),
  ];

  for (const file of files) {
    const src = fs.readFileSync(file, 'utf8');
    const violations = collectViolations(src);
    assert.deepEqual(violations, [], `${path.basename(file)} has violations: ${violations.join(', ')}`);
  }
});

test('monolith no longer defines the document store inline', () => {
  const html = fs.readFileSync(path.resolve('designer/crystal-reports-designer-v4.html'), 'utf8');
  assert.doesNotMatch(html, /\bconst\s+DS\s*=\s*\{/);
  assert.doesNotMatch(html, /\bfunction\s+newId\s*\(/);
  assert.doesNotMatch(html, /\bfunction\s+mkEl\s*\(/);
  assert.match(html, /<script src="\/engines\/DocumentStore\.js"><\/script>/);
});

test('canonical runtime files do not reference retired bridge implementations', () => {
  const files = [
    path.resolve('designer/crystal-reports-designer-v4.html'),
    path.resolve('engines/EngineCore.js'),
    path.resolve('engines/SelectionEngine.js'),
    path.resolve('engines/HistoryEngine.js'),
    path.resolve('engines/ClipboardEngine.js'),
    path.resolve('engines/PreviewEngine.js'),
  ];
  for (const file of files) {
    const src = normalizeForScan(fs.readFileSync(file, 'utf8'));
    assert.doesNotMatch(src, retiredEngineRegex(['Canvas', 'EngineV19']), `${path.basename(file)} still references retired canvas engine`);
    assert.doesNotMatch(src, retiredEngineRegex(['Preview', 'EngineV19', 'Full']), `${path.basename(file)} still references retired preview engine`);
    assert.doesNotMatch(src, retiredEngineRegex(['Selection', 'EngineV19', 'Full']), `${path.basename(file)} still references retired selection engine`);
    assert.doesNotMatch(src, /\.rf-el\b/, `${path.basename(file)} still references rf-el alias`);
    assert.doesNotMatch(src, /\bpv-origin-selected\b/, `${path.basename(file)} still references preview legacy selection class`);
  }
});

test('critical engine style.cssText usage stays frozen at approved baseline', () => {
  const expectations = new Map([
    [path.resolve('engines/SelectionEngine.js'), 3],
    [path.resolve('engines/CanvasLayoutEngine.js'), 1],
    [path.resolve('engines/PreviewEngine.js'), 0],
    [path.resolve('engines/EngineCore.js'), 0],
  ]);

  for (const [file, expectedCount] of expectations.entries()) {
    const src = fs.readFileSync(file, 'utf8');
    const actualCount = countMatches(src, /style\.cssText/g);
    assert.equal(actualCount, expectedCount, `${path.basename(file)} style.cssText count changed`);
  }
});

test('governance assets exist and include strict architectural checklist', () => {
  const prTemplatePath = path.resolve('.github/PULL_REQUEST_TEMPLATE.md');
  const workflowPath = path.resolve('.github/workflows/architecture-governance.yml');
  const readmePath = path.resolve('README.md');

  assert.ok(fs.existsSync(prTemplatePath), 'PR template missing');
  assert.ok(fs.existsSync(workflowPath), 'CI workflow missing');
  assert.ok(fs.existsSync(readmePath), 'README missing');

  const prTemplate = fs.readFileSync(prTemplatePath, 'utf8');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const readme = fs.readFileSync(readmePath, 'utf8');

  for (const needle of [
    'no nuevos writers',
    'no nuevos owners',
    'no bypass del scheduler',
    'no estado fuera de DS',
    'no contratos ambiguos',
    'tests pasan (runtime + contracts + governance)',
    'no uso de APIs legacy',
  ]) {
    assert.match(prTemplate, new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(workflow, /test:contracts/);
  assert.match(workflow, /test:runtime/);
  assert.match(workflow, /test:governance/);

  assert.match(readme, /Architectural Definition of Done/);
});
