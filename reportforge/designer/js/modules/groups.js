import RF from '../rf.js';

/**
 * modules/groups.js — RF.Modules.Groups
 * Layer   : Modules (v3)
 * Purpose : Group/sort dialog. Configure grouping fields, sort direction,
 *           and group header/footer options.
 * Deps    : RF.Core.DocumentModel
 */

RF.Modules.Groups = {
  _el: null,
  init() { RF.on(RF.E.GROUPS_OPEN, ()=>this.open()); },

  open() {
    this._close();
    const layout  = RF.Core.DocumentModel.layout;
    const groups  = layout.groups||[];
    const sortBy  = layout.sortBy||[];
    const ov=document.createElement('div'); ov.className='modal-overlay';
    ov.append(RF.html(`
    <div class="modal u-modal-w-560">
      <div class="modal-hdr">
        <span>▼ Group Expert</span>
        <button class="modal-close" onclick="RF.Modules.Groups._close()">×</button>
      </div>
      <div class="modal-body u-modal-split2col20">
        <div>
          <div class="section-subtitle">Group By Fields</div>
          <p class="u-modal-desc2">Each group creates GH/GF section bands.</p>
          <div id="grp-rows">${groups.map((g,i)=>this._gRow(g,i)).join('')}</div>
          <button class="modal-btn u-mt-8 u-fs-11" onclick="RF.Modules.Groups._addG()">＋ Add Group</button>
        </div>
        <div>
          <div class="section-subtitle">Sort Expert</div>
          <p class="u-modal-desc2">Applied before grouping.</p>
          <div id="srt-rows">${sortBy.map((s,i)=>this._sRow(s,i)).join('')}</div>
          <button class="modal-btn u-mt-8 u-fs-11" onclick="RF.Modules.Groups._addS()">＋ Add Sort</button>
        </div>
      </div>
      <div class="modal-footer">
        <button class="modal-btn" onclick="RF.Modules.Groups._close()">Cancel</button>
        <button class="modal-btn primary" onclick="RF.Modules.Groups.save()">Apply</button>
      </div>
    </div>`));
    document.body.appendChild(ov); this._el=ov;
  },

  _gRow(g={}) {
    return `<div class="group-row u-flex-row-mb5">
      <input type="text" class="g-field u-input-mono" placeholder="field.path" value="${g.field||''}">
      <select class="g-dir u-input-w90">
        <option ${!g.sortDesc?'selected':''} value="asc">↑ Asc</option>
        <option ${g.sortDesc?'selected':''}  value="desc">↓ Desc</option>
      </select>
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.group-row').remove()">×</button>
    </div>`;
  },

  _sRow(s={}) {
    return `<div class="sort-row u-flex-row-mb5">
      <input type="text" class="s-field u-input-mono" placeholder="field.path" value="${s.field||''}">
      <select class="s-dir u-input-w90">
        <option ${!s.desc?'selected':''} value="asc">↑ Asc</option>
        <option ${s.desc?'selected':''}  value="desc">↓ Desc</option>
      </select>
      <button class="pi-cond-rm u-btn-rm" onclick="this.closest('.sort-row').remove()">×</button>
    </div>`;
  },

  _addG() { const l=document.getElementById('grp-rows');if(!l)return;const d=document.createElement('div');d.append(RF.html(this._gRow()));l.appendChild(d.firstElementChild); },
  _addS() { const l=document.getElementById('srt-rows');if(!l)return;const d=document.createElement('div');d.append(RF.html(this._sRow()));l.appendChild(d.firstElementChild); },

  save() {
    const groups=[],sortBy=[];
    document.querySelectorAll('#grp-rows .group-row').forEach(r=>{
      const f=r.querySelector('.g-field')?.value.trim(); if(!f) return;
      groups.push({field:f,sortDesc:r.querySelector('.g-dir')?.value==='desc',label:''});
    });
    document.querySelectorAll('#srt-rows .sort-row').forEach(r=>{
      const f=r.querySelector('.s-field')?.value.trim(); if(!f) return;
      sortBy.push({field:f,desc:r.querySelector('.s-dir')?.value==='desc'});
    });
    RF.H.snapshot('before-groups');
    const layout=RF.Core.DocumentModel.layout;
    const prev=(layout.groups||[]).length;
    layout.groups=groups; layout.sortBy=sortBy;
    // Sync GH/GF section bands
    layout.sections=layout.sections.filter(s=>(s.stype!=='gh'&&s.stype!=='gf')||s.groupIndex<groups.length);
    for(let i=prev;i<groups.length;i++){
      const phIdx=layout.sections.findIndex(s=>s.stype==='det');
      const _mkSec=(st,lbl)=>({id:RF.uid(st),stype:st,label:lbl,height:24,iterates:null,groupIndex:i,canGrow:false,canShrink:false,repeatOnNewPage:false,pageBreakBefore:false,bgColor:'transparent'});
      layout.sections.splice(phIdx,0,_mkSec('gh',`Group Header ${i+1}`));
      const pfIdx=layout.sections.findIndex(s=>s.stype==='pf');
      layout.sections.splice(pfIdx,0,_mkSec('gf',`Group Footer ${i+1}`));
    }
    RF.Core.DocumentModel.isDirty=true;
    RF.RP.fullRender();
    RF.emit(RF.E.STATUS,`Groups: ${groups.length}  Sort fields: ${sortBy.length}`);
    this._close();
  },

  _close() { this._el?.remove(); this._el=null; },
};

// ── Filters ───────────────────────────────────────────────────────────────────
