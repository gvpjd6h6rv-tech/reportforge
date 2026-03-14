'use strict';
// Playwright headless sandbox
const { execSync } = require('child_process');
const path=require('path');
// Use our proven check_runtime.py
try {
  execSync(`cd ${path.join(__dirname,'..')} && python3 ci/check_runtime.py`, {stdio:'inherit'});
  process.stdout.write('\nSANDBOX PASS\n');
} catch(e) { process.stdout.write('\nSANDBOX FAIL\n'); process.exit(1); }
