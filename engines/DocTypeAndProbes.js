'use strict';

window.DOC_TYPES = {
  factura: {
    key:'factura',label:'Factura Electrónica',sriCode:'01',color:'#C0511A',
    fieldTree:null,sampleData:null,
    defaultSections:[
      {id:'s-rh',stype:'rh',label:'Encabezado del informe',abbr:'EI',height:110},
      {id:'s-ph',stype:'ph',label:'Encabezado de página',abbr:'EP',height:80},
      {id:'s-d1',stype:'det',label:'Detalle a',abbr:'D',height:14,iterates:'items'},
      {id:'s-pf',stype:'pf',label:'Pie de página',abbr:'PP',height:120},
      {id:'s-rf',stype:'rf',label:'Resumen del informe',abbr:'RI',height:30},
    ],
  },
  remision: {
    key:'remision',label:'Guía de Remisión',sriCode:'06',color:'#1565C0',
    defaultSections:[
      {id:'s-rh',stype:'rh',label:'Encabezado',abbr:'EI',height:110},
      {id:'s-ph',stype:'ph',label:'Datos traslado',abbr:'TR',height:90},
      {id:'s-d1',stype:'det',label:'Bienes',abbr:'B',height:14,iterates:'items'},
      {id:'s-pf',stype:'pf',label:'Pie',abbr:'PP',height:50},
    ],
    fieldTree:{
      empresa:{label:'empresa (Remitente)',icon:'🏢',children:{
        razon_social:{path:'empresa.razon_social',label:'razon_social',vtype:'string'},
        ruc:{path:'empresa.ruc',label:'ruc',vtype:'string'},
        direccion:{path:'empresa.direccion',label:'direccion',vtype:'string'},
      }},
      destinatario:{label:'destinatario',icon:'📦',children:{
        razon_social:{path:'destinatario.razon_social',label:'razon_social',vtype:'string'},
        identificacion:{path:'destinatario.identificacion',label:'identificacion',vtype:'string'},
        direccion:{path:'destinatario.direccion',label:'direccion',vtype:'string'},
      }},
      traslado:{label:'traslado',icon:'🚚',children:{
        motivo:{path:'traslado.motivo',label:'motivo',vtype:'string'},
        ruta:{path:'traslado.ruta',label:'ruta',vtype:'string'},
        fecha_inicio_traslado:{path:'traslado.fecha_inicio_traslado',label:'fecha_inicio_traslado',vtype:'string'},
        fecha_fin_traslado:{path:'traslado.fecha_fin_traslado',label:'fecha_fin_traslado',vtype:'string'},
        placa_vehiculo:{path:'traslado.placa_vehiculo',label:'placa_vehiculo',vtype:'string'},
        transportista_nombre:{path:'traslado.transportista_nombre',label:'transportista_nombre',vtype:'string'},
        transportista_ruc:{path:'traslado.transportista_ruc',label:'transportista_ruc',vtype:'string'},
      }},
      fiscal:{label:'fiscal',icon:'🧾',children:{
        numero_documento:{path:'fiscal.numero_documento',label:'numero_documento',vtype:'string'},
        clave_acceso:{path:'fiscal.clave_acceso',label:'clave_acceso',vtype:'string'},
        fecha_autorizacion:{path:'fiscal.fecha_autorizacion',label:'fecha_autorizacion',vtype:'date'},
        ambiente:{path:'fiscal.ambiente',label:'ambiente',vtype:'string'},
      }},
      items:{label:'items (bienes)',icon:'📦',children:{
        codigo:{path:'item.codigo',label:'codigo',vtype:'string'},
        descripcion:{path:'item.descripcion',label:'descripcion',vtype:'string'},
        cantidad:{path:'item.cantidad',label:'cantidad',vtype:'number'},
        unidad_medida:{path:'item.unidad_medida',label:'unidad_medida',vtype:'string'},
      }},
    },
    sampleData:{
      meta:{doc_entry:1234,doc_num:1234,obj_type:'112',currency:'USD'},
      empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',ruc:'0991234567001',direccion:'Av. 9 de Octubre 1234, Guayaquil',obligado_contabilidad:'SI'},
      destinatario:{razon_social:'FERRETERÍA EL PROGRESO CIA. LTDA.',identificacion:'0992345678001',tipo_identificacion:'04',direccion:'Calle Olmedo 456 y Sucre, Quito'},
      fiscal:{ambiente:'PRUEBAS',tipo_emision:'NORMAL',numero_documento:'006-001-000000123',numero_autorizacion:'2602202606991234567001060010010000001231234567811',fecha_autorizacion:'2025-11-19T10:00:00',clave_acceso:'2602202606991234567001060010010000001231234567811'},
      traslado:{motivo:'VENTA',ruta:'Guayaquil - Quito',fecha_inicio_traslado:'19/11/2025',fecha_fin_traslado:'20/11/2025',placa_vehiculo:'GBA-1234',transportista_nombre:'TRANSPORTES RÁPIDOS S.A.',transportista_ruc:'0985678901001'},
      origen:{direccion:'Av. 9 de Octubre 1234, Guayaquil - BODEGA CENTRAL'},
      destino:{direccion:'Calle Olmedo 456 y Sucre, Quito'},
      items:[
        {codigo:'BCANA.12',descripcion:'CANASTILLA INC. POSTERIOR TAIWAN DINT',cantidad:30,unidad_medida:'UN'},
        {codigo:'BEJE.18',descripcion:'EJE DEL GRUESO CICISMO FINO TAIWAN',cantidad:6,unidad_medida:'UN'},
        {codigo:'BTUBO.62',descripcion:'TUBO 20X2 125 AV DURO TAILANDIA',cantidad:3,unidad_medida:'UN'},
      ],
    },
  },
  nota_credito:{
    key:'nota_credito',label:'Nota de Crédito',sriCode:'04',color:'#C62828',
    defaultSections:[
      {id:'s-rh',stype:'rh',label:'Encabezado',abbr:'EI',height:120},
      {id:'s-ph',stype:'ph',label:'Cliente + doc. mod.',abbr:'EP',height:90},
      {id:'s-d1',stype:'det',label:'Detalle',abbr:'D',height:14,iterates:'items'},
      {id:'s-pf',stype:'pf',label:'Totales',abbr:'PP',height:110},
      {id:'s-rf',stype:'rf',label:'Resumen',abbr:'RI',height:30},
    ],
    fieldTree:{
      empresa:{label:'empresa',icon:'🏢',children:{razon_social:{path:'empresa.razon_social',label:'razon_social',vtype:'string'},ruc:{path:'empresa.ruc',label:'ruc',vtype:'string'}}},
      cliente:{label:'cliente',icon:'👤',children:{razon_social:{path:'cliente.razon_social',label:'razon_social',vtype:'string'},identificacion:{path:'cliente.identificacion',label:'identificacion',vtype:'string'},direccion:{path:'cliente.direccion',label:'direccion',vtype:'string'},email:{path:'cliente.email',label:'email',vtype:'string'}}},
      doc_modificado:{label:'doc. modificado',icon:'📋',children:{numero_documento:{path:'doc_modificado.numero_documento',label:'numero_documento',vtype:'string'},fecha_emision:{path:'doc_modificado.fecha_emision',label:'fecha_emision',vtype:'date'},tipo_documento:{path:'doc_modificado.tipo_documento',label:'tipo_documento',vtype:'string'}}},
      fiscal:{label:'fiscal',icon:'🧾',children:{numero_documento:{path:'fiscal.numero_documento',label:'numero_documento',vtype:'string'},clave_acceso:{path:'fiscal.clave_acceso',label:'clave_acceso',vtype:'string'},fecha_autorizacion:{path:'fiscal.fecha_autorizacion',label:'fecha_autorizacion',vtype:'date'},ambiente:{path:'fiscal.ambiente',label:'ambiente',vtype:'string'}}},
      items:{label:'items',icon:'📦',children:{codigo:{path:'item.codigo',label:'codigo',vtype:'string'},descripcion:{path:'item.descripcion',label:'descripcion',vtype:'string'},cantidad:{path:'item.cantidad',label:'cantidad',vtype:'number'},precio_unitario:{path:'item.precio_unitario',label:'precio_unitario',vtype:'currency'},subtotal:{path:'item.subtotal',label:'subtotal',vtype:'currency'}}},
      totales:{label:'totales',icon:'Σ',children:{subtotal_12:{path:'totales.subtotal_12',label:'subtotal_12',vtype:'currency'},descuento_total:{path:'totales.descuento_total',label:'descuento_total',vtype:'currency'},iva_12:{path:'totales.iva_12',label:'iva_12',vtype:'currency'},importe_total:{path:'totales.importe_total',label:'importe_total',vtype:'currency'}}},
    },
    sampleData:{
      meta:{doc_entry:45,doc_num:45,obj_type:'14',currency:'USD'},
      empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',ruc:'0991234567001',direccion_matriz:'Av. 9 de Octubre 1234, Guayaquil',obligado_contabilidad:'SI',agente_retencion:'NO'},
      cliente:{razon_social:'SILVA LEON ROBERTO CARLOS',identificacion:'0923748188',tipo_identificacion:'05',direccion:'44 Y SEDALANA, Guayaquil',email:'roberto@email.com'},
      fiscal:{ambiente:'PRUEBAS',tipo_emision:'NORMAL',numero_documento:'004-001-000000045',numero_autorizacion:'2602202604991234567001040010010000000451234567811',fecha_autorizacion:'2025-11-20T09:15:00',clave_acceso:'2602202604991234567001040010010000000451234567811'},
      doc_modificado:{numero_documento:'002-101-000020482',fecha_emision:'2025-11-19',tipo_documento:'FACTURA'},
      motivo:'Devolución de mercadería en mal estado',
      pago:{forma_pago_fe:'01',total:6.90},
      items:[{codigo:'BCANA.12',descripcion:'CANASTILLA INC. POSTERIOR TAIWAN DINT',cantidad:10,precio_unitario:0.10,descuento:0,subtotal:1.00},{codigo:'BTUBO.62',descripcion:'TUBO 20X2 125 AV DURO TAILANDIA',cantidad:2,precio_unitario:2.00,descuento:0,subtotal:4.00},{codigo:'BPEDA.12',descripcion:'PEDAL STD TAIWAN 3657 RECTANGULAR',cantidad:1,precio_unitario:1.00,descuento:0,subtotal:1.00}],
      totales:{subtotal_12:6.00,subtotal_0:0,subtotal_sin_impuestos:6.00,descuento_total:0,iva_12:0.90,importe_total:6.90},
    },
  },
  retencion:{
    key:'retencion',label:'Retención',sriCode:'07',color:'#4A148C',
    defaultSections:[{id:'s-rh',stype:'rh',label:'Encabezado',abbr:'EI',height:120},{id:'s-ph',stype:'ph',label:'Proveedor + doc. sustento',abbr:'PS',height:70},{id:'s-d1',stype:'det',label:'Impuestos retenidos',abbr:'IR',height:22,iterates:'items'},{id:'s-pf',stype:'pf',label:'Totales retención',abbr:'TR',height:80}],
    fieldTree:{
      empresa:{label:'empresa (Agente)',icon:'🏢',children:{razon_social:{path:'empresa.razon_social',label:'razon_social',vtype:'string'},ruc:{path:'empresa.ruc',label:'ruc',vtype:'string'},agente_retencion:{path:'empresa.agente_retencion',label:'agente_retencion',vtype:'string'}}},
      proveedor:{label:'proveedor (Retenido)',icon:'👤',children:{razon_social:{path:'proveedor.razon_social',label:'razon_social',vtype:'string'},identificacion:{path:'proveedor.identificacion',label:'identificacion',vtype:'string'},direccion:{path:'proveedor.direccion',label:'direccion',vtype:'string'}}},
      doc_sustento:{label:'doc. sustento',icon:'📄',children:{numero_documento:{path:'doc_sustento.numero_documento',label:'numero_documento',vtype:'string'},fecha_emision:{path:'doc_sustento.fecha_emision',label:'fecha_emision',vtype:'date'},tipo_documento:{path:'doc_sustento.tipo_documento',label:'tipo_documento',vtype:'string'}}},
      fiscal:{label:'fiscal',icon:'🧾',children:{numero_documento:{path:'fiscal.numero_documento',label:'numero_documento',vtype:'string'},clave_acceso:{path:'fiscal.clave_acceso',label:'clave_acceso',vtype:'string'},fecha_autorizacion:{path:'fiscal.fecha_autorizacion',label:'fecha_autorizacion',vtype:'date'},ambiente:{path:'fiscal.ambiente',label:'ambiente',vtype:'string'}}},
      impuestos:{label:'impuestos retenidos',icon:'📊',children:{tipo:{path:'item.tipo',label:'tipo',vtype:'string'},codigo_retencion:{path:'item.codigo_retencion',label:'codigo_retencion',vtype:'string'},descripcion:{path:'item.descripcion',label:'descripcion',vtype:'string'},base_imponible:{path:'item.base_imponible',label:'base_imponible',vtype:'currency'},porcentaje:{path:'item.porcentaje',label:'porcentaje',vtype:'number'},valor_retenido:{path:'item.valor_retenido',label:'valor_retenido',vtype:'currency'}}},
      totales:{label:'totales retención',icon:'Σ',children:{total_base_imponible:{path:'totales.total_base_imponible',label:'total_base_imponible',vtype:'currency'},total_retenido:{path:'totales.total_retenido',label:'total_retenido',vtype:'currency'},total_retenido_renta:{path:'totales.total_retenido_renta',label:'total_retenido_renta',vtype:'currency'},total_retenido_iva:{path:'totales.total_retenido_iva',label:'total_retenido_iva',vtype:'currency'}}},
    },
    sampleData:{
      meta:{doc_entry:89,doc_num:89,obj_type:'46',currency:'USD'},
      empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',ruc:'0991234567001',direccion_matriz:'Av. 9 de Octubre 1234, Guayaquil',obligado_contabilidad:'SI',agente_retencion:'Res. NAC-0532'},
      proveedor:{razon_social:'CONSULTORES TECH CIA. LTDA.',identificacion:'0992345678001',tipo_identificacion:'04',direccion:'Av. República de El Salvador N34-183, Quito',email:'facturacion@consultorestech.com'},
      fiscal:{ambiente:'PRUEBAS',tipo_emision:'NORMAL',numero_documento:'007-001-000000089',numero_autorizacion:'2602202607991234567001070010010000000891234567811',fecha_autorizacion:'2025-11-22T14:30:00',clave_acceso:'2602202607991234567001070010010000000891234567811'},
      doc_sustento:{numero_documento:'001-001-000005678',fecha_emision:'2025-11-20',tipo_documento:'01',serie_doc_sustento:'001-001',numero_doc_sustento:'000005678'},
      items:[{tipo:'RENTA',codigo_retencion:'303',descripcion:'Honorarios y demás pagos por servicios predomina intelecto',base_imponible:2000.00,porcentaje:10.0,valor_retenido:200.00},{tipo:'IVA',codigo_retencion:'721',descripcion:'Servicios donde predomina mano de obra - 30%',base_imponible:240.00,porcentaje:30.0,valor_retenido:72.00}],
      totales:{total_base_imponible:2240.00,total_retenido:272.00,total_retenido_renta:200.00,total_retenido_iva:72.00},
    },
  },
  liquidacion:{
    key:'liquidacion',label:'Liquidación de Compras',sriCode:'03',color:'#2E7D32',
    defaultSections:[{id:'s-rh',stype:'rh',label:'Encabezado',abbr:'EI',height:110},{id:'s-ph',stype:'ph',label:'Proveedor / Vendedor',abbr:'PR',height:80},{id:'s-d1',stype:'det',label:'Detalle',abbr:'D',height:14,iterates:'items'},{id:'s-pf',stype:'pf',label:'Totales',abbr:'PP',height:110},{id:'s-rf',stype:'rf',label:'Resumen',abbr:'RI',height:30}],
    fieldTree:{
      empresa:{label:'empresa (Emisor)',icon:'🏢',children:{razon_social:{path:'empresa.razon_social',label:'razon_social',vtype:'string'},ruc:{path:'empresa.ruc',label:'ruc',vtype:'string'},direccion_matriz:{path:'empresa.direccion_matriz',label:'direccion_matriz',vtype:'string'}}},
      proveedor:{label:'proveedor (Vendedor)',icon:'👤',children:{razon_social:{path:'proveedor.razon_social',label:'razon_social',vtype:'string'},identificacion:{path:'proveedor.identificacion',label:'identificacion',vtype:'string'},direccion:{path:'proveedor.direccion',label:'direccion',vtype:'string'},email:{path:'proveedor.email',label:'email',vtype:'string'}}},
      fiscal:{label:'fiscal',icon:'🧾',children:{numero_documento:{path:'fiscal.numero_documento',label:'numero_documento',vtype:'string'},clave_acceso:{path:'fiscal.clave_acceso',label:'clave_acceso',vtype:'string'},fecha_autorizacion:{path:'fiscal.fecha_autorizacion',label:'fecha_autorizacion',vtype:'date'},ambiente:{path:'fiscal.ambiente',label:'ambiente',vtype:'string'}}},
      pago:{label:'pago',icon:'💳',children:{forma_pago_fe:{path:'pago.forma_pago_fe',label:'forma_pago_fe',vtype:'string'},total:{path:'pago.total',label:'total',vtype:'currency'}}},
      items:{label:'items',icon:'📦',children:{codigo:{path:'item.codigo',label:'codigo',vtype:'string'},descripcion:{path:'item.descripcion',label:'descripcion',vtype:'string'},cantidad:{path:'item.cantidad',label:'cantidad',vtype:'number'},unidad_medida:{path:'item.unidad_medida',label:'unidad_medida',vtype:'string'},precio_unitario:{path:'item.precio_unitario',label:'precio_unitario',vtype:'currency'},subtotal:{path:'item.subtotal',label:'subtotal',vtype:'currency'}}},
      totales:{label:'totales',icon:'Σ',children:{subtotal_12:{path:'totales.subtotal_12',label:'subtotal_12',vtype:'currency'},subtotal_0:{path:'totales.subtotal_0',label:'subtotal_0',vtype:'currency'},subtotal_sin_impuestos:{path:'totales.subtotal_sin_impuestos',label:'subtotal_sin_impuestos',vtype:'currency'},iva_12:{path:'totales.iva_12',label:'iva_12',vtype:'currency'},importe_total:{path:'totales.importe_total',label:'importe_total',vtype:'currency'}}},
    },
    sampleData:{
      meta:{doc_entry:12,doc_num:12,obj_type:'18',currency:'USD'},
      empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',ruc:'0991234567001',direccion_matriz:'Av. 9 de Octubre 1234, Guayaquil',obligado_contabilidad:'SI'},
      proveedor:{razon_social:'MÉNDEZ SUÁREZ JUAN CARLOS',identificacion:'0912345678',tipo_identificacion:'05',direccion:'Cdla. La Garzota Mz. 25 Vs. 3, Guayaquil',email:'juan.mendez@gmail.com'},
      fiscal:{ambiente:'PRUEBAS',tipo_emision:'NORMAL',numero_documento:'003-001-000000012',numero_autorizacion:'2602202603991234567001030010010000000121234567811',fecha_autorizacion:'2025-11-21T11:45:00',clave_acceso:'2602202603991234567001030010010000000121234567811'},
      pago:{forma_pago_fe:'01',total:369.60},
      items:[{codigo:'SRV-001',descripcion:'Servicios de limpieza industrial bodega Norte',cantidad:1,unidad_medida:'SRV',precio_unitario:150.00,descuento:0,subtotal:150.00},{codigo:'SRV-002',descripcion:'Mantenimiento y pintura paredes internas',cantidad:2,unidad_medida:'SRV',precio_unitario:80.00,descuento:0,subtotal:160.00},{codigo:'MAT-001',descripcion:'Materiales de limpieza (escobas, trapeadores)',cantidad:5,unidad_medida:'UN',precio_unitario:4.00,descuento:0,subtotal:20.00}],
      totales:{subtotal_12:330.00,subtotal_0:0,subtotal_sin_impuestos:330.00,descuento_total:0,iva_12:39.60,importe_total:369.60},
    },
  },
};

