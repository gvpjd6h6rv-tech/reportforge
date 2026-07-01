'use strict';

const PropertiesEngine = {
  render(){
    const form=document.getElementById('props-form');
    const empty=document.getElementById('props-empty');
    const sel=DS.getSelectedElements();
    if(sel.length===0){
      form.classList.add('hidden');empty.style.display='block';return;
    }
    empty.style.display='none';form.classList.remove('hidden');
    const el=sel[0];
    form.innerHTML='';
    this._buildForm(form,el,sel);
  },
  _buildForm(form,el,sel){
    const multi=sel.length>1;
    const h=v=>`<span style="color:#999;font-size:9px">${v}</span>`;

    const typeRow=this._row('Tipo:',`<span style="font-weight:bold;color:#003">${{field:'Campo',text:'Texto',line:'Línea',rect:'Rectángulo',image:'Imagen'}[el.type]||el.type}</span>${multi?h(` +${sel.length-1} más`):''}`,false);
    form.appendChild(typeRow);

    if(!multi){
      if(el.type==='field'){
        form.appendChild(this._inputRow('Ruta:','prop-field-path',el.fieldPath,'text','fieldPath'));
        const fmtSel=this._selectRow('Formato:','prop-field-fmt',
          ['','currency','float2','float6','date','datetime','ruc_mask','clave_acceso','forma_pago','upper'],
          el.fieldFmt||'','fieldFmt');
        form.appendChild(fmtSel);
      }
      if(el.type==='text'){
        form.appendChild(this._inputRow('Texto:','prop-text-content',el.content,'text','content'));
      }
      if(el.type==='barcode'){
        form.appendChild(this._selectRow('Tipo código:','prop-barcode-type',
          ['code128','code39','qr'],el.barcodeType||'code128','barcodeType',
          ['Code 128','Code 39','QR Code']));
        const stRow=document.createElement('div');stRow.className='prop-check-row';
        stRow.innerHTML=`<label class="prop-check-label"><input type="checkbox" id="prop-barcode-showtext"${el.showText!==false?' checked':''}> Mostrar texto</label>`;
        form.appendChild(stRow);
        setTimeout(()=>{
          document.getElementById('prop-barcode-showtext')?.addEventListener('change',e=>{
            const el=DS.getSelectedElements()[0];if(!el)return;
            el.showText=e.target.checked;
            _canonicalCanvasWriter().updateElement(el.id);DS.saveHistory();
          });
        },0);
      }
    }

    const div1=document.createElement('div');div1.className='prop-section';div1.id='props-general-anchor';div1.textContent='Posición y tamaño';
    form.appendChild(div1);

    const pos=document.createElement('div');
    pos.innerHTML=`
      <div class="prop-row-4">
        <div><div style="font-size:9px;color:#666;text-align:center">X</div><input class="prop-num" id="prop-x" type="number" value="${el.x}" min="0"></div>
        <div><div style="font-size:9px;color:#666;text-align:center">Y</div><input class="prop-num" id="prop-y" type="number" value="${el.y}" min="0"></div>
        <div><div style="font-size:9px;color:#666;text-align:center">W</div><input class="prop-num" id="prop-w" type="number" value="${el.w}" min="1"></div>
        <div><div style="font-size:9px;color:#666;text-align:center">H</div><input class="prop-num" id="prop-h" type="number" value="${el.h}" min="1"></div>
      </div>`;
    form.appendChild(pos);
    ['prop-x','prop-y','prop-w','prop-h'].forEach((id,i)=>{
      const keys=['x','y','w','h'];
      document.getElementById(id)?.addEventListener('change',e=>{
        const v=parseInt(e.target.value)||0;
        sel.forEach(s=>{s[keys[i]]=Math.max(0,v);_canonicalCanvasWriter().updateElementPosition(s.id);});
        SelectionEngine.renderHandles();DS.saveHistory();
      });
    });

    const secRow=this._selectRow('Sección:','prop-section',
      DS.sections.map(s=>s.id),el.sectionId,'sectionId',
      DS.sections.map(s=>s.label));
    form.appendChild(secRow);

    const div2=document.createElement('div');div2.className='prop-section';div2.id='props-format-anchor';div2.textContent='Fuente';
    form.appendChild(div2);

    const fontRow=document.createElement('div');fontRow.className='prop-row';
    fontRow.innerHTML=`
      <span class="prop-label" style="width:auto">Fuente:</span>
      <select class="prop-select" id="prop-font-family" style="flex:2">
        ${CFG.FONTS.map(f=>`<option${f===el.fontFamily?' selected':''}>${f}</option>`).join('')}
      </select>
      <select class="prop-select" id="prop-font-size" style="width:38px">
        ${CFG.FONT_SIZES.map(s=>`<option${s===el.fontSize?' selected':''}>${s}</option>`).join('')}
      </select>`;
    form.appendChild(fontRow);
    document.getElementById('prop-font-family')?.addEventListener('change',e=>{
      sel.forEach(s=>{s.fontFamily=e.target.value;_canonicalCanvasWriter().updateElement(s.id);});
      DS.saveHistory();FormatEngine.updateToolbar();
    });
    document.getElementById('prop-font-size')?.addEventListener('change',e=>{
      sel.forEach(s=>{s.fontSize=parseInt(e.target.value);_canonicalCanvasWriter().updateElement(s.id);});
      DS.saveHistory();FormatEngine.updateToolbar();
    });

    const styleRow=document.createElement('div');styleRow.className='prop-check-row';
    styleRow.innerHTML=`
      <label class="prop-check-label"><input type="checkbox" id="prop-bold"${el.bold?' checked':''}> <b>N</b></label>
      <label class="prop-check-label"><input type="checkbox" id="prop-italic"${el.italic?' checked':''}> <i>K</i></label>
      <label class="prop-check-label"><input type="checkbox" id="prop-underline"${el.underline?' checked':''}> <u>S</u></label>`;
    form.appendChild(styleRow);
    ['prop-bold','prop-italic','prop-underline'].forEach((id,i)=>{
      const keys=['bold','italic','underline'];
      document.getElementById(id)?.addEventListener('change',e=>{
        sel.forEach(s=>{s[keys[i]]=e.target.checked;_canonicalCanvasWriter().updateElement(s.id);});
        DS.saveHistory();FormatEngine.updateToolbar();
      });
    });

    const divTextSec=document.createElement('div');divTextSec.className='prop-section';divTextSec.textContent='Texto';
    form.appendChild(divTextSec);

    const alignRow=document.createElement('div');alignRow.className='prop-row';
    alignRow.innerHTML=`<span class="prop-label">H:</span>
      <div style="display:flex;gap:2px">
        ${['left','center','right'].map(a=>`<button class="tb-icon${el.align===a?' active':''}" style="width:18px;height:16px;font-size:10px" data-prop-align="${a}" title="${a==='left'?'Texto izquierda':a==='center'?'Texto centro':'Texto derecha'}">${a==='left'?'⬱':a==='center'?'≡':'⬰'}</button>`).join('')}
      </div>`;
    form.appendChild(alignRow);
    form.querySelectorAll('[data-prop-align]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const v=btn.dataset.propAlign;
        sel.forEach(s=>{s.align=v;_canonicalCanvasWriter().updateElement(s.id);});
        form.querySelectorAll('[data-prop-align]').forEach(b=>b.classList.toggle('active',b.dataset.propAlign===v));
        DS.saveHistory();FormatEngine.updateToolbar();
      });
    });

    const valignRow=document.createElement('div');valignRow.className='prop-row';
    valignRow.innerHTML=`<span class="prop-label">V:</span>
      <div style="display:flex;gap:2px">
        ${['top','middle','bottom'].map(v=>`<button class="tb-icon${(el.valign||'middle')===v?' active':''}" style="width:18px;height:16px;font-size:10px" data-prop-valign="${v}" title="${v==='top'?'Texto arriba':v==='middle'?'Texto centro vertical':'Texto abajo'}">${v==='top'?'⬆':v==='middle'?'⬕':'⬇'}</button>`).join('')}
      </div>`;
    form.appendChild(valignRow);
    form.querySelectorAll('[data-prop-valign]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const v=btn.dataset.propValign;
        sel.forEach(s=>{s.valign=v;_canonicalCanvasWriter().updateElement(s.id);});
        form.querySelectorAll('[data-prop-valign]').forEach(b=>b.classList.toggle('active',b.dataset.propValign===v));
        DS.saveHistory();
      });
    });

    const divAlignSec=document.createElement('div');divAlignSec.className='prop-section';divAlignSec.textContent='Elemento';
    form.appendChild(divAlignSec);
    const _mkPB=(act,tt,ico)=>{const b=document.createElement('button');b.className='tb-icon';b.style.cssText='width:18px;height:16px;font-size:10px';b.title=tt;b.textContent=ico;if(sel.length<2){b.disabled=true;b.style.opacity='0.35';}else b.addEventListener('click',()=>handleAction(act));return b;};
    const alignHRow=document.createElement('div');alignHRow.className='prop-row';
    const alignHBtns=document.createElement('div');alignHBtns.style.cssText='display:flex;gap:2px';
    alignHBtns.appendChild(_mkPB('align-lefts','Alinear bordes izquierdos','◧'));
    alignHBtns.appendChild(_mkPB('align-centers','Centrar horizontal','◈'));
    alignHBtns.appendChild(_mkPB('align-rights','Alinear bordes derechos','◨'));
    const alignHLbl=document.createElement('span');alignHLbl.className='prop-label';alignHLbl.textContent='H:';
    alignHRow.appendChild(alignHLbl);alignHRow.appendChild(alignHBtns);form.appendChild(alignHRow);
    const alignVRow=document.createElement('div');alignVRow.className='prop-row';
    const alignVBtns=document.createElement('div');alignVBtns.style.cssText='display:flex;gap:2px';
    alignVBtns.appendChild(_mkPB('align-tops','Alinear bordes superiores','⬆'));
    alignVBtns.appendChild(_mkPB('align-middles','Centrar vertical','⬕'));
    alignVBtns.appendChild(_mkPB('align-bottoms','Alinear bordes inferiores','⬇'));
    const alignVLbl=document.createElement('span');alignVLbl.className='prop-label';alignVLbl.textContent='V:';
    alignVRow.appendChild(alignVLbl);alignVRow.appendChild(alignVBtns);form.appendChild(alignVRow);
    const alignSzRow=document.createElement('div');alignSzRow.className='prop-row';
    const alignSzBtns=document.createElement('div');alignSzBtns.style.cssText='display:flex;gap:2px';
    alignSzBtns.appendChild(_mkPB('same-width','Mismo ancho','↔'));
    alignSzBtns.appendChild(_mkPB('same-height','Misma altura','↕'));
    alignSzBtns.appendChild(_mkPB('same-size','Mismo tamaño','⛶'));
    const alignSzLbl=document.createElement('span');alignSzLbl.className='prop-label';alignSzLbl.textContent='Tamaño:';
    alignSzRow.appendChild(alignSzLbl);alignSzRow.appendChild(alignSzBtns);form.appendChild(alignSzRow);

    const div3=document.createElement('div');div3.className='prop-section';div3.textContent='Colores y bordes';
    form.appendChild(div3);

    const colorRow=document.createElement('div');colorRow.className='prop-color-row';
    colorRow.innerHTML=`
      <span style="font-size:10px;color:#333">Fuente:</span>
      <div class="prop-color-swatch" id="pc-font" style="background:${el.color}" title="Color de fuente"></div>
      <span style="font-size:10px;color:#333">Fondo:</span>
      <div class="prop-color-swatch" id="pc-bg" style="background:${el.bgColor==='transparent'?'#fff':el.bgColor};${el.bgColor==='transparent'?'border-style:dashed':''}" title="Color de fondo"></div>
      <span style="font-size:10px;color:#333">Borde:</span>
      <div class="prop-color-swatch" id="pc-border" style="background:${el.borderColor==='transparent'?'#fff':el.borderColor};${el.borderColor==='transparent'?'border-style:dashed':''}" title="Color de borde"></div>`;
    form.appendChild(colorRow);

    const bwRow=document.createElement('div');bwRow.className='prop-row';
    bwRow.innerHTML=`<span class="prop-label">Borde px:</span>
      <input class="prop-num" id="prop-border-w" type="number" value="${el.borderWidth}" min="0" max="10" style="width:40px">`;
    form.appendChild(bwRow);
    document.getElementById('prop-border-w')?.addEventListener('change',e=>{
      sel.forEach(s=>{s.borderWidth=parseInt(e.target.value)||0;_canonicalCanvasWriter().updateElement(s.id);});DS.saveHistory();
    });

    document.getElementById('pc-font')?.addEventListener('click',()=>{
      ColorPickerAdapter.open(el.color||'#000000',(hex)=>{
        sel.forEach(s=>{s.color=hex;_canonicalCanvasWriter().updateElement(s.id);});
        document.documentElement.style.setProperty('--swatch-font',hex);
        const sw=document.getElementById('pc-font');if(sw)sw.style.background=hex;
        DS.saveHistory();PropertiesEngine.render();
      },{allowTransparent:false});
    });
    document.getElementById('pc-bg')?.addEventListener('click',()=>{
      ColorPickerAdapter.open(el.bgColor||'#ffffff',(hex)=>{
        sel.forEach(s=>{s.bgColor=hex;_canonicalCanvasWriter().updateElement(s.id);});
        document.documentElement.style.setProperty('--swatch-bg',hex==='transparent'?'transparent':hex);
        const sw=document.getElementById('pc-bg');if(sw){sw.style.background=hex==='transparent'?'#fff':hex;sw.style.borderStyle=hex==='transparent'?'dashed':'solid';}
        DS.saveHistory();PropertiesEngine.render();
      },{allowTransparent:true});
    });
    document.getElementById('pc-border')?.addEventListener('click',()=>{
      ColorPickerAdapter.open(el.borderColor||'#000000',(hex)=>{
        sel.forEach(s=>{s.borderColor=hex;_canonicalCanvasWriter().updateElement(s.id);});
        document.documentElement.style.setProperty('--swatch-border',hex==='transparent'?'transparent':hex);
        const sw=document.getElementById('pc-border');if(sw){sw.style.background=hex==='transparent'?'#fff':hex;sw.style.borderStyle=hex==='transparent'?'dashed':'solid';}
        DS.saveHistory();PropertiesEngine.render();
      },{allowTransparent:true});
    });
  },

  _row(label,html,withInput=false){
    const d=document.createElement('div');d.className='prop-row';
    d.innerHTML=`<span class="prop-label">${label}</span><span style="flex:1;font-size:10px;overflow:hidden;text-overflow:ellipsis">${html}</span>`;
    return d;
  },
  _inputRow(label,id,value,type,key){
    const d=document.createElement('div');d.className='prop-row';
    d.innerHTML=`<span class="prop-label">${label}</span><input class="prop-input" id="${id}" type="${type}" value="${this._esc(value||'')}">`;
    setTimeout(()=>{
      document.getElementById(id)?.addEventListener('change',e=>{
        const el=DS.getSelectedElements()[0];if(!el)return;
        const prevValue = el[key];
        el[key]=e.target.value;
        if (el.type === 'field' && key === 'fieldPath' && (!el.content || el.content === prevValue || el.content === `{${prevValue}}` || el.content === 'Seleccione campo')) {
          el.content = '';
        }
        _canonicalCanvasWriter().updateElement(el.id);DS.saveHistory();
      });
    },0);
    return d;
  },
  _selectRow(label,id,options,value,key,labels=null){
    const d=document.createElement('div');d.className='prop-row';
    const opts=options.map((o,i)=>`<option value="${o}"${o===value?' selected':''}>${labels?labels[i]:o}</option>`).join('');
    d.innerHTML=`<span class="prop-label">${label}</span><select class="prop-select" id="${id}">${opts}</select>`;
    setTimeout(()=>{
      document.getElementById(id)?.addEventListener('change',e=>{
        DS.getSelectedElements().forEach(el=>{
          el[key]=e.target.value;
          if(key==='sectionId'){
            const sec=DS.getSection(e.target.value);if(!sec)return;
            const oldDiv=document.querySelector(`.cr-element[data-id="${el.id}"]`);
            if(oldDiv)oldDiv.remove();
            _canonicalCanvasWriter().renderElement(el);
          } else {
            _canonicalCanvasWriter().updateElement(el.id);
          }
          SelectionEngine.renderHandles();
        });
        DS.saveHistory();
      });
    },0);
    return d;
  },
  _esc(s){return String(s).replace(/"/g,'&quot;').replace(/</g,'&lt;');},

  // Reveal + focus a logical section of the (already rendered) props form.
  // which='format'  → Fuente / Colores section, focuses the font-family control.
  // which='general' → Posición y tamaño section, focuses the X control.
  // Produces a *visible* change independent of scroll overflow: un-collapses the
  // panel, highlights the target section, and moves real keyboard focus into it.
  // Returns the focused control id (or null if nothing to focus, e.g. no selection).
  focusSection(which){
    const panel=document.getElementById('properties-panel');
    if(panel) panel.classList.remove('collapsed');
    const form=document.getElementById('props-form');
    if(!form || form.classList.contains('hidden')) return null;
    const isFormat = which==='format';
    form.querySelectorAll('.prop-section.props-section-focus')
      .forEach(s=>s.classList.remove('props-section-focus'));
    const anchor=document.getElementById(isFormat?'props-format-anchor':'props-general-anchor');
    if(anchor) anchor.classList.add('props-section-focus');
    const ctl=document.getElementById(isFormat?'prop-font-family':'prop-x');
    if(ctl && typeof ctl.focus==='function'){ ctl.focus(); return ctl.id; }
    if(anchor && typeof anchor.scrollIntoView==='function') anchor.scrollIntoView({block:'nearest'});
    return anchor?anchor.id:null;
  },

  updatePositionFields(el){
    ['x','y','w','h'].forEach(k=>{
      const inp=document.getElementById(`prop-${k}`);
      if(inp) inp.value=el[k];
    });
  }
};

if (typeof module !== 'undefined') {
  module.exports = PropertiesEngine;
}
