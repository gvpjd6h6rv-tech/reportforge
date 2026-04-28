'use strict';

class Matrix2D{
  constructor(a=1,b=0,c=0,d=1,e=0,f=0){this.a=a;this.b=b;this.c=c;this.d=d;this.e=e;this.f=f;}
  static identity(){return new Matrix2D();}
  static translate(tx,ty){return new Matrix2D(1,0,0,1,tx,ty);}
  static scale(sx,sy=sx){return new Matrix2D(sx,0,0,sy,0,0);}
  static rotate(rad){const c=Math.cos(rad),s=Math.sin(rad);return new Matrix2D(c,s,-s,c,0,0);}
  multiply(m){return new Matrix2D(
    this.a*m.a+this.c*m.b, this.b*m.a+this.d*m.b,
    this.a*m.c+this.c*m.d, this.b*m.c+this.d*m.d,
    this.a*m.e+this.c*m.f+this.e, this.b*m.e+this.d*m.f+this.f);}
  transformPoint(x,y){return{x:this.a*x+this.c*y+this.e,y:this.b*x+this.d*y+this.f};}
  inverse(){const det=this.a*this.d-this.b*this.c;if(Math.abs(det)<1e-10)return Matrix2D.identity();
    const i=1/det;return new Matrix2D(this.d*i,-this.b*i,-this.c*i,this.a*i,
      (this.c*this.f-this.d*this.e)*i,(this.b*this.e-this.a*this.f)*i);}
  toCSSMatrix(){return `matrix(${this.a},${this.b},${this.c},${this.d},${this.e},${this.f})`;}
  toArray(){return[this.a,this.b,this.c,this.d,this.e,this.f];}
}
class AABB{
  constructor(x,y,w,h){this.x=x;this.y=y;this.w=w;this.h=h;}
  get x2(){return this.x+this.w;} get y2(){return this.y+this.h;}
  get cx(){return this.x+this.w/2;} get cy(){return this.y+this.h/2;}
  overlaps(o){return this.x<o.x2&&this.x2>o.x&&this.y<o.y2&&this.y2>o.y;}
  intersection(o){const ix=Math.max(this.x,o.x),iy=Math.max(this.y,o.y),ix2=Math.min(this.x2,o.x2),iy2=Math.min(this.y2,o.y2);
    if(ix>=ix2||iy>=iy2)return null;return new AABB(ix,iy,ix2-ix,iy2-iy);}
  mtv(o){if(!this.overlaps(o))return{dx:0,dy:0};
    const ox=Math.min(this.x2-o.x,o.x2-this.x),oy=Math.min(this.y2-o.y,o.y2-this.y);
    return ox<oy?{dx:(this.cx<o.cx?-ox:ox),dy:0}:{dx:0,dy:(this.cy<o.cy?-oy:oy)};}
  expand(m){return new AABB(this.x-m,this.y-m,this.w+m*2,this.h+m*2);}
  static fromRect(r){return new AABB(r.left,r.top,r.width,r.height);}
}
const MagneticSnap={
  GRID:8, TOLERANCE:4, PRECISION:1e-3, MODEL_GRID:0.01 * 96 / 25.4,
  snap(v,grid=this.MODEL_GRID || this.GRID){const s=Math.round(v/grid)*grid;return Math.abs(v-s)<=this.TOLERANCE?+s.toFixed(3):+v.toFixed(3);},
  snapPoint(x,y,grid=this.MODEL_GRID || this.GRID){return{x:this.snap(x,grid),y:this.snap(y,grid)};},
  snapWithGuides(x,y,guides=[]){let sx=this.snap(x),sy=this.snap(y);
    for(const g of guides){if(Math.abs(x-g.x)<this.TOLERANCE)sx=+g.x.toFixed(3);
      if(Math.abs(y-g.y)<this.TOLERANCE)sy=+g.y.toFixed(3);}return{x:sx,y:sy};},
  isOnGrid(v,grid=this.MODEL_GRID || this.GRID){const n=Math.round(v/grid)*grid;return Math.abs(v-n)<this.PRECISION+Number.EPSILON*grid;},
};
const PointerNorm={
  clientPos(e){if(e.touches&&e.touches.length)return{x:e.touches[0].clientX,y:e.touches[0].clientY};
    if(e.changedTouches&&e.changedTouches.length)return{x:e.changedTouches[0].clientX,y:e.changedTouches[0].clientY};
    return{x:e.clientX||0,y:e.clientY||0};},
  toCanvas(e){const{x,y}=this.clientPos(e);return RF.Geometry.toCanvasSpace(x,y);},
  pressure(e){return(e.pressure!==undefined&&e.pressure>0)?e.pressure:1.0;},
  type(e){return e.pointerType||(e.touches?'touch':'mouse');},
};

