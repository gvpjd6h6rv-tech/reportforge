'use strict';

if (typeof globalThis.RuntimeData === 'undefined' || !globalThis.RuntimeData || typeof globalThis.RuntimeData.install !== 'function') {
const RuntimeData = (() => {
  let installed = false;

  function createCfg(_rc) {
    return {
      GRID:            _rc ? _rc.canvas.grid : 4,
      PAGE_W:          _rc ? _rc.canvas.pageW : 754,
      PAGE_H:          _rc ? _rc.canvas.pageH : 1123,
      MODEL_GRID:      _rc ? _rc.canvas.modelGrid : 0.01 * 96 / 25.4,
      PAGE_MARGIN_LEFT: _rc ? _rc.canvas.pageMarginLeft : 0,
      PAGE_MARGIN_TOP:  _rc ? _rc.canvas.pageMarginTop : 0,
      RULER_W:         _rc ? _rc.ruler.sidePx : 22,
      RULER_H:         _rc ? _rc.ruler.topPx : 22,
      MIN_EL_W:        _rc ? _rc.canvas.minElW : 8,
      MIN_EL_H:        _rc ? _rc.canvas.minElH : 6,
      HANDLE_HIT:      _rc ? _rc.canvas.handleHit : 4,
      ZOOM_LEVELS:     _rc ? [..._rc.zoom.steps] : [0.25,0.5,0.75,1.0,1.25,1.5,1.75,2.0,3.0,4.0],
      FONTS: ['Arial','Tahoma','Courier New','Times New Roman','Calibri','Verdana','Georgia'],
      FONT_SIZES: [6,7,8,9,10,11,12,14,16,18,20,24,28,36],
      SECTION_MIN_H:   _rc ? _rc.canvas.sectionMinH : 12,
      SECTION_MAX_H:   _rc ? _rc.canvas.sectionMaxH : 800,
    };
  }

  const FORMATS = {
    currency: v=>isNaN(v)?v:parseFloat(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    float2: v=>isNaN(v)?v:parseFloat(v).toFixed(2),
    float6: v=>isNaN(v)?v:parseFloat(v).toFixed(6),
    upper: v=>String(v).toUpperCase(),
    date: v=>{for(let p of['%Y-%m-%dT%H:%M:%S','%Y-%m-%d %H:%M:%S','%Y-%m-%d']){const m=String(v).match(/(\d{4})-(\d{2})-(\d{2})/);if(m)return`${m[3]}/${m[2]}/${m[1]}`;}return v;},
    datetime: v=>{const m=String(v).match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}:\d{2}:\d{2})/); return m?`${m[3]}/${m[2]}/${m[1]} ${m[4]}`:v;},
    ruc_mask: v=>{const s=String(v);return s.length===13?`${s.slice(0,9)}-${s.slice(9)}`:s;},
    clave_acceso:v=>String(v).replace(/\s/g,'').match(/.{1,10}/g)?.join(' ')||v,
    forma_pago:v=>({'01':'SIN UTILIZACIÓN DEL SISTEMA FINANCIERO','16':'TARJETA DE DÉBITO','17':'DINERO ELECTRÓNICO','19':'TARJETA DE CRÉDITO'}[String(v)]||String(v)),
    bool_si_no:v=>v?'SI':'NO',
    doc_number:v=>String(v),
  };

  function install() {
    if (installed) return;
    const _rc = (typeof RF !== 'undefined' && RF.RuntimeConfig) ? RF.RuntimeConfig : null;
    window.CFG = createCfg(_rc);
    window.FIELD_TREE = {
      database:{label:'Campos de base de datos',icon:'🗄️',children:{
        empresa:{label:'empresa',icon:'🏢',children:{
          razon_social:{path:'empresa.razon_social',label:'razon_social',vtype:'string'},
          nombre_comercial:{path:'empresa.nombre_comercial',label:'nombre_comercial',vtype:'string'},
          ruc:{path:'empresa.ruc',label:'ruc',vtype:'string'},
          direccion_matriz:{path:'empresa.direccion_matriz',label:'direccion_matriz',vtype:'string'},
          direccion_sucursal:{path:'empresa.direccion_sucursal',label:'direccion_sucursal',vtype:'string'},
          obligado_contabilidad:{path:'empresa.obligado_contabilidad',label:'obligado_contabilidad',vtype:'string'},
          agente_retencion:{path:'empresa.agente_retencion',label:'agente_retencion',vtype:'string'},
        }},
        cliente:{label:'cliente',icon:'👤',children:{
          razon_social:{path:'cliente.razon_social',label:'razon_social',vtype:'string'},
          identificacion:{path:'cliente.identificacion',label:'identificacion',vtype:'string'},
          direccion:{path:'cliente.direccion',label:'direccion',vtype:'string'},
          email:{path:'cliente.email',label:'email',vtype:'string'},
        }},
        fiscal:{label:'fiscal',icon:'🧾',children:{
          ambiente:{path:'fiscal.ambiente',label:'ambiente',vtype:'string'},
          tipo_emision:{path:'fiscal.tipo_emision',label:'tipo_emision',vtype:'string'},
          numero_documento:{path:'fiscal.numero_documento',label:'numero_documento',vtype:'string'},
          numero_autorizacion:{path:'fiscal.numero_autorizacion',label:'numero_autorizacion',vtype:'string'},
          fecha_autorizacion:{path:'fiscal.fecha_autorizacion',label:'fecha_autorizacion',vtype:'date'},
          clave_acceso:{path:'fiscal.clave_acceso',label:'clave_acceso',vtype:'string'},
        }},
        meta:{label:'meta',icon:'ℹ️',children:{
          doc_num:{path:'meta.doc_num',label:'doc_num',vtype:'number'},
          doc_entry:{path:'meta.doc_entry',label:'doc_entry',vtype:'number'},
          currency:{path:'meta.currency',label:'currency',vtype:'string'},
          obj_type:{path:'meta.obj_type',label:'obj_type',vtype:'string'},
        }},
        pago:{label:'pago',icon:'💳',children:{
          forma_pago_fe:{path:'pago.forma_pago_fe',label:'forma_pago_fe',vtype:'string'},
          total:{path:'pago.total',label:'total',vtype:'currency'},
        }},
        items:{label:'items (detalle)',icon:'📦',children:{
          codigo:{path:'item.codigo',label:'codigo',vtype:'string'},
          descripcion:{path:'item.descripcion',label:'descripcion',vtype:'string'},
          cantidad:{path:'item.cantidad',label:'cantidad',vtype:'number'},
          precio_unitario:{path:'item.precio_unitario',label:'precio_unitario',vtype:'currency'},
          descuento:{path:'item.descuento',label:'descuento',vtype:'currency'},
          subtotal:{path:'item.subtotal',label:'subtotal',vtype:'currency'},
        }},
        totales:{label:'totales',icon:'Σ',children:{
          subtotal_12:{path:'totales.subtotal_12',label:'subtotal_12',vtype:'currency'},
          subtotal_0:{path:'totales.subtotal_0',label:'subtotal_0',vtype:'currency'},
          subtotal_sin_impuestos:{path:'totales.subtotal_sin_impuestos',label:'subtotal_sin_impuestos',vtype:'currency'},
          iva_12:{path:'totales.iva_12',label:'iva_12',vtype:'currency'},
          importe_total:{path:'totales.importe_total',label:'importe_total',vtype:'currency'},
        }},
      }},
      formula:{label:'Campos de fórmula',icon:'ƒ',children:{}},
      parameter:{label:'Campos de parámetro',icon:'?',children:{}},
      sqlCommand:{label:'Campos de SQL Command',icon:'📋',children:{}},
      running:{label:'Totales acumulados',icon:'Σ',children:{}},
      group:{label:'Campos de grupo',icon:'G',children:{}},
      // RF-FIELD-EXPLORER-SPECIAL-FIELDS-PARITY-1: full CR Special Fields
      // list, in CR's own alphabetical (Spanish) order. page_num/total_pages/
      // print_date/report_name keys+paths predate this fix and are kept
      // stable for layouts already referencing them — only 2 of their
      // labels changed to match CR's wording exactly.
      special:{label:'Campos especiales',icon:'★',children:{
        file_author:{path:'_special.file_author',label:'Autor del archivo',vtype:'string'},
        report_comments:{path:'_special.report_comments',label:'Comentarios de Informe',vtype:'string'},
        selection_locale:{path:'_special.selection_locale',label:'Configuración regional de la selección',vtype:'string'},
        content_locale:{path:'_special.content_locale',label:'Configuración regional del contenido',vtype:'string'},
        file_creation_date:{path:'_special.file_creation_date',label:'Fecha de creación del archivo',vtype:'date'},
        print_date:{path:'_special.print_date',label:'Fecha de impresión',vtype:'date'},
        data_date:{path:'_special.data_date',label:'Fecha de los datos',vtype:'date'},
        modification_date:{path:'_special.modification_date',label:'Fecha de modificación',vtype:'date'},
        group_selection_formula:{path:'_special.group_selection_formula',label:'Fórmula de selección de grupos',vtype:'string'},
        record_selection_formula:{path:'_special.record_selection_formula',label:'Fórmula de selección de registros',vtype:'string'},
        print_time:{path:'_special.print_time',label:'Hora de impresión',vtype:'string'},
        data_time:{path:'_special.data_time',label:'Hora de los datos',vtype:'string'},
        modification_time:{path:'_special.modification_time',label:'Hora de modificación',vtype:'string'},
        ce_user_id:{path:'_special.ce_user_id',label:'Id. de usuario actual de CE',vtype:'string'},
        ce_user_name:{path:'_special.ce_user_name',label:'Nombre de usuario actual de CE',vtype:'string'},
        group_number:{path:'_special.group_number',label:'Número de grupo',vtype:'number'},
        page_num:{path:'_special.page_num',label:'Número de página',vtype:'number'},
        horizontal_page_num:{path:'_special.horizontal_page_num',label:'Número de página horizontal',vtype:'number'},
        record_number:{path:'_special.record_number',label:'Número de registro',vtype:'number'},
        total_pages:{path:'_special.total_pages',label:'Número total de páginas',vtype:'number'},
        page_n_of_m:{path:'_special.page_n_of_m',label:'Página N de M',vtype:'string'},
        file_path_name:{path:'_special.file_path_name',label:'Ruta y nombre del archivo',vtype:'string'},
        report_name:{path:'_special.report_name',label:'Título del informe',vtype:'string'},
        print_time_zone:{path:'_special.print_time_zone',label:'Zona horaria de impresión',vtype:'string'},
        data_time_zone:{path:'_special.data_time_zone',label:'Zona horaria de los datos',vtype:'string'},
        ce_user_time_zone:{path:'_special.ce_user_time_zone',label:'Zona horaria del usuario de CE actual',vtype:'string'},
      }},
    };
    window.SAMPLE_DATA = {
      meta:{doc_entry:20482,doc_num:20482,obj_type:'13',currency:'USD'},

      empresa_razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',
      empresa_ruc:'0991234567001',
      empresa_direccion_matriz:'Av. 9 de Octubre 1234 y Malecón, Guayaquil',
      empresa_direccion_sucursal:'Cdla. Alborada Mz. 12 Vs. 4, Guayaquil',
      empresa_obligado_contabilidad:'SI',
      empresa_agente_retencion:'NO',

      cliente_razon_social:'SILVA LEON ROBERTO CARLOS',
      cliente_identificacion:'0923748188',
      cliente_telefono:'S/N',
      cliente_email:'roberto.silva@email.com',
      cliente_direccion:'44 Y SEDALANA, Guayaquil',

      fiscal_numero_documento:'002-101-000020482',
      fiscal_numero_autorizacion:'2602202601991234567001120010010000204821234567811',
      fiscal_clave_acceso:'2602202601991234567001120010010000204821234567811',
      fiscal_fecha_autorizacion:'2025-11-19T16:25:46',
      fiscal_ambiente:'PRUEBAS',
      fiscal_emision:'NORMAL',

      forma_pago_descripcion:'01',
      forma_pago_valor:33.85,
      forma_pago_plazo:'',
      forma_pago_tiempo:'',

      totales_subtotal_15:29.43,
      totales_subtotal_iva_0:0,
      totales_subtotal_no_objeto_iva:0,
      totales_subtotal_exento_iva:0,
      totales_subtotal_sin_impuestos:29.43,
      totales_descuento_total:0,
      totales_valor_ice:0,
      totales_iva_15:4.42,
      totales_propina:0,
      totales_valor_total:33.85,

      empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',nombre_comercial:'EPSON ECUADOR',ruc:'0991234567001',direccion_matriz:'Av. 9 de Octubre 1234 y Malecón, Guayaquil',direccion_sucursal:'Cdla. Alborada Mz. 12 Vs. 4, Guayaquil',obligado_contabilidad:'SI',agente_retencion:'NO'},
      cliente:{razon_social:'SILVA LEON ROBERTO CARLOS',identificacion:'0923748188',telefono:'S/N',direccion:'44 Y SEDALANA, Guayaquil',email:'roberto.silva@email.com'},
      fiscal:{ambiente:'PRUEBAS',tipo_emision:'NORMAL',emision:'NORMAL',numero_documento:'002-101-000020482',numero_autorizacion:'2602202601991234567001120010010000204821234567811',fecha_autorizacion:'2025-11-19T16:25:46',clave_acceso:'2602202601991234567001120010010000204821234567811'},
      pago:{group_num:3,forma_pago_fe:'01',descripcion:'01',plazo:'',unidad_tiempo:'',tiempo:'',total:33.85,status:'MAPPED',source:'AUT_BY_GROUPNUM'},
      items:[
        {codigo:'BCANA.12',descripcion:'CANASTILLA INC. POSTERIOR TAIWAN DINT',cantidad:30,precio_unitario:0.10,descuento:0,subtotal:3.00},
        {codigo:'BCAUC.06',descripcion:'CAUCHO FRENO REFORZADO TAIWAN 460 CALIPER',cantidad:10,precio_unitario:0.37,descuento:0,subtotal:3.70},
        {codigo:'BEJE.18',descripcion:'EJE DEL GRUESO CICISMO FINO TAIWAN (26x14)',cantidad:6,precio_unitario:0.72,descuento:0,subtotal:4.32},
        {codigo:'BEJE.04',descripcion:'EJE DELANTERO FINO 5/16X148mm TAIWAN',cantidad:6,precio_unitario:0.63,descuento:0,subtotal:3.78},
        {codigo:'BEJE.02',descripcion:'EJE POSTERIOR LARGO 3/8x168mm TAIWAN',cantidad:6,precio_unitario:0.82,descuento:0,subtotal:4.92},
        {codigo:'BPEDA.12',descripcion:'PEDAL STD TAIWAN 3657 RECTANGULAR',cantidad:2,precio_unitario:2.25,descuento:0,subtotal:4.50},
        {codigo:'BREQU.02',descripcion:'REGULACION FRENO EN ORQUÍDEA C/BASE',cantidad:6,precio_unitario:0.38,descuento:0,subtotal:2.28},
        {codigo:'BRULI.07',descripcion:'RULIMAN 3/8 TAIWAN',cantidad:3,precio_unitario:0.45,descuento:0,subtotal:1.35},
        {codigo:'BTUBO.62',descripcion:'TUBO 20X2 125 AV DURO TAILANDIA',cantidad:3,precio_unitario:2.00,descuento:0,subtotal:6.00},
      ],
      totales:{subtotal_12:29.43,subtotal_0:0,subtotal_sin_impuestos:29.43,iva_12:4.42,importe_total:33.85},
    };
    window.FORMATS = FORMATS;
    installed = true;
  }
  return { install };
})();

if (typeof module !== 'undefined') module.exports = { RuntimeData };
if (typeof globalThis !== 'undefined') globalThis.RuntimeData = RuntimeData;
if (typeof globalThis !== 'undefined') globalThis.__RuntimeDataLoaded = true;
}
