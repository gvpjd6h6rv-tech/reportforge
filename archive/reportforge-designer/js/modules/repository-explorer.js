import RF from '../rf.js';

/**
 * modules/repository-explorer.js — RF.Modules.RepositoryExplorer
 * Layer   : Modules (v4)
 * Purpose : Repository explorer panel. Browse shared/saved report objects
 *           (custom functions, text objects) and drag them onto the canvas.
 * Deps    : none
 */

RF.Modules.RepositoryExplorer = {
  _el: null,
  _visible: false,

  // Default built-in repository items
  _repo: {
    formulas: [
      { name:'GrandTotal',     expr:'Sum({items.total})',             desc:'Sum of all totals' },
      { name:'RecordCount',    expr:'Count({items.id})',              desc:'Total record count' },
      { name:'TaxAmount',      expr:'{items.total} * 0.21',          desc:'21% VAT calculation' },
      { name:'NetAmount',      expr:'{items.total} / 1.21',          desc:'Remove VAT' },
      { name:'DiscountPrice',  expr:'{items.unit_price} * (1 - {discount} / 100)', desc:'Price after discount' },
      { name:'YearMonth',      expr:'Year({items.date}) & "/" & Month({items.date})', desc:'YYYY/MM string' },
      { name:'PageNofM',       expr:'"Page " & PageNumber() & " of " & PageCount()', desc:'Page N of M' },
    ],
    objects: [
      { name:'Company Logo',   type:'image',  desc:'Standard company logo placeholder' },
      { name:'Page Border',    type:'rect',   desc:'Full-page border rectangle' },
      { name:'Header Line',    type:'line',   desc:'Standard section separator line' },
      { name:'Report Title',   type:'text',   desc:'Styled report title text object' },
    ],
    connections: [],
  },

  init() { RF.on(RF.E.REPO_OPEN, ()=>this.toggle()); },

  toggle() {
    this._visible = !this._visible;
    if (this._visible) this._show(); else this._hide();
  },

  _show() {
    if (!this._el) {
      this._el = document.createElement('div');
      this._el.id = 'repo-explorer';
      RF.clear(this._el); this._el.append(RF.html(this._build()));
      document.body.appendChild(this._el);
    } else {
      RF.clear(this._el); this._el.append(RF.html(this._build()));
    }
    this._el.classList.add('show');
  },

  _hide() { this._el?.classList.remove('show'); },

  _build() {
    const r = this._repo;
    return `
    <div class="u-hdr-strip3">
      <span>📦 Repository Explorer</span>
      <button class="u-close-btn2" onclick="RF.Modules.RepositoryExplorer.toggle()">×</button>
    </div>
    <div class="u-scroll-flex">
      <div class="fe-group-hdr active" onclick="this.classList.toggle('active')">📐 Repository Formulas (${r.formulas.length})</div>
      <div class="fe-group-body">
        ${r.formulas.map(f=>`
        <div class="fe-field-item" draggable="true" 
             ondragstart="event.dataTransfer.setData('rf/repo-formula','${f.name}');event.dataTransfer.setData('rf/field-path','{${f.name}}')"
             title="${f.expr}">
          <span class="u-accent">ƒ</span>${f.name}
          <span class="u-subtext-faint">${f.desc.slice(0,20)}</span>
        </div>`).join('')}
        <div class="fe-field-item u-accent u-fs11-cur" onclick="RF.emit(RF.E.FORMULA_OPEN,null)">
          ＋ New Formula…
        </div>
      </div>
      <div class="fe-group-hdr" onclick="this.classList.toggle('active')">⊞ Repository Objects (${r.objects.length})</div>
      <div class="fe-group-body">
        ${r.objects.map(o=>`
        <div class="fe-field-item" draggable="true"
             ondragstart="event.dataTransfer.setData('rf/repo-object','${o.name}');event.dataTransfer.setData('rf/field-type','${o.type}')"
             title="${o.desc}">
          <span class="u-text-amber-c">⊟</span>${o.name}
          <span class="u-subtext-faint">${o.type}</span>
        </div>`).join('')}
      </div>
      <div class="fe-group-hdr" onclick="this.classList.toggle('active')">🗄 Saved Reports (${r.connections.length})</div>
      <div class="fe-group-body u-pad-8-12">
        No saved reports. Connect to a repository to browse.
      </div>
    </div>
    <div class="u-pad-6-top">
      <button class="modal-btn u-input-full" 
              onclick="RF.Modules.RepositoryExplorer._addFormula()">＋ Save current layout to repository</button>
    </div>`;
  },

  _addFormula() {
    const DM = RF.Core.DocumentModel;
    Object.entries(DM.layout.formulas||{}).forEach(([name,expr])=>{
      if (!this._repo.formulas.find(f=>f.name===name)) {
        this._repo.formulas.push({name,expr,desc:'User formula'});
      }
    });
    RF.clear(this._el); this._el.append(RF.html(this._build()));
    RF.emit(RF.E.STATUS,'Formulas synced to repository');
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.SQLEditor — SQL Expression field editor
// ═══════════════════════════════════════════════════════════════════════════