window.RF = window.RF || {};
const RF = window.RF;
RF.Geometry = {
  _frameCache: null,
  _cacheFrame: -1,
  invalidate(){ this._frameCache = null; },
  canvasRect(){
    if(this._frameCache) return this._frameCache.canvasRect;
    const el = document.getElementById('canvas-layer');
    const r = el ? el.getBoundingClientRect() : {left:0,top:0,right:0,bottom:0,width:0,height:0};
    this._ensureCache();
    this._frameCache.canvasRect = r;
    return r;
  },
  scrollRect(){
    if(this._frameCache && this._frameCache.scrollRect) return this._frameCache.scrollRect;
    const el = document.getElementById('workspace');
    const r = el ? el.getBoundingClientRect() : {left:0,top:0,right:0,bottom:0,width:0,height:0};
    this._ensureCache();
    this._frameCache.scrollRect = r;
    return r;
  },
  rulerVRect(){
    if(this._frameCache && this._frameCache.rulerVRect) return this._frameCache.rulerVRect;
    const el = document.getElementById('ruler-v');
    const r = el ? el.getBoundingClientRect() : {left:0,top:0,right:0,bottom:0,width:0,height:0};
    this._ensureCache();
    this._frameCache.rulerVRect = r;
    return r;
  },
  _ensureCache(){ if(!this._frameCache) this._frameCache = {}; },
  _invalidLegacyRectProp(prop){
    const msg = `INVALID GEOMETRY SHAPE: use left/top/width/height only (${prop})`;
    console.error(msg);
    throw new Error(msg);
  },
  _rect(left, top, width, height){
    const rect = { left, top, width, height };
    Object.defineProperties(rect, {
      x: { get: () => this._invalidLegacyRectProp('x'), enumerable: false },
      y: { get: () => this._invalidLegacyRectProp('y'), enumerable: false },
      w: { get: () => this._invalidLegacyRectProp('w'), enumerable: false },
      h: { get: () => this._invalidLegacyRectProp('h'), enumerable: false },
    });
    return Object.freeze(rect);
  },
  elementRect(elDiv){
    if(!elDiv) return null;
    const zoom = (typeof DS !== 'undefined' ? DS.zoom : 1) || 1;
    const eR = elDiv.getBoundingClientRect();
    const cR = this.canvasRect();
    return this._rect((eR.left - cR.left) / zoom, (eR.top - cR.top) / zoom, eR.width / zoom, eR.height / zoom);
  },
  sectionBand(secDiv){
    if(!secDiv) return null;
    const cR = this.canvasRect();
    const sR = secDiv.getBoundingClientRect();
    return { y: sR.top - cR.top, h: sR.height };
  },
  canvasLeft(){ const cR = this.canvasRect(); const sR = this.scrollRect(); return cR.left - sR.left; },
  rulerVTop(){ const cR = this.canvasRect(); const rR = this.rulerVRect(); return cR.top - rR.top; },
  toCanvasSpace(clientX, clientY){ return this.viewToModel(clientX, clientY); },
  Matrix2D, AABB, MagneticSnap, PointerNorm,
  canvasMatrix(){ const zoom=(typeof DS!=='undefined'?DS.zoom:1)||1; return Matrix2D.scale(zoom); },
  canvasMatrixInverse(){ return this.canvasMatrix().inverse(); },
  elementAABB(elOrId){ const r=this.getElementRect(elOrId); return r?AABB.fromRect(r):null; },
  allElementAABBs(){
    const result=[];document.querySelectorAll('.cr-element').forEach(el=>{const r=this.getElementRect(el);if(r) result.push({id:el.dataset.id,aabb:AABB.fromRect(r)});});
    return result;
  },
  findOverlaps(){
    const boxes=this.allElementAABBs();const pairs=[];
    for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) if(boxes[i].aabb.overlaps(boxes[j].aabb))
      pairs.push({a:boxes[i].id,b:boxes[j].id,mtv:boxes[i].aabb.mtv(boxes[j].aabb)});
    return pairs;
  },
  getCanvasRect(){ return this.canvasRect(); },
  getElementRect(elOrId){
    const el=(typeof elOrId==='string')?document.querySelector(`.cr-element[data-id="${elOrId}"]`):elOrId;
    return this.elementRect(el);
  },
  getSectionRect(secOrId){
    const sec=(typeof secOrId==='string')?document.querySelector(`.cr-section[data-section-id="${secOrId}"]`):secOrId;
    if(!sec)return null;
    const zoom=(typeof DS!=='undefined'?DS.zoom:1)||1;
    const sR=sec.getBoundingClientRect();const cR=this.canvasRect();
    return this._rect((sR.left-cR.left)/zoom,(sR.top-cR.top)/zoom,sR.width/zoom,sR.height/zoom);
  },
  zoom() { return (typeof DS !== 'undefined' ? DS.zoom : 1) || 1; },
  scale(v) { return v * this.zoom(); },
  unscale(v) { return v / this.zoom(); },
  modelToView(x, y) { const z = this.zoom(); return { x: x * z, y: y * z }; },
  viewToModel(clientX, clientY) {
    const z  = this.zoom(); const cR = this.canvasRect();
    return { x: (clientX - cR.left) / z, y: (clientY - cR.top) / z };
  },
  rectToView(r) { const z = this.zoom(); return this._rect(r.x * z, r.y * z, r.w * z, r.h * z); },
  modelToScreen(x, y) {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvasRect();
    const ws = document.getElementById('workspace');
    return { x: (x * this.zoom() + r.left - (ws ? ws.scrollLeft : 0)) * dpr, y: (y * this.zoom() + r.top - (ws ? ws.scrollTop : 0)) * dpr };
  },
  screenToModel(sx, sy) {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvasRect();
    const ws = document.getElementById('workspace');
    const z = this.zoom();
    return { x: (sx / dpr - r.left + (ws ? ws.scrollLeft : 0)) / z, y: (sy / dpr - r.top + (ws ? ws.scrollTop : 0)) / z };
  },
  snapModel(v, grid) { return (!grid || grid <= 0) ? v : Math.round(v / grid) * grid; },
  roundView(v) { return Math.round(v); },
};

