const test = (await import('node:test')).default;
const assert = (await import('node:assert/strict')).default;
const fs = await import('node:fs');
const main = (await import('../../../tools/e2r-v2/bin/e2r-v2.mjs')).main;
test('t71_cli_strict_mode_exit1_with_known_gaps', async () => {
  const map = JSON.parse(fs.readFileSync('tools/e2r-v2/capability-map/capability_map.json', 'utf8'));
  const tempDir = fs.mkdtempSync('/tmp/e2r-v2-cli-');
  const brokenMapPath = `${tempDir}/broken-map.json`;
  const broken = JSON.parse(JSON.stringify(map));
  broken.capabilities[0].files[0].path = 'engines/DefinitelyMissing.js';
  fs.writeFileSync(brokenMapPath, JSON.stringify(broken), 'utf8');
  assert.equal((await main(['--root', '.', '--config', 'salad-score.config.json', '--capability-map', brokenMapPath, '--ownership-map', 'audit/subsystem_ownership_map.json', '--strict'])).exitCode, 1);
  assert.equal((await main(['--root', '.', '--config', 'salad-score.config.json', '--capability-map', 'tools/e2r-v2/capability-map/capability_map.json', '--ownership-map', 'audit/subsystem_ownership_map.json', '--strict'])).exitCode, 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
