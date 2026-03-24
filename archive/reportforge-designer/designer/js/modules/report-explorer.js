import RF from '../rf.js';

/**
 * modules/report-explorer.js — RF.Modules.ReportExplorer
 * Layer   : Modules (v4)
 * Purpose : Report explorer panel. Hierarchical tree view of the report
 *           structure (sections → elements) with inline search.
 * Deps    : RF.Classic.Sections
 */

RF.Modules.ReportExplorer = {
  _visible: false,

  init() {
      },

  toggle() {
    this._visible = !this._visible;
    const el = document.getElementById('report-explorer-content');
    if (el) el.classList.toggle('u-hidden', !this._visible);
    this.render();
  },

  render() {
    const el = document.getElementById('report-explorer-content');
    if (!el || !this._visible) return;
    const DM = RF.Core.DocumentModel;
    const L  = DM.layout;

    const secTree = L.sections.map(sec => {
      const els = L.elements.filter(e=>e.sectionId===sec.id);
      const clr = RF.Classic.Sections.COLORS[sec.stype]||'#555';
      const ico = RF.Classic.Sections.ICONS[sec.stype]||'§';
      return `<div class="re-section">
        <div class="re-sec-hdr" onclick="RF.Sel.clear();RF.emit('section:edit','${sec.id}')">
          <span class="re-ico u-icon-dot" style="--item-color:${clr}">${ico}</span>
          <span class="re-lbl">${sec.label}</span>
          <span class="re-cnt">${els.length}</span>
        </div>
        ${els.sort((a,b)=>(b.zIndex||0)-(a.zIndex||0)).map(el=>`
        <div class="re-el${DM.selectedIds.has(el.id)?' re-sel':''}" 
             onclick="RF.Sel.select('${el.id}',event.ctrlKey)"
             ondblclick="RF.emit(RF.E.INSPECTOR_REFRESH)"
             title="${el.id}">
          <span class="re-el-type">${el.type[0].toUpperCase()}</span>
          <span class="re-el-name">${el.id}</span>
          ${el.locked?'<span title="Locked">🔒</span>':''}
          ${el.grouped?'<span title="Grouped" class="u-fs-9 u-accent">⊚</span>':''}
        </div>`).join('')}
      </div>`;
    }).join('');

    el.replaceChildren(); el.append(RF.html(`
    <div class="u-pad-8-10-bdr">
      <div class="fe-search-wrap">
        <span class="fe-search-icon">🔍</span>
        <input class="fe-search" id="re-search" placeholder="Search objects…" oninput="RF.Modules.ReportExplorer._search(this.value)">
      </div>
    </div>
    <div id="re-tree" class="u-scroll-flex">${secTree}</div>
    <div class="u-pad-6-top">
      ${L.elements.length} objects · ${L.sections.length} sections
    </div>`));
  },

  _search(q) {
    const lower = q.toLowerCase();
    document.querySelectorAll('#re-tree .re-el').forEach(el => {
      const name = el.querySelector('.re-el-name')?.textContent||'';
      el.classList.toggle('u-hidden', !(!q || name.toLowerCase().includes(lower)));
    });
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.RepositoryExplorer — shared formula / object repository
// ═══════════════════════════════════════════════════════════════════════════
