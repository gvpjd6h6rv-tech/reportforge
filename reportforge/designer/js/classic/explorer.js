import RF from '../rf.js';

/**
 * classic/explorer.js — RF.Classic.Explorer
 * Layer   : Classic UI
 * Purpose : Field explorer panel. Renders a tree of available data fields,
 *           handles drag-start for field-to-canvas drops, and exposes
 *           handleDrop for the canvas to consume.
 * Deps    : RF.Classic.Sections, RF.Core.DocumentModel
 */

RF.Classic.Explorer = {
  _el: null,

  _container() {
    return document.getElementById('field-explorer-inner') || this._el;
  },

  init() {
    this._el = document.getElementById('field-explorer');
    if (!this._el) return;
    this.render();
    RF.on(RF.E.LAYOUT_CHANGED, () => this._syncParams());
  },

  render() {
    const fd = RF.Core.DocumentModel.fieldData;
    this._container().append(RF.html(`
      <div class="panel-hdr"><span>Field Explorer</span>
        <div class="panel-hdr-actions">
          <button class="panel-icon-btn" title="Add Formula" onclick="RF.emit(RF.E.FORMULA_OPEN,null)">ƒ+</button>
          <button class="panel-icon-btn" title="Parameters"  onclick="RF.emit(RF.E.PARAMS_OPEN,null)">{?}</button>
        </div>
      </div>
      <div class="fe-search"><input placeholder="🔍 Search fields…" oninput="RF.Classic.Explorer.filter(this.value)"></div>
      <div id="fe-tree" class="fe-tree">
        ${this._group('🗄','Database Fields','database',fd.database)}
        ${this._group('ƒ', 'Formula Fields', 'formula',  fd.formula)}
        ${this._group('{?}','Parameters',    'parameter',fd.parameter)}
        ${this._group('Σ','Running Totals',  'running',  fd.running)}
        ${this._group('◈','SQL Expressions', 'sql',       fd.sql)}
        ${this._group('★','Special Fields',  'special',  fd.special)}
      </div>`));
    this._attachDrag();
    this._attachToggle();
  },

  _group(icon, label, key, fields) {
    return `<div class="fe-group">
      <div class="fe-group-hdr" data-gk="${key}">
        <span class="fe-arrow">▶</span><span class="fe-gicon">${icon}</span>
        <span>${label}</span><span class="fe-count">${fields.length}</span>
      </div>
      <div class="fe-group-body u-hidden" id="feg-${key}">
        ${fields.length ? fields.map(f=>this._field(f,key)).join('') : '<div class="fe-empty">(none)</div>'}
      </div>
    </div>`;
  },

  _field(path, group) {
    const name = path.split('.').pop().replace(/[{}[\]]/g,'');
    const icons= {database:'≡',formula:'ƒ',parameter:'?',running:'Σ',sql:'◈',special:'★'};
    return `<div class="fe-field" draggable="true" data-path="${path}" data-group="${group}" title="${path}">
      <span class="fe-ficon">${icons[group]||'·'}</span>
      <span class="fe-fname">${name}</span>
    </div>`;
  },

  _attachDrag() {
    this._container().querySelectorAll('.fe-field').forEach(div => {
      div.addEventListener('dragstart', e => {
        e.dataTransfer.setData('rf/field-path', div.dataset.path);
        e.dataTransfer.setData('rf/field-group', div.dataset.group);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  },

  _attachToggle() {
    this._container().querySelectorAll('.fe-group-hdr').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const key  = hdr.dataset.gk;
        const body = document.getElementById(`feg-${key}`);
        const arr  = hdr.querySelector('.fe-arrow');
        if (!body) return;
        const open = body.style.display!=='none';
        body.classList.toggle('u-hidden', open);
        if (arr) arr.textContent = open?'▶':'▼';
      });
    });
  },

  filter(q) {
    const lower = q.toLowerCase();
    this._container().querySelectorAll('.fe-field').forEach(d => {
      d.classList.toggle('u-hidden', !d.dataset.path.toLowerCase().includes(lower));
    });
    if (q) {
      this._container().querySelectorAll('.fe-group-body').forEach(b => {
        const hasVis = [...b.querySelectorAll('.fe-field')].some(d=>d.style.display!=='none');
        if (hasVis) { b.classList.remove('u-hidden'); const h=b.previousElementSibling; if(h) h.querySelector('.fe-arrow').textContent='▼'; }
      });
    }
  },

  handleDrop(e, sectionId) {
    e.preventDefault();
    const path  = e.dataTransfer.getData('rf/field-path');
    const group = e.dataTransfer.getData('rf/field-group');
    if (!path) return;
    const body  = document.getElementById(`secbody-${sectionId}`);
    if (!body) return;
    const br    = body.getBoundingClientRect();
    const sr    = document.getElementById('canvas-surface').getBoundingClientRect();
    const DM    = RF.Core.DocumentModel;
    const lx    = RF.clamp((e.clientX-br.left)/DM.zoom, 0, DM.layout.pageWidth-120);
    const ly    = RF.clamp((e.clientY-br.top )/DM.zoom, 0, (DM.getSectionById(sectionId)?.height||40)-14);
    RF.H.snapshot('before-drop');
    const isSpecial = path.startsWith('{') || path.startsWith('[') || group==='special' || group==='formula';
    const type  = isSpecial ? 'text' : 'field';
    const el    = DM.createElement(type, sectionId, lx, ly, {
      fieldPath: type==='field' ? path : '',
      content:   type==='text'  ? path : '',
    });
    if (el) RF.Classic.Sections.attachNewElement(el);
    RF.emit(RF.E.STATUS, `Added ${type}: ${path}`);
  },

  _syncParams() {
    const params = RF.Core.DocumentModel.layout.parameters||[];
    RF.Core.DocumentModel.fieldData.parameter = params.map(p=>`param.${p.name||p}`);
  },
};


// ═══════════════════════════════════════════════════════════════════════════════
// RF.Classic.Toolbar — Main toolbar + context toolbar row 2.
// ═══════════════════════════════════════════════════════════════════════════════
