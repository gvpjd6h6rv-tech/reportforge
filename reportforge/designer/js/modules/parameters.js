import RF from '../rf.js';

/**
 * modules/parameters.js — RF.Modules.Parameters
 * Layer   : Modules (v3)
 * Purpose : Report parameters dialog. Define, edit, and delete named input
 *           parameters with type, prompt, and default value.
 * Deps    : RF.Classic.Explorer, RF.Core.DocumentModel
 */

RF.Modules.Parameters = {
  _el: null,
  init() { RF.on(RF.E.PARAMS_OPEN, ()=>this.open()); },

  open() {
    this._close();
    const params = RF.Core.DocumentModel.layout.parameters||[];
    const ov = document.createElement('div');
    ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal modal-w-640">
      <div class="modal-hdr">
        <span class="u-accent">{?}</span>
        <span>Parameter Panel</span>
        <button class="modal-close" onclick="RF.Modules.Parameters._close()">×</button>
      </div>
      <div class="modal-body">
        <p class="u-modal-desc">
          Parameters are passed at render time. Reference them as <code>param.name</code>.
        </p>
        <div class="u-grid-params u-grid-params-hdr">
          <span>Name</span><span>Type</span><span>Default Value</span><span>Prompt Label</span><span></span>
        </div>
        <div id="pm-rows">${params.map((p,i)=>this._row(p,i)).join('')}</div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Parameters._add()">＋ Add Parameter</button>
        <div class="u-flex-1"></div>
        <button class="modal-btn" onclick="RF.Modules.Parameters._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Parameters.save()">Save</button>
      </div>
    </div>`));
    document.body.appendChild(ov);
    this._el=ov;
  },

  _row(p={}) {
    return `<div class="param-row u-grid-params u-grid-params-row">
      <input type="text" class="p-name u-mono"    placeholder="paramName"     value="${p.name||''}"       >
      <select class="p-type u-fs-11">${['string','number','date','boolean'].map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}</select>
      <input type="text" class="p-default u-fs-11" placeholder="default value"  value="${p.defaultValue||''}">
      <input type="text" class="p-prompt u-fs-11"  placeholder="Prompt text"    value="${p.prompt||''}"     >
      <button class="pi-cond-rm u-btn-rm2" onclick="this.closest('.param-row').remove()">×</button>
    </div>`;
  },

  _add() {
    const list=document.getElementById('pm-rows'); if(!list) return;
    const d=document.createElement('div'); d.append(RF.html(this._row({})));
    list.appendChild(d.firstElementChild);
  },

  save() {
    const params=[];
    document.querySelectorAll('#pm-rows .param-row').forEach(r=>{
      const name=r.querySelector('.p-name')?.value.trim(); if(!name) return;
      params.push({name,type:r.querySelector('.p-type')?.value||'string',
        defaultValue:r.querySelector('.p-default')?.value||'',
        prompt:r.querySelector('.p-prompt')?.value||name});
    });
    RF.H.snapshot('before-params');
    RF.Core.DocumentModel.layout.parameters=params;
    RF.Core.DocumentModel.fieldData.parameter=params.map(p=>`param.${p.name}`);
    RF.Core.DocumentModel.isDirty=true;
    RF.Classic.Explorer.render();
    RF.emit(RF.E.LAYOUT_CHANGED);
    RF.emit(RF.E.STATUS,`Parameters: ${params.length} saved`);
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Group Expert ──────────────────────────────────────────────────────────────
