import RF from '../rf.js';

/**
 * classic/toolbar-v4.js — RF.Classic.ToolbarV4
 * Layer   : Classic UI / v4
 * Purpose : Context toolbar (row 2). Adds v4-specific buttons: object group/
 *           ungroup, z-order controls, and the object explorer toggle.
 * Deps    : RF.Classic.Toolbar, RF.Modules.ObjectExplorer, RF.UX.ObjectGroup
 */

RF.Classic.ToolbarV4 = {
  init() {
    // Extend the existing toolbar with new buttons
    const tb = document.getElementById('toolbar');
    if (!tb || tb.dataset.v4) return;
    tb.dataset.v4 = '1';

    // Add subreport, crosstab, barcode tools to the tool group
    const toolGrp = document.getElementById('tool-group');
    if (toolGrp) {
      const newTools = [
        ['subreport', 'Sub', 'Subreport', '<path d="M1 2h10v12H1z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 5h4v6H4z" fill="none" stroke="currentColor"/>'],
        ['crosstab',  'CT',  'Crosstab',  '<rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2"/><line x1="1" y1="6" x2="15" y2="6" stroke="currentColor"/><line x1="6" y1="1" x2="6" y2="15" stroke="currentColor"/>'],
        ['barcode',   'Bar', 'Barcode',   '<path d="M2 3v10M4 3v10M7 3v10M9 3v10M12 3v10M14 3v10M5 3v6M11 3v6" stroke="currentColor" stroke-width="1.2"/>'],
        ['richtext',  'RT',  'Rich Text', '<text x="1" y="9" font-size="8" fill="currentColor" font-weight="bold">A</text><text x="6" y="9" font-size="7" fill="currentColor" font-style="italic">a</text><line x1="1" y1="13" x2="15" y2="13" stroke="currentColor" stroke-width=".8"/>'],
      ];
      newTools.forEach(([t,abbr,lbl,svg]) => {
        const btn = document.createElement('button');
        btn.className='tb-btn tb-tool'; btn.dataset.tool=t; btn.title=lbl;
        btn.append(RF.html(`<svg viewBox="0 0 16 16">${svg}</svg><span>${abbr}</span>`));
        btn.addEventListener('click', () => RF.Classic.Toolbar.setTool(t, btn));
        toolGrp.appendChild(btn);
      });
    }

    // Append extra button groups at end of toolbar (before report-name)
    const nameInput = document.getElementById('report-name');
    if (nameInput) {
      const group = document.createElement('div');
      group.className = 'tb-group';
      group.append(RF.html(`
        <button class="tb-btn accent" onclick="RF.emit(RF.E.RUNNING_TOTAL)" title="Running Totals">
          <svg viewBox="0 0 16 16"><text x="1" y="13" font-size="12" fill="currentColor">Σ</text></svg><span>RunTotals</span>
        </button>
        <button class="tb-btn accent" onclick="RF.emit(RF.E.TOPN_OPEN)" title="Top-N / Record Selection">
          <svg viewBox="0 0 16 16"><text x="0" y="12" font-size="10" fill="currentColor">Top-N</text></svg><span>Top-N</span>
        </button>
        <button class="tb-btn accent" onclick="RF.Modules.ObjectExplorer.toggle()" title="Object Explorer (Ctrl+Shift+O)">
          <svg viewBox="0 0 16 16"><path d="M2 2h12v3H2z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 7h12v3H2z" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M2 12h12v3H2z" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Objects</span>
        </button>
        <button class="tb-btn accent" onclick="RF.UX.ObjectGroup.group()" title="Group selected">
          <svg viewBox="0 0 16 16"><rect x="1" y="1" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1" stroke-dasharray="2,2"/><rect x="3" y="4" width="4" height="3" fill="none" stroke="currentColor" stroke-width="1.2"/><rect x="9" y="4" width="4" height="3" fill="none" stroke="currentColor" stroke-width="1.2"/></svg><span>Group</span>
        </button>
      `));
      const sep = document.createElement('div'); sep.className='tb-sep';
      nameInput.parentElement?.insertBefore(sep, nameInput);
      nameInput.parentElement?.insertBefore(group, sep);
    }
  },
};


// ── v4: Preview page navigation + refresh ─────────────────────────────────────
