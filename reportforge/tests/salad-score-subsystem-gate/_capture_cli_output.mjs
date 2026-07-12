'use strict';
/** Test-only harness: temporarily intercepts process.stdout.write/
 *  process.stderr.write to capture what the CLI actually printed, then
 *  restores the real streams. No assertions, no expected values -- pure
 *  capture mechanics. */
export function captureCliOutput(fn) {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  let stdout = '';
  let stderr = '';
  process.stdout.write = (chunk) => { stdout += chunk; return true; };
  process.stderr.write = (chunk) => { stderr += chunk; return true; };
  try {
    const result = fn();
    return { result, stdout, stderr };
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
}
