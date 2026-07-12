'use strict';
export function renderHtmlClientScript() { return `const input = document.getElementById('search');
const table = document.getElementById('members');
function filterRows() { const needle = (input.value || '').toLowerCase(); for (const row of table.tBodies[0].rows) row.hidden = needle && !row.dataset.path.toLowerCase().includes(needle); }
input?.addEventListener('input', filterRows);
filterRows();`; }
