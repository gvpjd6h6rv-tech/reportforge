'use strict';
import path from 'node:path';
export function parseCliArguments(argv, cwd = process.cwd()) {
  const out = {
    root: path.resolve(cwd, '.'),
    config: path.resolve(cwd, 'salad-score.config.json'),
    capabilityMap: path.resolve(cwd, 'tools/e2r-v2/capability-map/capability_map.json'),
    ownershipMap: path.resolve(cwd, 'audit/subsystem_ownership_map.json'),
    writeJson: null,
    writeHtml: null,
    strict: false,
    help: false,
  };
  const seen = new Set();
  const flags = new Set(['--root', '--config', '--capability-map', '--ownership-map', '--write-json', '--write-html', '--strict', '--help', '-h']);
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('-')) continue;
    if (!flags.has(token)) return { ok: false, error: `unknown flag: ${token}` };
    if (seen.has(token)) return { ok: false, error: `repeated flag: ${token}` };
    seen.add(token);
    const key = token === '--help' || token === '-h' ? 'help' : token.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (token === '--strict' || token === '--help' || token === '-h') {
      out[key] = true;
      continue;
    }
    const next = argv[i + 1];
    if (!next || next.startsWith('-')) return { ok: false, error: `missing value for ${token}` };
    out[key] = path.resolve(cwd, next);
    i += 1;
  }
  return { ok: true, value: out };
}
