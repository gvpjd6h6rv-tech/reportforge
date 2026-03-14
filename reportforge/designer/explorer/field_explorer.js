// ─────────────────────────────────────────────────────────────────────────────
// explorer/field_explorer.js  –  Field Explorer  (feature 39)
// Crystal-style tree: Database Fields, Formula, Parameters, Running Totals,
// SQL Expressions, Special Fields.  Drag-to-canvas creates field elements.
// ─────────────────────────────────────────────────────────────────────────────
RF.FieldExplorer = {

  _el: null,

  init() {
    this._el = document.getElementById('field-explorer');
    if (!this._el) return;
    this.render();
    RF.EventBus.on('layout:changed', () => this._syncFormulas());
  },

  render() {
    if (!this._el) return;
    const fd = RF.AppState.fieldData;
    this._el.innerHTML = `
      <div class="fe-header">
        <span>Field Explorer</span>
        <button class="fe-btn" title="Add Formula Field" onclick="RF.FieldExplorer.addFormula()">＋</button>
      </div>
      <div class="fe-search">
        <input id="fe-search" placeholder="🔍 Search fields…" oninput="RF.FieldExplorer.filter(this.value)">
      </div>
      <div id="fe-tree" class="fe-tree">
        ${this._group('🗄',  'Database Fields',  'database',  fd.database)}
        ${this._group('ƒ',   'Formula Fields',   'formula',   fd.formula)}
        ${this._group('{?}', 'Parameter Fields', 'parameter', fd.parameter)}
        ${this._group('Σ',   'Running Totals',   'running',   fd.running)}
        ${this._group('SQL', 'SQL Expressions',  'sql',       fd.sql)}
        ${this._group('★',   'Special Fields',   'special',   fd.special)}
      </div>
    `;
    this._attachDrag();
    this._attachToggle();
  },

  _group(icon, label, key, fields) {
    return `
      <div class="fe-group" data-key="${key}">
        <div class="fe-group-hdr" data-groupkey="${key}">
          <span class="fe-arrow">▶</span>
          <span class="fe-gicon">${icon}</span>
          <span>${label}</span>
          <span class="fe-count">${fields.length}</span>
        </div>
        <div class="fe-group-body" id="feg-${key}" style="display:none">
          ${fields.length === 0
            ? '<div class="fe-empty">(none)</div>'
            : fields.map(f => this._field(f, key)).join('')}
        </div>
      </div>`;
  },

  _field(path, group) {
    const name = path.split('.').pop().replace(/[{}]/g,'');
    const icon = { database:'≡', formula:'ƒ', parameter:'?', running:'Σ',
                   sql:'◈', special:'★' }[group] || '·';
    return `
      <div class="fe-field" draggable="true" data-path="${path}" data-group="${group}" title="${path}">
        <span class="fe-ficon">${icon}</span>
        <span class="fe-fname">${name}</span>
        <span class="fe-fpath">${path}</span>
      </div>`;
  },

  _attachDrag() {
    this._el.querySelectorAll('.fe-field').forEach(div => {
      div.addEventListener('dragstart', e => {
        e.dataTransfer.setData('rf/field-path',  div.dataset.path);
        e.dataTransfer.setData('rf/field-group', div.dataset.group);
        e.dataTransfer.effectAllowed = 'copy';
      });
    });
  },

  _attachToggle() {
    this._el.querySelectorAll('.fe-group-hdr').forEach(hdr => {
      hdr.addEventListener('click', () => {
        const key  = hdr.dataset.groupkey;
        const body = document.getElementById(`feg-${key}`);
        const arr  = hdr.querySelector('.fe-arrow');
        if (!body) return;
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        if (arr) arr.textContent = open ? '▶' : '▼';
      });
    });
  },

  filter(q) {
    const lower = q.toLowerCase();
    this._el.querySelectorAll('.fe-field').forEach(div => {
      const match = div.dataset.path.toLowerCase().includes(lower);
      div.style.display = match ? 'flex' : 'none';
    });
    // Expand groups that have matches
    if (q) {
      this._el.querySelectorAll('.fe-group-body').forEach(b => {
        const hasVisible = [...b.querySelectorAll('.fe-field')].some(d=>d.style.display!=='none');
        if (hasVisible) { b.style.display='block'; }
      });
    }
  },

  addFormula() {
    const name = prompt('Formula name:');
    if (!name) return;
    const expr = prompt('Expression (e.g. item.qty * item.unit_price):');
    if (!expr) return;
    const path = `{${name}}`;
    RF.AppState.fieldData.formula.push(path);
    this.render();
    RF.EventBus.emit('status', `Added formula: ${name}`);
  },

  _syncFormulas() {
    // Keep formula list in sync with layout parameters
    const params = RF.AppState.layout.parameters || [];
    RF.AppState.fieldData.parameter = params.map(p => `param.${p.name || p}`);
  },

  /** Called when a field is dropped onto a section body */
  handleDrop(e, sectionId) {
    e.preventDefault();
    const path   = e.dataTransfer.getData('rf/field-path');
    if (!path) return;

    const canPt  = RF.Utils.canvasPoint(e, RF.AppState);
    // Adjust for section body offset
    const body   = document.getElementById(`secbody-${sectionId}`);
    if (!body) return;
    const bRect  = body.getBoundingClientRect();
    const sRect  = document.getElementById('canvas-surface').getBoundingClientRect();
    const bx     = (bRect.left - sRect.left) / RF.AppState.zoom;
    const by     = (bRect.top  - sRect.top)  / RF.AppState.zoom;
    const lx     = RF.Utils.clamp(canPt.x - bx, 0, RF.AppState.layout.pageWidth - 120);
    const ly     = RF.Utils.clamp(canPt.y - by, 0, (RF.AppState.getSectionById(sectionId)?.height||40) - 14);

    RF.History.snapshot('before-drop');
    const isSpecial = path.startsWith('{') || path.startsWith('[');
    const type    = isSpecial ? 'text' : 'field';
    const el      = RF.ElementFactory.create(type, sectionId, lx, ly, {
      fieldPath: type === 'field' ? path : '',
      content:   type === 'text'  ? path : '',
    });
    if (el) {
      RF.Sections.attachNewElement(el);
      RF.EventBus.emit('status', `Added ${type}: ${path}`);
    }
  },
};