DS._docType = 'factura';
DS._sampleData = null;

const _origResolveField = window.resolveField;
window.resolveField = function(path, data, itemData) {
  if(!path) return '';
  if(path.startsWith('_special.')) return _origResolveField(path, data, itemData);
  if(itemData && path.startsWith('item.')) {
    const k = path.slice(5);
    return itemData[k] ?? '';
  }
  const keys = path.split('.');
  let v = data;
  for (const k of keys) { if (v == null) return ''; v = v[k]; }
  return v ?? '';
};

window.shadeColor = function(hex, pct) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, (n>>16) + pct*2));
  const g = Math.min(255, Math.max(0, ((n>>8)&0xff) + pct*2));
  const b = Math.min(255, Math.max(0, (n&0xff) + pct*2));
  return `#${((r<<16)|(g<<8)|b).toString(16).padStart(6,'0')}`;
};

const canvas = {
  get renderMode(){ return _canonicalPreviewWriter().renderMode; },
  set renderMode(m){ _canonicalPreviewWriter().renderMode = m; },
};
window.canvas = canvas;

window.__rfVerify = function(){
  RF.Geometry.invalidate();
  const results = {};
  const sR = RF.Geometry.scrollRect();
  const cR = RF.Geometry.canvasRect();
  const workspaceCX = sR.left + sR.width/2;
  const canvasCX = cR.left + cR.width/2;
  results.bug1_workspace_cx = workspaceCX.toFixed(1);
  results.bug1_canvas_cx = canvasCX.toFixed(1);
  results.bug1_delta = Math.abs(workspaceCX - canvasCX).toFixed(2);
  results.bug1_pass = parseFloat(results.bug1_delta) < 2;
  const vTop = RF.Geometry.rulerVTop();
  results.bug2_ruler_vTop = vTop.toFixed(2);
  results.bug2_sections = [];
  DS.sections.forEach(sec => {
    const secDiv = document.querySelector(`.cr-section[data-section-id="${sec.id}"]`);
    const band = RF.Geometry.sectionBand(secDiv);
    results.bug2_sections.push({id:sec.id, band_y:(band?band.y.toFixed(1):'N/A'), band_h:(band?band.h.toFixed(1):'N/A')});
  });
  results.bug2_pass = vTop >= 0 && results.bug2_sections.every(s => s.band_y !== 'N/A');
  const selBoxes = document.querySelectorAll('.sel-box');
  results.bug3_sel_box_count = selBoxes.length;
  if (selBoxes.length === 1 && DS.selection.size === 1) {
    const id = [...DS.selection][0];
    const elDiv = document.querySelector(`.cr-element[data-id="${id}"]`);
    const gr = RF.Geometry.elementRect(elDiv);
    const sbR = selBoxes[0].getBoundingClientRect();
    const sbX = RF.Geometry.unscale(sbR.left-cR.left), sbY = RF.Geometry.unscale(sbR.top-cR.top);
    results.bug3_element_x = gr ? gr.left.toFixed(2) : 'N/A';
    results.bug3_element_y = gr ? gr.top.toFixed(2) : 'N/A';
    results.bug3_selbox_x = sbX.toFixed(2);
    results.bug3_selbox_y = sbY.toFixed(2);
    results.bug3_delta_x = gr ? Math.abs(gr.left-sbX).toFixed(2) : 'N/A';
    results.bug3_delta_y = gr ? Math.abs(gr.top-sbY).toFixed(2) : 'N/A';
    results.bug3_pass = gr ? parseFloat(results.bug3_delta_x) < 2 && parseFloat(results.bug3_delta_y) < 2 : null;
  } else {
    results.bug3_pass = selBoxes.length === 0;
  }
  console.table(results);
  return results;
};
