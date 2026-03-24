'use strict';

const FormatEngine = {
  updateToolbar(){
    const sel=DS.getSelectedElements();
    const el=sel[0];
    if(!el){
      document.getElementById('btn-bold').classList.remove('active');
      document.getElementById('btn-italic').classList.remove('active');
      document.getElementById('btn-underline').classList.remove('active');
      return;
    }
    document.getElementById('btn-bold').classList.toggle('active',el.bold);
    document.getElementById('btn-italic').classList.toggle('active',el.italic);
    document.getElementById('btn-underline').classList.toggle('active',el.underline);
    document.getElementById('btn-al').classList.toggle('active',el.align==='left');
    document.getElementById('btn-ac').classList.toggle('active',el.align==='center');
    document.getElementById('btn-ar').classList.toggle('active',el.align==='right');
    document.documentElement.style.setProperty('--swatch-font', el.color);
    const fn=document.getElementById('tb-font-name');
    const fsz=document.getElementById('tb-font-size');
    if(fn) for(let o of fn.options)if(o.text===el.fontFamily){o.selected=true;break;}
    if(fsz) for(let o of fsz.options)if(parseInt(o.text)===el.fontSize){o.selected=true;break;}
  },
  applyFormat(key,value){
    const sel=DS.getSelectedElements();
    if(!sel.length)return;
    sel.forEach(el=>{el[key]=value;_canonicalCanvasWriter().updateElement(el.id);});
    DS.saveHistory();this.updateToolbar();PropertiesEngine.render();
  },
  toggleFormat(key){
    const sel=DS.getSelectedElements();if(!sel.length)return;
    const newVal=!sel[0][key];
    sel.forEach(el=>{el[key]=newVal;_canonicalCanvasWriter().updateElement(el.id);});
    DS.saveHistory();this.updateToolbar();PropertiesEngine.render();
  },
};

if (typeof module !== 'undefined') {
  module.exports = FormatEngine;
}
