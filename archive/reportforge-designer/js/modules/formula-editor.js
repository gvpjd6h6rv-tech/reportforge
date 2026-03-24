import RF from '../rf.js';

/**
 * modules/formula-editor.js — RF.Modules.FormulaEditor
 * Layer   : Modules (v3)
 * Purpose : Formula editor modal dialog. Expression input textarea, field
 *           reference tree, and built-in function list.
 * Deps    : RF.Classic.Explorer, RF.Core.DocumentModel
 */

RF.Modules.FormulaEditor = {
  _el: null,
  FUNCS: ['sum(','avg(','count(','max(','min(','round(','ceil(','floor(',
          'if(','iif(','not(','and(','or(','contains(','startsWith(','endsWith(',
          'len(','substr(','trim(','upper(','lower(','replace(','split(',
          'toDate(','dateAdd(','dateDiff(','year(','month(','day(',
          'toString(','toNumber(','isNull(','isEmpty(','coalesce('],

  init() { RF.on(RF.E.FORMULA_OPEN, p => this.open(p)); },

  open(existing=null) {
    this._close();
    const fd = RF.Core.DocumentModel.fieldData;
    const allF = [...fd.database,...fd.parameter,...fd.running,...fd.special];
    const ops  = ['+','-','*','/','%','==','!=','>','<','>=','<=','&&','||','!','?:','??'];

    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-700">
      <div class="modal-hdr">
        <span class="u-accent u-mono">ƒ</span>
        <span>Formula Workshop</span>
        <button class="modal-close" onclick="RF.Modules.FormulaEditor._close()">×</button>
      </div>
      <div class="modal-body">
        <div class="pi-row u-mb-8">
          <label class="u-mw-90">Formula name</label>
          <input id="fw-name" type="text" placeholder="e.g. TotalWithTax" class="u-input-mono">
          <span class="u-fs10-dim-ml6">Referenced as {name}</span>
        </div>
        <div class="u-fs11-dim">Expression</div>
        <textarea class="formula-area" id="fw-expr" placeholder="e.g. {items.qty} * {items.unit_price} * 1.21">${existing||''}</textarea>
        <div id="fw-err" class="formula-error u-hidden"></div>
        <div id="fw-ok" class="formula-syntax">Syntax OK ✓</div>
        <div class="formula-helper">
          <div class="u-flex-1-mw0">
            <div class="u-section-lbl">Fields &amp; Parameters</div>
            <div class="formula-fields">${allF.map(f=>`)<div class="formula-field-item" onclick="RF.Modules.FormulaEditor.ins('${f.replace(/'/g,"\\'")}')"><span class="u-text-primary-c u-fs-10">≡</span>${f}</div>`).join('')}</div>
          </div>
          <div class="u-flex-0-160">
            <div class="u-section-lbl">Functions</div>
            <div class="formula-ops">${this.FUNCS.map(f=>`<div class="formula-op-item" title="${f}" onclick="RF.Modules.FormulaEditor.ins('${f}')">${f}</div>`).join('')}</div>
          </div>
          <div class="u-flex-0-100">
            <div class="u-section-lbl">Operators</div>
            <div class="formula-ops">${ops.map(o=>`<div class="formula-op-item" onclick="RF.Modules.FormulaEditor.ins(' ${o} ')">${o}</div>`).join('')}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.FormulaEditor._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.FormulaEditor.save()">Add Formula</button>
      </div>
    </div>`));
    document.body.appendChild(ov);
    this._el = ov;
    document.getElementById('fw-expr')?.addEventListener('input', ()=>this._validate());
    document.getElementById('fw-name')?.focus();
  },

  ins(text) {
    const ta = document.getElementById('fw-expr'); if(!ta) return;
    const s=ta.selectionStart, e=ta.selectionEnd;
    ta.value = ta.value.slice(0,s)+text+ta.value.slice(e);
    ta.selectionStart = ta.selectionEnd = s+text.length;
    ta.focus(); this._validate();
  },

  _validate() {
    const expr = document.getElementById('fw-expr')?.value||'';
    const ok = document.getElementById('fw-ok');
    const err = document.getElementById('fw-err');
    let d=0; for(const c of expr){if(c==='(')d++;else if(c===')')d--;if(d<0)break;}
    if (ok) { ok.textContent=d===0?'Syntax OK ✓':'⚠ Unbalanced parentheses'; ok.classList.toggle('u-accent', d===0); ok.classList.toggle('u-text-amber-c', d!==0); }
    if (err) err.classList.add('u-hidden');
  },

  save() {
    const name=(document.getElementById('fw-name')?.value||'').trim();
    const expr=(document.getElementById('fw-expr')?.value||'').trim();
    const err=document.getElementById('fw-err');
    if (!name){if(err){err.textContent='Formula name required';err.classList.remove('u-hidden');} return;}
    if (!expr){if(err){err.textContent='Expression required';err.classList.remove('u-hidden');}  return;}
    RF.H.snapshot('before-formula');
    const path=`{${name}}`;
    const fd=RF.Core.DocumentModel.fieldData;
    if(!fd.formula.includes(path)) fd.formula.push(path);
    if(!RF.Core.DocumentModel.layout.formulas) RF.Core.DocumentModel.layout.formulas={};
    RF.Core.DocumentModel.layout.formulas[name]=expr;
    RF.Core.DocumentModel.isDirty=true;
    RF.Classic.Explorer.render();
    RF.emit(RF.E.STATUS,`Formula added: ${name} = ${expr.slice(0,40)}…`);
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Parameters Panel ──────────────────────────────────────────────────────────
