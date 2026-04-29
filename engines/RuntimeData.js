'use strict';

const RuntimeData = (() => {
  function install() {
    const _rc = (typeof RF !== 'undefined' && RF.RuntimeConfig) ? RF.RuntimeConfig : null;
    window.CFG = {
      GRID:            _rc ? _rc.canvas.grid          : 4,
      PAGE_W:          _rc ? _rc.canvas.pageW         : 754,
      MODEL_GRID:      _rc ? _rc.canvas.modelGrid     : 0.01 * 96 / 25.4,
      PAGE_MARGIN_LEFT: _rc ? _rc.canvas.pageMarginLeft : 0,
      PAGE_MARGIN_TOP:  _rc ? _rc.canvas.pageMarginTop  : 0,
      RULER_W:         _rc ? _rc.ruler.sidePx         : 22,
      RULER_H:         _rc ? _rc.ruler.topPx          : 22,
      MIN_EL_W:        _rc ? _rc.canvas.minElW        : 8,
      MIN_EL_H:        _rc ? _rc.canvas.minElH        : 6,
      HANDLE_HIT:      _rc ? _rc.canvas.handleHit     : 4,
      ZOOM_LEVELS:     _rc ? [..._rc.zoom.steps]      : [0.25,0.5,0.75,1.0,1.25,1.5,2.0,4.0],
      FONTS: ['Arial','Tahoma','Courier New','Times New Roman','Calibri','Verdana','Georgia'],
      FONT_SIZES: [6,7,8,9,10,11,12,14,16,18,20,24,28,36],
    };
    window.CFG.SECTION_MIN_H = _rc ? _rc.canvas.sectionMinH : 12;
    window.CFG.SECTION_MAX_H = _rc ? _rc.canvas.sectionMaxH : 800;
    window.FIELD_TREE = { database:{label:'Campos de base de datos',icon:'🗄️',children:{}}, formula:{label:'Campos de fórmula',icon:'ƒ',children:{}}, parameter:{label:'Campos de parámetro',icon:'?',children:{}}, running:{label:'Totales acumulados',icon:'Σ',children:{}}, group:{label:'Campos de grupo',icon:'G',children:{}}, special:{label:'Campos especiales',icon:'★',children:{ page_num:{path:'_special.page_num',label:'Número de página',vtype:'number'}, total_pages:{path:'_special.total_pages',label:'Total de páginas',vtype:'number'}, print_date:{path:'_special.print_date',label:'Fecha de impresión',vtype:'date'}, report_name:{path:'_special.report_name',label:'Nombre del informe',vtype:'string'}, } } };
    window.SAMPLE_DATA = { meta:{doc_entry:20482,doc_num:20482,obj_type:'13',currency:'USD'}, empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',nombre_comercial:'EPSON ECUADOR',ruc:'0991234567001'}, totales:{subtotal_12:29.43,subtotal_0:0,subtotal_sin_impuestos:29.43,iva_12:4.42,importe_total:33.85} };
    window.FORMATS = { currency:v=>isNaN(v)?v:parseFloat(v).toFixed(2), float2:v=>isNaN(v)?v:parseFloat(v).toFixed(2), float6:v=>isNaN(v)?v:parseFloat(v).toFixed(6), upper:v=>String(v).toUpperCase() };
  }
  return { install };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeData };
if (typeof globalThis !== 'undefined') globalThis.RuntimeData = RuntimeData;
