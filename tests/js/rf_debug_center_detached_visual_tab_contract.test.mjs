import assert from 'node:assert/strict';

const mod = await import('../../tools/rf-debug-center/rf-debug-center-detached-visual-tab.js');

assert.equal(
  typeof mod.buildDetachedVisualDoctorTab,
  'function',
  'detached visual tab module must export buildDetachedVisualDoctorTab'
);

const html = mod.buildDetachedVisualDoctorTab({
  bundleStatus: 'ready',
  raw: {
    visualEvidence: {
      findings: [{ selector: '#preview-content', issue: 'height' }],
    },
  },
  bundle: {
    visualEvidence: {
      generatedAt: 'test',
    },
  },
});

assert.ok(html.includes('VISUAL DOCTOR'), 'visual tab must render title');
assert.ok(html.includes('VISUAL MODEL'), 'visual tab must render model payload');
assert.ok(html.includes('VISUAL BUNDLE'), 'visual tab must render bundle payload');
assert.ok(html.includes('&quot;#preview-content&quot;'), 'visual tab must escape JSON payload');

console.log('rf debug center detached visual tab contract: PASS');
