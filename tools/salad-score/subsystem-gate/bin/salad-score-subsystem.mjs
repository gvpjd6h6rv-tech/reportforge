#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import { runSubsystemGate } from '../runner/run_subsystem_gate.mjs';

/** CLI adapter: argv + filesystem in, stdout/stderr/exitCode out. No metric/
 *  regex logic here -- loads config/ownership-map from the PATHS given on
 *  argv (never injected pre-parsed), so the command is runnable from a real
 *  shell: `node salad-score-subsystem.mjs --root . --config X --ownership-map
 *  Y --scope-map Z --subsystem-id ID`.
 *  Exit code contract:
 *    0 = FINAL_GATE_STATUS PASS         (stdout=result JSON, stderr empty)
 *    1 = FINAL_GATE_STATUS FAIL         (stdout=result JSON, stderr empty)
 *    2 = usage error (missing/unknown flag) (stdout empty, stderr=message)
 *    3 = operational/tool error (any exception) (stdout empty, stderr=message) */
const REQUIRED = ['--root', '--config', '--ownership-map', '--scope-map', '--subsystem-id'];
const ALLOWED = new Set(REQUIRED);

export function main(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (!flag.startsWith('--')) continue;
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
      process.stderr.write(`usage error: flag ${flag} is missing its value\n`);
      process.exitCode = 2;
      return null;
    }
    args[flag] = argv[i + 1];
    i += 1;
  }

  const unknown = Object.keys(args).filter((flag) => !ALLOWED.has(flag));
  if (unknown.length > 0) {
    process.stderr.write(`usage error: unknown flag(s): ${unknown.join(', ')}\n`);
    process.exitCode = 2;
    return null;
  }
  const missing = REQUIRED.filter((flag) => !(flag in args));
  if (missing.length > 0) {
    process.stderr.write(`usage error: missing required flag(s): ${missing.join(', ')}\n`);
    process.exitCode = 2;
    return null;
  }

  let result;
  try {
    const config = JSON.parse(fs.readFileSync(args['--config'], 'utf8'));
    result = runSubsystemGate({
      root: args['--root'], config, ownershipMapPath: args['--ownership-map'],
      scopeMapPath: args['--scope-map'], subsystemId: args['--subsystem-id'],
    });
  } catch (err) {
    process.stderr.write(`operational error: ${err.message}\n`);
    process.exitCode = 3;
    return null;
  }

  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exitCode = result.FINAL_GATE_STATUS === 'PASS' ? 0 : 1;
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('salad-score-subsystem.mjs')) {
  main(process.argv.slice(2));
}
