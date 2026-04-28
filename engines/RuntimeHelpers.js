'use strict';

const RuntimeHelpers = (() => {
  function install() {
    window.resolveField = function(path, data, itemData){
      if(!path)return'';
      if(path.startsWith('_special.')){ const k=path.slice(9); if(k==='page_num')return'1'; if(k==='total_pages')return'1'; if(k==='print_date')return new Date().toLocaleDateString('es-EC'); if(k==='report_name')return'Factura Electrónica'; return''; }
      if(itemData&&(path.startsWith('item.')||!path.includes('.'))){ const k=path.startsWith('item.')?path.slice(5):path; return itemData[k]??''; }
      const keys=path.split('.'); let v=data; for(const k of keys){ if(v==null) return''; v=v[k]; } return v??'';
    };
    window.formatValue = function(v,fmt){ if(v===null||v===undefined||v==='')return''; return FORMATS[fmt]?FORMATS[fmt](v):String(v); };
    window.getCanvasPos = function(e){ if(e && e.model && typeof e.model.x === 'number' && typeof e.model.y === 'number') return { x:e.model.x, y:e.model.y }; return RF.Geometry.toCanvasSpace(e.clientX, e.clientY); };
    window.initKeyboard_DISABLED_v19 = function(){ return; };
    window.initClock = function(){ function update(){ const d=new Date(); document.getElementById('sb-time').textContent=d.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'}); } update(); window._clockInterval = setInterval(update,30000); };
  }
  return { install };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeHelpers };
if (typeof globalThis !== 'undefined') globalThis.RuntimeHelpers = RuntimeHelpers;
