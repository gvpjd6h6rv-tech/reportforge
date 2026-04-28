'use strict';
(function initTestOutputSanitizer(global) {
  function stripAnsi(text) {
    return String(text || '')
      .replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
  }

  function cleanNode(node) {
    if (!node) return;
    if (node.childNodes && node.childNodes.length) {
      node.childNodes.forEach(cleanNode);
      return;
    }
    if (node.nodeType === Node.TEXT_NODE && node.nodeValue) {
      node.nodeValue = stripAnsi(node.nodeValue);
    }
  }

  function sanitizeRoot(root) {
    cleanNode(root);
  }

  global.TestOutputSanitizer = { stripAnsi, sanitizeRoot };
})(window);
