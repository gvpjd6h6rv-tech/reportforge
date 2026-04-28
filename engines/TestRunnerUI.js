(function () {
  'use strict';

  function stripAnsi(v) {
    return String(v ?? '').replace(/(?:\x1B|\u001B|\u009B)\[[0-?]*[ -/]*[@-~]/g, '');
  }

  async function run(kind) {
    const btn = document.getElementById(kind === 'quick' ? 'rf-test-quick' : 'rf-test-full');
    if (!btn) return;

    btn.classList.remove('is-pass', 'is-fail');
    btn.classList.add('is-running');

    const popup = window.open('', '_blank', 'width=900,height=700,resizable=yes,scrollbars=yes');
    if (popup?.document) {
      popup.document.write(`<!doctype html>
<html>
<head>
<title>RF Tests</title>
<style>
html,body{margin:0;width:100%;height:100%;background:#111;color:#ddd;font:12px monospace;}
#bar{padding:8px 12px;background:#222;border-bottom:1px solid #444;color:#ffd54a;}
pre{margin:0;padding:12px;white-space:pre-wrap;box-sizing:border-box;background:#111;color:#ddd;}
</style>
</head>
<body><div id="bar">Running ${kind} tests… 0s</div><pre id="log">Starting…\n</pre></body>
</html>`);
      let tick = 0;
      var timer = setInterval(() => {
        if (!popup || popup.closed) return clearInterval(timer);
        tick += 1;
        const bar = popup.document.getElementById('bar');
        if (bar) bar.textContent = `Running ${kind} tests… ${tick}s`;
      }, 1000);
      popup.document.close();
    }

    try {
      const log = popup?.document?.getElementById('log');
      const res = await fetch(`/tests/stream?kind=${kind}`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      let output = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        output += stripAnsi(decoder.decode(value, { stream: true }));
        if (log) {
          log.textContent = output;
          popup.scrollTo(0, popup.document.body.scrollHeight);
        }
      }

      const ok = output.includes('VALIDATION PASSED') || output.includes('EXIT CODE: 0');
      btn.classList.remove('is-running');
      btn.classList.add(ok ? 'is-pass' : 'is-fail');
      if (typeof timer !== 'undefined') clearInterval(timer);

      const bar = popup?.document?.getElementById('bar');
      if (bar) bar.textContent = `${kind.toUpperCase()} TESTS ${ok ? 'PASSED' : 'FAILED'}`;
    } catch (err) {
      if (typeof timer !== 'undefined') clearInterval(timer);
      btn.classList.remove('is-running');
      btn.classList.add('is-fail');
      alert(`Tests crashed: ${err}`);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('rf-test-quick')?.addEventListener('click', () => run('quick'));
    document.getElementById('rf-test-full')?.addEventListener('click', () => run('full'));
  });
})();
