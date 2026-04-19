'use strict';

const FormulaEditorDialog = {
  _el: null,
  open(existingName='', existingExpr=''){
    this.close();
    const funcs = FormulaEngine.getFunctions();
    const fields = this._getFields();
    const ops = ['+','-','*','/','&','=','<>','>','<','>=','<=','And','Or','Not'];
    const ov = document.createElement('div');
    ov.id='formula-editor-overlay';
    ov.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9900;display:flex;align-items:center;justify-content:center;';
    const dlg=document.createElement('div');
    dlg.style.cssText='background:#ECE9D8;border:2px solid #0A246A;width:720px;max-height:85vh;display:flex;flex-direction:column;font-family:Tahoma,sans-serif;font-size:11px;box-shadow:4px 4px 16px rgba(0,0,0,.5);';
    const hdr=document.createElement('div');
    hdr.style.cssText='background:linear-gradient(#1C52A0,#3A6EA5);color:#FFF;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;';
    hdr.innerHTML='<span style="font-weight:bold">ƒ Formula Workshop — Crystal Reports Syntax</span>';
    const closeBtn=document.createElement('button');
    closeBtn.textContent='✕';closeBtn.style.cssText='color:#FFF;font-size:14px;background:none;border:none;cursor:pointer;padding:0 4px;';
    closeBtn.onclick=()=>this.close();
    hdr.appendChild(closeBtn); dlg.appendChild(hdr);
    const body=document.createElement('div');
    body.style.cssText='padding:8px;display:flex;flex-direction:column;gap:6px;overflow-y:auto;flex:1;';
    const nameRow=document.createElement('div');
    nameRow.style.cssText='display:flex;align-items:center;gap:8px;';
    nameRow.innerHTML='<span style="width:94px;font-weight:bold;">Formula name:</span>';
    const nameInput=document.createElement('input');
    nameInput.type='text';nameInput.id='fe-name';nameInput.value=existingName;
    nameInput.placeholder='e.g. Formula_TotalConIVA';
    nameInput.style.cssText='flex:1;font-family:Courier New,monospace;font-size:11px;padding:2px 4px;border:1px inset #ACA899;';
    const nameHint=document.createElement('span');
    nameHint.style.cssText='font-size:10px;color:#666;flex-shrink:0;';
    nameHint.textContent='Referenced as {FormulaName}';
    nameRow.appendChild(nameInput);nameRow.appendChild(nameHint); body.appendChild(nameRow);
    const exprLabel=document.createElement('div');
    exprLabel.style.cssText='display:flex;align-items:center;justify-content:space-between;';
    exprLabel.innerHTML='<span style="font-weight:bold">Expression:</span>';
    const validBadge=document.createElement('span');
    validBadge.id='fe-valid';validBadge.style.cssText='font-size:10px;padding:1px 6px;border-radius:2px;';
    exprLabel.appendChild(validBadge); body.appendChild(exprLabel);
    const ta=document.createElement('textarea');
    ta.id='fe-expr';ta.value=existingExpr;
    ta.placeholder='Example: {items.qty} * {items.price} * 1.21\nIIf({total} > 1000, "Large", "Small")';
    ta.style.cssText='width:100%;height:90px;font-family:Courier New,monospace;font-size:12px;padding:4px;border:1px inset #ACA899;resize:vertical;';
    body.appendChild(ta);
    const helper=document.createElement('div');
    helper.style.cssText='display:flex;gap:8px;max-height:200px;';
    const mkCol=(title,items,onClick)=>{const c=document.createElement('div');c.style.cssText='flex:1;min-width:0;border:1px inset #ACA899;background:#FFF;display:flex;flex-direction:column;';const lbl=document.createElement('div');lbl.style.cssText='background:#0A246A;color:#FFF;padding:2px 4px;font-size:10px;font-weight:bold;flex-shrink:0;';lbl.textContent=title;const list=document.createElement('div');list.style.cssText='overflow-y:auto;flex:1;';items.forEach(item=>{const d=document.createElement('div');d.textContent=item;d.style.cssText='padding:1px 4px;cursor:pointer;font-size:10px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';d.title=item;d.style.color='#000';d.onmouseenter=()=>{d.style.background='#316AC5';d.style.color='#FFF';};d.onmouseleave=()=>{d.style.background='';d.style.color='#000';};d.onclick=()=>onClick(item);list.appendChild(d);});c.appendChild(lbl);c.appendChild(list);return c;};
    const ins=(text)=>{const s=ta.selectionStart,e=ta.selectionEnd;ta.value=ta.value.slice(0,s)+text+ta.value.slice(e);ta.selectionStart=ta.selectionEnd=s+text.length;ta.focus();this._validate();};
    helper.appendChild(mkCol('Fields & Parameters', fields, f=>ins(`{${f}}`)));
    helper.appendChild(mkCol('Functions', funcs, f=>ins(f+'(')));
    helper.appendChild(mkCol('Operators', ops, o=>ins(` ${o} `)));
    body.appendChild(helper);
    const timingRow=document.createElement('div');
    timingRow.style.cssText='display:flex;align-items:center;gap:8px;font-size:10px;color:#666;';
    timingRow.innerHTML='<span>Evaluation timing:</span>';
    ['WhileReadingRecords','WhilePrintingRecords'].forEach(t=>{const btn=document.createElement('button');btn.textContent=t;btn.style.cssText='padding:1px 6px;font-size:10px;cursor:pointer;border:1px solid #ACA899;background:#D4D0C8;';btn.onclick=()=>{ const cv=ta.value; ta.value=(cv?cv+'\n':'')+t+';'; ta.focus(); this._validate(); };timingRow.appendChild(btn);});
    body.appendChild(timingRow); dlg.appendChild(body);
    const ftr=document.createElement('div');
    ftr.style.cssText='padding:6px 8px;border-top:1px solid #ACA899;display:flex;justify-content:flex-end;gap:6px;flex-shrink:0;background:#D4D0C8;';
    const btnCancel=document.createElement('button');btnCancel.textContent='Cancel';btnCancel.style.cssText='padding:2px 16px;border:2px solid #716F64;background:#D4D0C8;cursor:pointer;font-family:Tahoma;font-size:11px;';btnCancel.onclick=()=>this.close();
    const btnSave=document.createElement('button');btnSave.textContent='Add Formula';btnSave.style.cssText='padding:2px 16px;border:2px solid #0A246A;background:#1C52A0;color:#FFF;cursor:pointer;font-family:Tahoma;font-size:11px;font-weight:bold;';btnSave.onclick=()=>this.save();
    ftr.appendChild(btnCancel);ftr.appendChild(btnSave); dlg.appendChild(ftr);
    ov.appendChild(dlg); document.body.appendChild(ov); this._el=ov;
    ta.addEventListener('input',()=>this._validate()); nameInput.focus(); this._validate();
  },
  _getFields(){const out=[];const walk=(node)=>{if(!node)return;if(node.path){out.push(node.path);return;}for(const[k,v]of Object.entries(node)){if(k==='label'||k==='icon')continue;if(typeof v==='object'&&v!==null)walk(v);}};if(typeof FIELD_TREE!=='undefined'){const db=FIELD_TREE.database?.children||FIELD_TREE.database||{};walk(db);}Object.keys(DS.formulas||{}).forEach(nm=>out.push(nm));return out;},
  _validate(){const expr=(document.getElementById('fe-expr')?.value||'').trim();const badge=document.getElementById('fe-valid');if(!badge)return;if(!expr){badge.textContent='';badge.style.background='';return;}const r=FormulaEngine.validate(expr);if(r.valid){badge.textContent='✓ Syntax OK';badge.style.cssText='font-size:10px;padding:1px 6px;border-radius:2px;background:#1E5F4A;color:#FFF;';}else{badge.textContent='⚠ '+r.error;badge.style.cssText='font-size:10px;padding:1px 6px;border-radius:2px;background:#7D1F1F;color:#FFF;';}},
  save(){const name=(document.getElementById('fe-name')?.value||'').trim();const expr=(document.getElementById('fe-expr')?.value||'').trim();if(!name){alert('Formula name required');return;}if(!expr){alert('Expression required');return;}const r=FormulaEngine.validate(expr);if(!r.valid){if(!confirm('Syntax warning: '+r.error+'\n\nSave anyway?'))return;}DS.saveHistory();if(!DS.formulas) DS.formulas={};DS.formulas[name]=expr;if(FIELD_TREE&&FIELD_TREE.formula){FIELD_TREE.formula.children=FIELD_TREE.formula.children||{};FIELD_TREE.formula.children[name]={path:name,label:name,vtype:'formula'};}FieldExplorerEngine.init();document.getElementById('sb-msg').textContent=`Formula added: ${name}`;this.close();},
  close(){ this._el?.remove(); this._el=null; },
};

window.FormulaEditorDialog = FormulaEditorDialog;
