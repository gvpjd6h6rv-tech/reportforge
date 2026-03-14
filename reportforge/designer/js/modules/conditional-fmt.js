import RF from '../rf.js';

/**
 * modules/conditional-fmt.js — RF.Modules.ConditionalFmt
 * Layer   : Modules (v3)
 * Purpose : Conditional formatting dialog. Define formula-driven style rules
 *           (color, font, visibility) that override element defaults.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.ConditionalFmt = {
  _el: null,
  init() { RF.on(RF.E.COND_FMT_OPEN, elId=>this.open(elId)); },

  open(elId) {
    this._close();
    const el=RF.Core.DocumentModel.getElementById(elId); if(!el) return;
    const conds=el.conditionalStyles||[];
    const fields=RF.Core.DocumentModel.fieldData.database;
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-650">
      <div class="modal-hdr">
        <span>🎨 Conditional Formatting — ${el.id}</span>
        <button class="modal-close" onclick="RF.Modules.ConditionalFmt._close()">×</button>
      </div>
      <div class="modal-body">
        <p class="u-fs11-desc3">Rules applied in order — first match wins.</p>
        <div id="cond-rows">${conds.map((c,i)=>this._row(c,i,fields)).join('')}</div>
        <button class="modal-btn u-mt-8 u-fs-11" onclick="RF.Modules.ConditionalFmt._add('${elId}')">＋ Add Rule</button>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.ConditionalFmt._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.ConditionalFmt.save('${elId}')">Save Rules</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _row(c={},i,fields=[]) {
    return `<div class="cond-row u-sec-row">
      <select class="c-field u-input-mono">
        <option value="">— field —</option>
        ${fields.map(f=>`<option ${c.field===f?'selected':''} value="${f}">${f}</option>`).join('')}
      </select>
      <select class="c-op u-w65-fs11">
        ${['=','!=','>','<','>=','<=','contains','isEmpty'].map(o=>`<option ${c.op===o?'selected':''}>${o}</option>`).join('')}
      </select>
      <input class="c-val u-w-80 u-input" type="text" value="${c.value||''}" placeholder="value">
      <span class="u-section-lbl">→</span>
      <label class="u-subtext2">Text</label>
      <input class="c-color u-btn-sm" type="color" value="${c.color||'#000000'}">
      <label class="u-subtext2">BG</label>
      <input class="c-bgc u-btn-sm"   type="color" value="${c.bgColor||'#ffffff'}">
      <label class="u-flex-gap3 u-fs11-dim"><input class="c-bold"   type="checkbox" ${c.bold?'checked':''}><b>B</b></label>
      <label class="u-flex-gap3 u-fs11-dim"><input class="c-italic" type="checkbox" ${c.italic?'checked':''}><em>I</em></label>
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.cond-row').remove()">×</button>
    </div>`;
  },

  _add(elId) {
    const l=document.getElementById('cond-rows'); if(!l) return;
    const fields=RF.Core.DocumentModel.fieldData.database;
    const d=document.createElement('div'); d.append(RF.html(this._row({},l.children.length,fields)));
    l.appendChild(d.firstElementChild);
  },

  save(elId) {
    const conds=[];
    document.querySelectorAll('#cond-rows .cond-row').forEach(r=>{
      const field=r.querySelector('.c-field')?.value; if(!field) return;
      conds.push({field,op:r.querySelector('.c-op')?.value||'=',value:r.querySelector('.c-val')?.value||'',
        color:r.querySelector('.c-color')?.value,bgColor:r.querySelector('.c-bgc')?.value,
        bold:r.querySelector('.c-bold')?.checked,italic:r.querySelector('.c-italic')?.checked});
    });
    RF.H.snapshot('before-cond-fmt');
    RF.Core.DocumentModel.updateElement(elId,{conditionalStyles:conds});
    RF.RP.syncElement(RF.Core.DocumentModel.getElementById(elId));
    RF.emit(RF.E.STATUS,`Conditional rules: ${conds.length}`);
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Section Expert ────────────────────────────────────────────────────────────
