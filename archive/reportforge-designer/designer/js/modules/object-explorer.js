import RF from '../rf.js';

/**
 * modules/object-explorer.js — RF.Modules.ObjectExplorer
 * Layer   : Modules (v4)
 * Purpose : Object explorer panel. Lists all elements on the canvas in a
 *           section-grouped tree with selection sync and inline search.
 * Deps    : RF.Core.DocumentModel, RF.Classic.Sections
 */

RF.Modules.ObjectExplorer = {
  _el: null,

  init() {
    this._el = document.getElementById('object-explorer-content');
        RF.on(RF.E.SEL_CHANGED,    () => this.update());
  },

  render() {
    if (!this._el) return;
    const DM = RF.Core.DocumentModel;
    const L  = DM.layout;
    RF.clear(this._el);

    // Search bar
    const sb = document.createElement('div');
    sb.className = 'fe-search-wrap u-pad-8-4';
    const si = document.createElement('span');
    si.className = 'fe-search-icon';
    si.textContent = '\u{1F50D}';
    const inp = document.createElement('input');
    inp.className = 'fe-search';
    inp.id = 'oe-search';
    inp.placeholder = 'Filter objects\u2026';
    inp.addEventListener('input', () => this._search(inp.value));
    sb.appendChild(si);
    sb.appendChild(inp);
    this._el.appendChild(sb);

    const tree = document.createElement('div');
    tree.id = 'oe-tree';

    L.sections.forEach(sec => {
      const els = L.elements.filter(e => e.sectionId === sec.id);
      const color = RF.Classic.Sections?.COLORS?.[sec.stype] || '#555';

      const hdr = document.createElement('div');
      hdr.className = 'u-oe-sec-hdr';
      hdr.innerHTML = '<span style="color:' + color + ';margin-right:4px">\u00A7</span>'
        + sec.label
        + ' <span class="u-opacity-4-ml">' + els.length + '</span>';
      tree.appendChild(hdr);

      els.sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0)).forEach(el => {
        const row = document.createElement('div');
        row.className = 'u-oe-item' + (DM.selectedIds.has(el.id) ? ' u-accent' : '');
        row.dataset.oeElid = el.id;
        row.title = el.type + ': ' + el.id;

        row.innerHTML = '<span class="u-fs9-op5">' + el.type[0].toUpperCase() + '</span>'
          + ' <span class="u-oe-name">' + el.id + '</span>'
          + (el.locked ? ' \uD83D\uDD12' : '')
          + (el.grouped ? ' <span class="u-fs-9 u-accent">\u229A</span>' : '');

        row.addEventListener('pointerdown', e => {
          RF.Sel.select(el.id, e.ctrlKey || e.shiftKey);
        });
        row.addEventListener('dblclick', () => RF.emit(RF.E.INSPECTOR_REFRESH));
        tree.appendChild(row);
      });
    });

    this._el.appendChild(tree);

    const footer = document.createElement('div');
    footer.className = 'u-pad-6-top u-fs-11 u-text-faint';
    footer.textContent = L.elements.length + ' objects \u00B7 ' + L.sections.length + ' sections';
    this._el.appendChild(footer);
  },

  update() {
    if (!this._el) return;
    const DM = RF.Core.DocumentModel;
    this._el.querySelectorAll('[data-oe-elid]').forEach(d => {
      d.classList.toggle('u-accent', DM.selectedIds.has(d.dataset.oeElid));
    });
  },

  _search(q) {
    const lower = q.toLowerCase();
    const tree = document.getElementById('oe-tree');
    if (!tree) return;
    tree.querySelectorAll('.u-oe-item').forEach(row => {
      const name = row.dataset.oeElid || '';
      row.classList.toggle('u-hidden', !(!q || name.toLowerCase().includes(lower)));
    });
  },
};
