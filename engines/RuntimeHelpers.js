'use strict';

if (typeof globalThis.RuntimeHelpers === 'undefined' || !globalThis.RuntimeHelpers || typeof globalThis.RuntimeHelpers.install !== 'function') {
const RuntimeHelpers = (() => {
  function _resolvePathValue(path, data){
    if(!path || !data)return undefined;
    if(Object.prototype.hasOwnProperty.call(data,path))return data[path];

    const keys=String(path).split('.');
    let v=data;
    for(const k of keys){
      if(v==null)return undefined;
      v=v[k];
    }
    return v;
  }

  function _invoiceFieldAliases(path){
    const aliases = {
      forma_pago_descripcion: ['forma_pago.descripcion', 'pago.descripcion', 'pago.forma_pago', 'pago.forma_pago_fe'],
      forma_pago_valor: ['forma_pago.valor', 'pago.valor', 'pago.total', 'totales.valor_total', 'totales.importe_total'],
      forma_pago_plazo: ['forma_pago.plazo', 'pago.plazo'],
      forma_pago_tiempo: ['forma_pago.tiempo', 'pago.tiempo', 'pago.unidad_tiempo'],

      totales_subtotal_15: ['totales.subtotal_15', 'totales.subtotal_12'],
      totales_subtotal_iva_0: ['totales.subtotal_iva_0', 'totales.subtotal_0'],
      totales_subtotal_no_objeto_iva: ['totales.subtotal_no_objeto_iva'],
      totales_subtotal_exento_iva: ['totales.subtotal_exento_iva'],
      totales_subtotal_sin_impuestos: ['totales.subtotal_sin_impuestos'],
      totales_descuento_total: ['totales.descuento_total'],
      totales_valor_ice: ['totales.valor_ice'],
      totales_iva_15: ['totales.iva_15', 'totales.iva_12'],
      totales_propina: ['totales.propina'],
      totales_valor_total: ['totales.valor_total', 'totales.importe_total', 'totales.total'],

      cliente_telefono: ['cliente.telefono'],
      cliente_email: ['cliente.email', 'cliente.correo'],
      cliente_direccion: ['cliente.direccion'],
      empresa_agente_retencion: ['empresa.agente_retencion'],
    };

    if(aliases[path])return aliases[path];

    const prefixes = ['empresa', 'fiscal', 'cliente', 'totales', 'forma_pago', 'fecha', 'guia'];
    for(const prefix of prefixes){
      const marker = `${prefix}_`;
      if(path.startsWith(marker))return [`${prefix}.${path.slice(marker.length)}`];
    }

    if(path.includes('.')){
      const [prefix, ...rest] = path.split('.');
      if(prefixes.includes(prefix) && rest.length)return [`${prefix}_${rest.join('_')}`];
    }

    return [];
  }

  function resolveField(path, data, itemData){
    if(!path)return'';
    if(path.startsWith('_special.')){
      const k=path.slice(9);
      const now=new Date();
      // RF-FIELD-EXPLORER-SPECIAL-FIELDS-PARITY-1: preview-only mock values
      // for every CR Special Field, so dragging any of them onto the canvas
      // shows something instead of silently rendering blank.
      // Same 3-way classification as core/render/engines/advanced_engine_shared.py
      // _SPECIAL — real value / legitimately-empty / "(no disponible)" gap
      // marker must match exactly between Design-canvas mock and real
      // Preview render, or the two would silently disagree.
      const NA='(no disponible)';
      const mocks={
        page_num:'1', total_pages:'1', page_n_of_m:'Página 1 de 1',
        group_number:'1', record_number:'1', horizontal_page_num:'1',
        print_date:now.toLocaleDateString('es-EC'), print_time:now.toLocaleTimeString('es-EC'),
        report_name:'Factura Electrónica',
        report_comments:'', group_selection_formula:'', record_selection_formula:'',
        file_author:NA, file_creation_date:NA, data_date:NA, data_time:NA,
        modification_date:NA, modification_time:NA, file_path_name:NA,
        selection_locale:NA, content_locale:NA,
        ce_user_id:NA, ce_user_name:NA,
        print_time_zone:NA, data_time_zone:NA, ce_user_time_zone:NA,
      };
      return mocks[k]!==undefined?mocks[k]:'';
    }
    if(itemData&&(path.startsWith('item.')||!path.includes('.'))){
      const k=path.startsWith('item.')?path.slice(5):path;
      return itemData[k]??'';
    }

    let value = _resolvePathValue(path, data);
    if(value!==undefined && value!==null)return value;

    for(const alias of _invoiceFieldAliases(path)){
      value = _resolvePathValue(alias, data);
      if(value!==undefined && value!==null)return value;
    }

    return'';
  }

  function formatValue(v,fmt){
    if(v===null||v===undefined||v==='')return'';
    return FORMATS[fmt]?FORMATS[fmt](v):String(v);
  }

  function getCanvasPos(e){
    if(e && e.model && typeof e.model.x === 'number' && typeof e.model.y === 'number'){
      return { x: e.model.x, y: e.model.y };
    }
    return RF.Geometry.clientToModel(e.clientX, e.clientY);
  }

  function initKeyboard_DISABLED_v19(){
    return;
  }

  function initClock(){
    function update(){
      const d=new Date();
      document.getElementById('sb-time').textContent=d.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'});
    }
    update();
    window._clockInterval = setInterval(update,30000);
  }

  function install() {
    window.resolveField = resolveField;
    window.formatValue = formatValue;
    window.getCanvasPos = getCanvasPos;
    window.initKeyboard_DISABLED_v19 = initKeyboard_DISABLED_v19;
    window.initClock = initClock;
  }

  return { install };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeHelpers };
if (typeof globalThis !== 'undefined') globalThis.RuntimeHelpers = RuntimeHelpers;
}
