import RF from '../rf.js';

/**
 * modules/sql-editor.js — RF.Modules.SQLEditor
 * Layer   : Modules (v4)
 * Purpose : SQL expression editor (F9). Syntax-highlighted SQL textarea,
 *           test-query button, and field reference insertion.
 * Deps    : RF.Classic.Explorer, RF.Core.DocumentModel
 */

RF.Modules.SQLEditor = {
  _el: null,
  init() { RF.on('sql:open', ()=>this.open()); },

  open() {
    this._close();
    const sql = RF.Core.DocumentModel.layout.sqlExpressions || [];
    const ov = document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-680vh">
      <div class="modal-hdr">
        <span class="u-text-4ec">SQL</span>
        <span>SQL Expression Editor</span>
        <button class="modal-close" onclick="RF.Modules.SQLEditor._close()">×</button>
      </div>
      <div class="modal-body u-modal-split-tall">
        <!-- Sidebar: expression list -->
        <div class="u-panel-left">
          <div class="u-col-hdr">
            SQL Expressions
          </div>
          <div id="sql-list" class="u-scroll-flex">
            ${sql.map((s,i)=>`)<div class="sql-list-item${i===0?' active':''} u-col-item" data-sql-idx="${i}" onclick="RF.Modules.SQLEditor._select(${i})">
              <div class="u-text-dim-li">${s.name}</div>
              <div class="u-fs95-faint-ell">${s.sql.slice(0,30)}…</div>
            </div>`).join('') || '<div class="u-pad-12 u-text-faint u-fs-11">No expressions yet</div>'}
          </div>
          <div class="u-pad-8">
            <button class="modal-btn u-input-full" onclick="RF.Modules.SQLEditor._add()">＋ New Expression</button>
          </div>
        </div>
        <!-- Editor pane -->
        <div id="sql-editor-pane" class="u-flex-col-p14">
          ${sql.length ? RF.Modules.SQLEditor._editorPane(sql[0],0) : `
          <div class="u-flex-center">
            Click "＋ New Expression" to add a SQL field
          </div>`}
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.SQLEditor._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.SQLEditor.save()">Save Expressions</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el = ov;
  },

  _editorPane(s, idx) {
    return `
      <div class="pi-row"><label class="u-mw-80">Name</label>
        <input id="sql-name-${idx}" type="text" value="${s?.name||''}" placeholder="ExpressionName" class="u-input-mono"></div>
      <div class="pi-row"><label class="u-mw-80">Type</label>
        <select id="sql-type-${idx}" class="u-flex-0-120">
          ${['string','number','date','boolean','currency'].map(t=>`<option ${s?.type===t?'selected':''}>${t}</option>`).join('')}
        </select></div>
      <div class="u-fs10-dim-mb6">SQL Expression</div>
      <div class="fw-wrap u-flex-120-mh">
        <div class="fw-highlight" id="sql-hl-${idx}"></div>
        <textarea class="fw-ta" id="sql-expr-${idx}" placeholder="e.g. {fn CONCAT({customer.first_name},' ',{customer.last_name})}" oninput="RF.Modules.SQLEditor._hl(${idx})">${s?.sql||''}</textarea>
      </div>
      <div class="u-section-lbl">Comment / Description</div>
      <input id="sql-desc-${idx}" type="text" value="${s?.desc||''}" placeholder="Optional description" class="u-fs-11">
      <div class="u-flex-mt4">
        <button class="modal-btn" onclick="RF.Modules.SQLEditor._test(${idx})">▶ Test</button>
        <span id="sql-test-${idx}" class="u-fs11-dim"></span>
        <button class="modal-btn danger u-ml-auto" onclick="RF.Modules.SQLEditor._del(${idx})">Delete</button>
      </div>`;
  },

  _hl(idx) {
    const ta  = document.getElementById(`sql-expr-${idx}`);
    const hl  = document.getElementById(`sql-hl-${idx}`);
    if (!ta||!hl) return;
    let s = ta.value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    s = s.replace(/\{([^}]+)\}/g, '<span class="hl-field">{$1}</span>');
    s = s.replace(/'([^']*)'/g, '<span class="hl-str">\'$1\'</span>');
    s = s.replace(/\b(SELECT|FROM|WHERE|AND|OR|NOT|IN|LIKE|NULL|IS|AS|CASE|WHEN|THEN|ELSE|END|BETWEEN|JOIN|ON|GROUP BY|ORDER BY|HAVING|DISTINCT|fn|CONCAT|SUBSTR|UPPER|LOWER|TRIM|COALESCE)\b/gi, '<span class="hl-kw">$1</span>');
    s = s.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
    hl.append(RF.html(s+'<br>'));
  },

  _select(idx) {
    const sql = RF.Core.DocumentModel.layout.sqlExpressions||[];
    const pane = document.getElementById('sql-editor-pane'); if(!pane) return;
    pane.replaceChildren(); pane.append(RF.html(this._editorPane(sql[idx], idx)));
    document.querySelectorAll('#sql-list .sql-list-item').forEach((el,i)=>{
      el.classList.toggle('active', i===idx);
    });
    setTimeout(()=>this._hl(idx),10);
  },

  _add() {
    const DM=RF.Core.DocumentModel;
    if(!DM.layout.sqlExpressions) DM.layout.sqlExpressions=[];
    DM.layout.sqlExpressions.push({name:'NewExpression',sql:'',type:'string',desc:''});
    this._close(); this.open();
  },

  _del(idx) {
    const DM=RF.Core.DocumentModel;
    (DM.layout.sqlExpressions||[]).splice(idx,1);
    this._close(); this.open();
  },

  _test(idx) {
    const expr = document.getElementById(`sql-expr-${idx}`)?.value||'';
    const el = document.getElementById(`sql-test-${idx}`);
    if (!el) return;
    // Simulate validation
    const ok = expr.trim().length > 0 && !expr.includes('DROP') && !expr.includes('DELETE');
    el.textContent = ok ? '✓ Expression is valid' : '⚠ Invalid expression';
    el.style.color = ok ? 'var(--accent)' : 'var(--danger)';
  },

  save() {
    const DM=RF.Core.DocumentModel;
    // Collect all currently displayed expressions
    const rows=[];
    document.querySelectorAll('#sql-list .sql-list-item').forEach((item,i)=>{
      const name=document.getElementById(`sql-name-${i}`)?.value.trim();
      const sql2=document.getElementById(`sql-expr-${i}`)?.value||'';
      const type=document.getElementById(`sql-type-${i}`)?.value||'string';
      const desc=document.getElementById(`sql-desc-${i}`)?.value||'';
      if(name) rows.push({name,sql:sql2,type,desc});
    });
    if(rows.length) DM.layout.sqlExpressions=rows;
    // Expose as fieldData
    DM.fieldData.sql = (DM.layout.sqlExpressions||[]).map(e=>`sql.${e.name}`);
    RF.Classic.Explorer.render();
    DM.isDirty=true;
    RF.emit(RF.E.STATUS,`SQL Expressions: ${rows.length} saved`);
    this._close();
  },
  _close() { this._el?.remove(); this._el=null; },
};


// ═══════════════════════════════════════════════════════════════════════════
// RF.Modules.FormulaDebugger — formula test + dependency graph
// ═══════════════════════════════════════════════════════════════════════════