window.CFG = {
  GRID: 4, PAGE_W: 754,
  MODEL_GRID: 0.01 * 96 / 25.4,
  PAGE_MARGIN_LEFT: 0,
  PAGE_MARGIN_TOP: 0,
  RULER_W: 22,
  RULER_H: 16,
  MIN_EL_W: 8, MIN_EL_H: 6,
  HANDLE_HIT: 4,
  ZOOM_LEVELS: [0.25,0.5,0.75,1.0,1.25,1.5,2.0,4.0],
  FONTS: ['Arial','Tahoma','Courier New','Times New Roman','Calibri','Verdana','Georgia'],
  FONT_SIZES: [6,7,8,9,10,11,12,14,16,18,20,24,28,36],
};

window.CFG.SECTION_MIN_H = 12;
window.CFG.SECTION_MAX_H = 800;

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
  running:{label:'Totales acumulados',icon:'Σ',children:{}},
  group:{label:'Campos de grupo',icon:'G',children:{}},
  special:{label:'Campos especiales',icon:'★',children:{
    page_num:{path:'_special.page_num',label:'Número de página',vtype:'number'},
    total_pages:{path:'_special.total_pages',label:'Total de páginas',vtype:'number'},
    print_date:{path:'_special.print_date',label:'Fecha de impresión',vtype:'date'},
    report_name:{path:'_special.report_name',label:'Nombre del informe',vtype:'string'},
  }},
};

window.SAMPLE_DATA = {
  meta:{doc_entry:20482,doc_num:20482,obj_type:'13',currency:'USD'},
  empresa:{razon_social:'DISTRIBUIDORA EPSON ECUADOR S.A.',nombre_comercial:'EPSON ECUADOR',ruc:'0991234567001',direccion_matriz:'Av. 9 de Octubre 1234 y Malecón, Guayaquil',direccion_sucursal:'Cdla. Alborada Mz. 12 Vs. 4, Guayaquil',obligado_contabilidad:'SI',agente_retencion:'NO'},
  cliente:{razon_social:'SILVA LEON ROBERTO CARLOS',identificacion:'0923748188',direccion:'44 Y SEDALANA, Guayaquil',email:'roberto.silva@email.com'},
  fiscal:{ambiente:'PRUEBAS',tipo_emision:'NORMAL',numero_documento:'002-101-000020482',numero_autorizacion:'2602202601991234567001120010010000204821234567811',fecha_autorizacion:'2025-11-19T16:25:46',clave_acceso:'2602202601991234567001120010010000204821234567811'},
  pago:{group_num:3,forma_pago_fe:'01',plazo:null,unidad_tiempo:null,total:33.85,status:'MAPPED',source:'AUT_BY_GROUPNUM'},
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

window.FORMATS = {
  currency: v=>isNaN(v)?v:parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','),
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

window.resolveField = function(path, data, itemData){
  if(!path)return'';
  if(path.startsWith('_special.')){
    const k=path.slice(9);
    if(k==='page_num')return'1';
    if(k==='total_pages')return'1';
    if(k==='print_date')return new Date().toLocaleDateString('es-EC');
    if(k==='report_name')return'Factura Electrónica';
    return'';
  }
  if(itemData&&(path.startsWith('item.')||!path.includes('.'))){
    const k=path.startsWith('item.')?path.slice(5):path;
    return itemData[k]??'';
  }
  const keys=path.split('.');let v=data;
  for(const k of keys){if(v==null)return'';v=v[k];}
  return v??'';
};

window.formatValue = function(v,fmt){
  if(v===null||v===undefined||v==='')return'';
  return FORMATS[fmt]?FORMATS[fmt](v):String(v);
};

window.getCanvasPos = function(e){
  if(e && e.model && typeof e.model.x === 'number' && typeof e.model.y === 'number'){
    return { x: e.model.x, y: e.model.y };
  }
  return RF.Geometry.toCanvasSpace(e.clientX, e.clientY);
};

window.initKeyboard_DISABLED_v19 = function(){
  return;
};

window.initClock = function(){
  function update(){
    const d=new Date();
    document.getElementById('sb-time').textContent=d.toLocaleTimeString('es-EC',{hour:'2-digit',minute:'2-digit'});
  }
  update();
  window._clockInterval = setInterval(update,30000);
};
