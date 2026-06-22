#!/usr/bin/env node
'use strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSaladScore } from '../runner/run_salad_score.mjs';
import { reporterConsole } from '../reporters/reporter_console.mjs';
import { reporterJson } from '../reporters/reporter_json.mjs';
import { reporterMarkdown } from '../reporters/reporter_markdown.mjs';
import { reporterDashboard } from '../reporters/reporter_dashboard.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const FLAG_HANDLERS = {
  '--root': (args, argv, i) => { args.root = argv[i + 1]; return 1; },
  '--format': (args, argv, i) => { args.format = argv[i + 1]; return 1; },
  '--output': (args, argv, i) => { args.output = argv[i + 1]; return 1; },
  '--max-score': (args, argv, i) => { args.maxScore = Number(argv[i + 1]); return 1; },
  '--top': (args, argv, i) => { args.top = Number(argv[i + 1]); return 1; },
  '--summary': (args) => { args.summary = true; return 0; },
  '--verbose': (args) => { args.verbose = true; return 0; },
};

function parseArgs(argv) {
  const args = { format: 'console', root: null, top: 20 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'audit') continue;
    const handler = FLAG_HANDLERS[a];
    if (!handler) {
      console.error(`Unknown flag: ${a}`);
      process.exitCode = 2;
      return null;
    }
    i += handler(args, argv, i);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) return;

  let config;
  try {
    config = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'salad-score.config.json'), 'utf8'));
  } catch (err) {
    console.error(`Invalid config: ${err.message}`);
    process.exitCode = 4;
    return;
  }

  const roots = args.root
    ? [path.isAbsolute(args.root) ? args.root : path.join(REPO_ROOT, args.root)]
    : config.scanRoots.map((r) => path.join(REPO_ROOT, r));

  for (const root of roots) {
    if (!fs.existsSync(root)) {
      console.error(`Root not found: ${root}`);
      process.exitCode = 5;
      return;
    }
  }

  let result;
  try {
    result = runSaladScore({
      roots,
      config,
      ownershipMapPath: path.join(REPO_ROOT, 'audit/subsystem_ownership_map.json'),
    });
  } catch (err) {
    console.error(`Internal error: ${err.message}`);
    process.exitCode = 3;
    return;
  }

  const top = args.summary ? 0 : args.top;
  const REPORTERS = {
    json: () => reporterJson(args.summary ? [] : result.files, result.repoScore, result.files.length),
    markdown: () => reporterMarkdown(result.files, result.repoScore, top),
    console: () => reporterConsole(result.files, result.repoScore, top),
    dashboard: () => reporterDashboard(result.files, result.repoScore, config),
  };
  const output = (REPORTERS[args.format] || REPORTERS.console)();

  if (args.output) {
    try {
      fs.mkdirSync(path.dirname(args.output), { recursive: true });
      fs.writeFileSync(args.output, output);
    } catch (err) {
      console.error(`Could not write output: ${err.message}`);
      process.exitCode = 3;
      return;
    }
  } else {
    console.log(output);
  }

  if (args.maxScore != null) {
    const exceeded = result.files.some((f) => f.sp_total_score > args.maxScore);
    process.exitCode = exceeded ? 1 : 0;
    return;
  }
  process.exitCode = 0;
}

main();
