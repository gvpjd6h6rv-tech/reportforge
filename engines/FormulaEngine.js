'use strict';

const FormulaEngine = (() => {
  const TT = {NUM:'NUM',STR:'STR',BOOL:'BOOL',NAME:'NAME',OP:'OP',LP:'LP',RP:'RP',COMMA:'CM',SEMI:'SM',FIELD:'FLD',DATE:'DT',EOF:'EOF'};
  function tokenize(src) {
    const tok=[]; let i=0,n=src.length;
    while(i<n){
      if(/\s/.test(src[i])){i++;continue;}
      if(src.slice(i,i+2)==='//'){while(i<n&&src[i]!=='\n')i++;continue;}
      if(src.slice(i,i+2)==='/*'){const e=src.indexOf('*/',i+2);i=e<0?n:e+2;continue;}
      if(src[i]==='#'){const j=src.indexOf('#',i+1);if(j>=0){tok.push({t:TT.DATE,v:src.slice(i+1,j)});i=j+1;continue;}}
      if(src[i]==='{'){const j=src.indexOf('}',i+1);if(j>=0){tok.push({t:TT.FIELD,v:src.slice(i+1,j).trim()});i=j+1;continue;}}
      if(src[i]==='"'||src[i]==="'"){
        const q=src[i];let j=i+1,buf='';
        while(j<n){if(src[j]===q){if(src[j+1]===q){buf+=q;j+=2;}else{j++;break;}}else buf+=src[j++];}
        tok.push({t:TT.STR,v:buf});i=j;continue;
      }
      if(/\d/.test(src[i])||(src[i]==='.'&&/\d/.test(src[i+1]||''))){
        let j=i;while(j<n&&(/\d/.test(src[j])||src[j]==='.'))j++;
        const s=src.slice(i,j);tok.push({t:TT.NUM,v:s.includes('.')?parseFloat(s):parseInt(s,10)});i=j;continue;
      }
      if(/[a-zA-Z_]/.test(src[i])){
        let j=i;
        while(j<n&&(/[a-zA-Z0-9_]/.test(src[j])||(src[j]==='.'&&j+1<n&&/[a-zA-Z_]/.test(src[j+1]))))j++;
        const w=src.slice(i,j),wl=w.toLowerCase();
        if(wl==='true')tok.push({t:TT.BOOL,v:true});
        else if(wl==='false')tok.push({t:TT.BOOL,v:false});
        else tok.push({t:TT.NAME,v:w});
        i=j;continue;
      }
      const op2=src.slice(i,i+2);
      if(['<>','<=','>=',':='].includes(op2)){tok.push({t:TT.OP,v:op2});i+=2;continue;}
      if('+-*/^%&=<>!?:'.includes(src[i])){tok.push({t:TT.OP,v:src[i]});i++;continue;}
      if(src[i]==='('){tok.push({t:TT.LP});i++;continue;}
      if(src[i]===')'){tok.push({t:TT.RP});i++;continue;}
      if(src[i]===','){tok.push({t:TT.COMMA});i++;continue;}
      if(src[i]===';'){tok.push({t:TT.SEMI});i++;continue;}
      i++;
    }
    tok.push({t:TT.EOF});return tok;
  }
  class P {
    constructor(t){this._t=t;this._p=0;}
    get c(){return this._t[this._p];}
    m(tt,v){if(this.c.t===tt&&(!v||this.c.v?.toLowerCase()===v?.toLowerCase())){this._p++;return true;}return false;}
    chk(tt,v){return this.c.t===tt&&(!v||this.c.v?.toLowerCase()===v?.toLowerCase());}
    eat(){const t=this.c;this._p++;return t;}
    parse(){const s=[];while(!this.chk(TT.EOF)){const st=this.stmt();if(st!=null)s.push(st);while(this.m(TT.SEMI));}return s.length===1?s[0]:s.length===0?{k:'null'}:{k:'blk',s};}
    stmt(){
      const v=this.c.t===TT.NAME?this.c.v.toLowerCase():'';
      if(v==='whilereadingrecords'){this._p++;return{k:'timing',v:'reading'};}
      if(v==='whileprintingrecords'){this._p++;return{k:'timing',v:'printing'};}
      if(['local','global','shared'].includes(v))return this.decl();
      if(['numbervar','stringvar','booleanvar','datevar','datetimevar','currencyvar'].includes(v))return this.decl(true);
      if(v==='if')return this.ifExpr();
      if(v==='select')return this.selExpr();
      return this.expr();
    }
    decl(impl=false){
      let sc='local';if(!impl)sc=this.eat(TT.NAME).v.toLowerCase();
      const ty=this.eat(TT.NAME).v.toLowerCase();const nm=this.eat(TT.NAME).v;let init=null;
      if(this.chk(TT.OP,':=')||this.chk(TT.OP,'=')){this._p++;init=this.expr();}
      return{k:'decl',sc,ty,nm,init};
    }
    ifExpr(){
      this.eat(TT.NAME,'if');const cond=this.expr();this.eat(TT.NAME,'then');const ts=[];
      while(!this.chk(TT.NAME,'else')&&!this.chk(TT.NAME,'end')&&!this.chk(TT.EOF)){ts.push(this.stmt());while(this.m(TT.SEMI));}
      const th=ts.length===1?ts[0]:{k:'blk',s:ts};let el=null;
      if(this.m(TT.NAME,'else')){const es=[];while(!this.chk(TT.NAME,'end')&&!this.chk(TT.EOF)){es.push(this.stmt());while(this.m(TT.SEMI));}el=es.length===1?es[0]:{k:'blk',s:es};}
      this.m(TT.NAME,'end');return{k:'if',cond,th,el};
    }
    selExpr(){this.eat(TT.NAME,'select');const ex=this.expr();const cs=[];let df=null;while(this.chk(TT.NAME,'case')||this.chk(TT.NAME,'default')){if(this.m(TT.NAME,'default')){df=this.stmt();}else{this.eat(TT.NAME,'case');const cv=this.expr();const cb=this.stmt();cs.push([cv,cb]);}}return{k:'sel',ex,cs,df};}
    expr(){return this.or();}
    or(){let l=this.and();while(this.chk(TT.NAME,'or')){this._p++;l={k:'bin',op:'or',l,r:this.and()};}return l;}
    and(){let l=this.not();while(this.chk(TT.NAME,'and')){this._p++;l={k:'bin',op:'and',l,r:this.not()};}return l;}
    not(){if(this.chk(TT.NAME,'not')){this._p++;return{k:'un',op:'not',v:this.not()};}return this.cmp();}
    cmp(){let l=this.cat();const ops=['=','<>','<','>','<=','>='];while(this.chk(TT.OP)&&ops.includes(this.c.v)){const op=this.eat(TT.OP).v;l={k:'bin',op,l,r:this.cat()};}if(this.chk(TT.NAME,'in')){this._p++;this.eat(TT.LP);const its=[l,this.expr()];while(this.m(TT.COMMA))its.push(this.expr());this.eat(TT.RP);return{k:'call',nm:'__in__',args:its};}if(this.chk(TT.NAME,'between')){this._p++;const lo=this.cat();this.m(TT.NAME,'and');const hi=this.cat();return{k:'call',nm:'__between__',args:[l,lo,hi]};}return l;}
    cat(){let l=this.add();while(this.chk(TT.OP,'&')){this._p++;l={k:'bin',op:'&',l,r:this.add()};}return l;}
    add(){let l=this.mul();while(this.chk(TT.OP)&&'+-'.includes(this.c.v)){const op=this.eat(TT.OP).v;l={k:'bin',op,l,r:this.mul()};}return l;}
    mul(){let l=this.un();while(this.chk(TT.OP)&&'*/^%'.includes(this.c.v)){const op=this.eat(TT.OP).v;l={k:'bin',op,l,r:this.un()};}return l;}
    un(){if(this.chk(TT.OP,'-')){this._p++;return{k:'un',op:'-',v:this.un()};}if(this.chk(TT.OP,'+')){this._p++;return this.un();}return this.prim();}
    prim(){const t=this.c;if(t.t===TT.NUM){this._p++;return{k:'num',v:t.v};}if(t.t===TT.STR){this._p++;return{k:'str',v:t.v};}if(t.t===TT.BOOL){this._p++;return{k:'bool',v:t.v};}if(t.t===TT.FIELD){this._p++;return{k:'fld',v:t.v};}if(t.t===TT.DATE){this._p++;return{k:'date',v:t.v};}if(t.t===TT.NAME){const vl=t.v.toLowerCase();if(vl==='null'||vl==='missing'){this._p++;return{k:'null'};}const nm=t.v;this._p++;if(this.chk(TT.LP)){this._p++;const args=[];if(!this.chk(TT.RP)){args.push(this.expr());while(this.m(TT.COMMA))args.push(this.expr());}this.eat(TT.RP);return{k:'call',nm,args};}return{k:'var',nm};}if(t.t===TT.LP){this._p++;const e=this.expr();this.eat(TT.RP);return e;}this._p++;return{k:'null'};}
  }
  class Ctx {
    constructor(){this._g={};this._sh={};this._rec={};this._all=[];this._grp=[];this._params={};this._pg=1;this._tpg=1;this._rn=0;}
    setRecord(r,n=0){this._rec=r||{};this._rn=n;} setRecords(rs){this._all=rs||[];} setGroup(g){this._grp=g||[];} setParams(p){this._params=p||{};} setPage(p,t){this._pg=p;this._tpg=t;}
    eval(src){try{const ast=new P(tokenize(src)).parse();return this._n(ast,{});}catch{return null;}}
    _n(nd,lc){ if(!nd)return null; switch(nd.k){case 'num': return nd.v; case 'str': return nd.v; case 'bool': return nd.v; case 'null': return null; case 'timing': return null; case 'date': return this._pd(nd.v); case 'fld': return this._rf(nd.v); case 'var': return this._rv(nd.nm,lc); case 'un': {const v=this._n(nd.v,lc);return nd.op==='-'?-this._num(v):!this._tr(v);} case 'bin': return this._bin(nd,lc); case 'call': return this._call(nd,lc); case 'if': return this._tr(this._n(nd.cond,lc))?this._n(nd.th,lc):(nd.el?this._n(nd.el,lc):null); case 'sel':{const v=this._n(nd.ex,lc);for(const[cv,cb]of nd.cs)if(this._eq(v,this._n(cv,lc)))return this._n(cb,lc);return nd.df?this._n(nd.df,lc):null;} case 'decl':{const defs={numbervar:0,stringvar:'',booleanvar:false,datevar:new Date(),datetimevar:new Date(),currencyvar:0}; const iv=nd.init?this._n(nd.init,lc):defs[nd.ty]??null; if(nd.sc==='global'){if(!(nd.nm in this._g))this._g[nd.nm]=iv;return this._g[nd.nm];} if(nd.sc==='shared'){if(!(nd.nm in this._sh))this._sh[nd.nm]=iv;return this._sh[nd.nm];} lc[nd.nm]=iv;return iv;} case 'blk':{let r=null;for(const s of nd.s)r=this._n(s,lc);return r;}} return null;}
    _bin(nd,lc){const op=nd.op;if(op==='and')return this._tr(this._n(nd.l,lc))&&this._tr(this._n(nd.r,lc));if(op==='or') return this._tr(this._n(nd.l,lc))||this._tr(this._n(nd.r,lc));const l=this._n(nd.l,lc),r=this._n(nd.r,lc);switch(op){case '+': return(typeof l==='string'||typeof r==='string')?String(l??'')+String(r??''):this._num(l)+this._num(r);case '-': return this._num(l)-this._num(r);case '*': return this._num(l)*this._num(r);case '/': {const d=this._num(r);return d===0?0:this._num(l)/d;}case '^': return Math.pow(this._num(l),this._num(r));case '%': return this._num(l)%this._num(r);case '&': return String(l??'')+String(r??'');case '=': return this._eq(l,r);case '<>': return !this._eq(l,r);case '<':  return this._cmp(l,r)<0;case '>':  return this._cmp(l,r)>0;case '<=': return this._cmp(l,r)<=0;case '>=': return this._cmp(l,r)>=0;}return null;}
    _call(nd,lc){const nm=nd.nm.toLowerCase();const ra=nd.args;if(nm==='iif'||nm==='if'){if(!ra.length)return null;return this._n(this._tr(this._n(ra[0],lc))?ra[1]:ra[2],lc);} if(nm==='__in__'){const v=this._n(ra[0],lc);return ra.slice(1).some(a=>this._eq(v,this._n(a,lc)));} if(nm==='__between__'){const v=this._n(ra[0],lc),lo=this._n(ra[1],lc),hi=this._n(ra[2],lc);return this._cmp(v,lo)>=0&&this._cmp(v,hi)<=0;} if(nm==='switch'){for(let i=0;i<ra.length-1;i+=2)if(this._tr(this._n(ra[i],lc)))return this._n(ra[i+1],lc);return null;} if(nm==='choose'){const idx=this._num(this._n(ra[0],lc));return ra[idx]?this._n(ra[idx],lc):null;} const args=ra.map(a=>this._n(a,lc)); if(nm==='sum')return this._agg('sum',args); if(nm==='avg'||nm==='average')return this._agg('avg',args); if(nm==='count')return this._agg('count',args); if(nm==='maximum'||nm==='max')return this._agg('max',args); if(nm==='minimum'||nm==='min')return this._agg('min',args); if(nm==='distinctcount')return this._agg('dc',args); if(nm==='isnull')return args[0]==null; if(nm==='isnumeric')return typeof args[0]==='number'; if(nm==='isstring')return typeof args[0]==='string'; if(nm==='isdate')return args[0] instanceof Date; if(['totext','cstr','str','tostring'].includes(nm)){if(!args.length)return'';const v=args[0]; if(typeof v==='number'&&args[1]!=null)return v.toFixed(this._num(args[1])); if(v instanceof Date)return v.toLocaleDateString('es-EC'); return v==null?'':String(v);} if(['tonumber','cdbl','cint','val','num'].includes(nm))return args.length?this._num(args[0]):0; if(['tobool','cbool'].includes(nm))return args.length?this._tr(args[0]):false; if(nm==='len')return args.length?String(args[0]).length:0; if(nm==='ucase'||nm==='upper')return args.length?String(args[0]).toUpperCase():''; if(nm==='lcase'||nm==='lower')return args.length?String(args[0]).toLowerCase():''; if(nm==='trim')return args.length?String(args[0]).trim():''; if(nm==='ltrim'||nm==='trimleft')return args.length?String(args[0]).trimStart():''; if(nm==='rtrim'||nm==='trimright')return args.length?String(args[0]).trimEnd():''; if(nm==='left')return args.length>=2?String(args[0]).slice(0,this._num(args[1])):''; if(nm==='right'){const n=this._num(args[1]);return args.length>=2?String(args[0]).slice(-n)||'':'';} if(nm==='mid'){const s=String(args[0]),st=this._num(args[1])-1,le=args[2]!=null?this._num(args[2]):s.length;return s.slice(st,st+le);} if(nm==='instr'){if(args.length<2)return 0;const p=String(args[0]).indexOf(String(args[1]));return p>=0?p+1:0;} if(nm==='replace')return args.length>=3?String(args[0]).split(String(args[1])).join(String(args[2])):String(args[0]||''); if(nm==='space')return ' '.repeat(Math.max(0,this._num(args[0]))); if(nm==='replicate'||nm==='replicatestring')return args.length>=2?String(args[0]).repeat(this._num(args[1])):''; if(nm==='reverse'||nm==='strreverse')return args.length?String(args[0]).split('').reverse().join(''):''; if(nm==='propercase'||nm==='ucfirst')return args.length?String(args[0]).replace(/\b\w/g,c=>c.toUpperCase()):''; if(nm==='abs')return Math.abs(this._num(args[0])); if(nm==='round'){const d=args[1]!=null?this._num(args[1]):0;return parseFloat(this._num(args[0]).toFixed(d));} if(nm==='truncate'||nm==='int'||nm==='fix')return Math.trunc(this._num(args[0])); if(nm==='sqrt')return Math.sqrt(Math.max(0,this._num(args[0]))); if(nm==='pi')return Math.PI; if(nm==='power')return Math.pow(this._num(args[0]),this._num(args[1])); if(nm==='remainder')return this._num(args[0])%this._num(args[1]); if(nm==='sgn'){const v=this._num(args[0]);return v>0?1:v<0?-1:0;} if(nm==='today'||nm==='currentdate')return new Date(); if(nm==='now'||nm==='currentdatetime')return new Date(); if(nm==='year')return args.length?this._dp(args[0],'FullYear'):new Date().getFullYear(); if(nm==='month')return args.length?this._dp(args[0],'Month')+1:new Date().getMonth()+1; if(nm==='day')return args.length?this._dp(args[0],'Date'):new Date().getDate(); if(nm==='hour')return args.length?this._dp(args[0],'Hours'):0; if(nm==='minute')return args.length?this._dp(args[0],'Minutes'):0; if(nm==='second')return args.length?this._dp(args[0],'Seconds'):0; if(nm==='dateadd')return this._dadd(args); if(nm==='datediff')return this._ddiff(args); if(nm==='dateserial')return args.length>=3?new Date(this._num(args[0]),this._num(args[1])-1,this._num(args[2])):null; if(nm==='cdate')return args.length?this._pd(String(args[0])):null; if(nm==='pagenumber')return this._pg; if(nm==='totalpages')return this._tpg; if(nm==='recordnumber')return this._rn; return null;}
    _agg(fn,args){const items=this._grp.length?this._grp:this._all; const field=args.length&&typeof args[0]==='string'?args[0]:null; const vals=field?items.map(r=>r[field]).filter(v=>v!=null):(args.length?args:[]); if(fn==='sum')return vals.reduce((s,v)=>s+this._num(v),0); if(fn==='avg')return vals.length?vals.reduce((s,v)=>s+this._num(v),0)/vals.length:0; if(fn==='count')return vals.length; if(fn==='max')return vals.length?vals.reduce((m,v)=>v>m?v:m,vals[0]):null; if(fn==='min')return vals.length?vals.reduce((m,v)=>v<m?v:m,vals[0]):null; if(fn==='dc')return new Set(vals.map(String)).size; return 0;}
    _rv(nm,lc){const sp={pagenumber:this._pg,totalpages:this._tpg,recordnumber:this._rn,true:true,false:false}; if(nm.toLowerCase()in sp)return sp[nm.toLowerCase()]; if(nm in lc)return lc[nm]; if(nm in this._g)return this._g[nm]; if(nm in this._sh)return this._sh[nm]; return this._rf(nm);}
    _rf(path){if(!path)return null; const parts=path.split('.'); if(parts[0]==='param'&&parts.length>1)return this._params[parts.slice(1).join('.')]??null; let v=this._rec; for(const p of parts){if(v==null||typeof v!=='object')return null;v=v[p];} return v??null;}
    _pd(s){if(s instanceof Date)return s;const d=new Date(s);return isNaN(d)?null:d;} _dp(v,pt){const d=this._pd(v)||new Date();return d[`get${pt}`]?.()??0;} _tr(v){return v!=null&&v!==false&&v!==0&&v!=='';} _num(v){if(v==null||v==='')return 0;const n=parseFloat(v);return isNaN(n)?0:n;} _eq(a,b){if(a==null&&b==null)return true;if(a==null||b==null)return false;try{const na=parseFloat(a),nb=parseFloat(b);if(!isNaN(na)&&!isNaN(nb))return na===nb;}catch{}return String(a)===String(b);} _cmp(a,b){try{const na=parseFloat(a),nb=parseFloat(b);if(!isNaN(na)&&!isNaN(nb))return na<nb?-1:na>nb?1:0;}catch{}return String(a)<String(b)?-1:String(a)>String(b)?1:0;}
    _dadd(args){if(args.length<3)return null; const iv=String(args[0]).toLowerCase(),n=this._num(args[1]),d=this._pd(args[2]); if(!d)return null; const r=new Date(d); if(['d','day','days'].includes(iv))r.setDate(r.getDate()+n); else if(['m','month','months'].includes(iv))r.setMonth(r.getMonth()+n); else if(['y','year','years','yyyy'].includes(iv))r.setFullYear(r.getFullYear()+n); else if(['w','week','weeks'].includes(iv))r.setDate(r.getDate()+n*7); else if(['h','hour','hours'].includes(iv))r.setHours(r.getHours()+n); else if(['n','min','minute'].includes(iv))r.setMinutes(r.getMinutes()+n); return r;}
    _ddiff(args){if(args.length<3)return 0; const iv=String(args[0]).toLowerCase(),d1=this._pd(args[1]),d2=this._pd(args[2]); if(!d1||!d2)return 0; const ms=d2-d1; if(['d','day','days'].includes(iv))return Math.floor(ms/86400000); if(['w','week','weeks'].includes(iv))return Math.floor(ms/(86400000*7)); if(['m','month','months'].includes(iv))return(d2.getFullYear()-d1.getFullYear())*12+(d2.getMonth()-d1.getMonth()); if(['y','year','years','yyyy'].includes(iv))return d2.getFullYear()-d1.getFullYear(); if(['h','hour','hours'].includes(iv))return Math.floor(ms/3600000); return Math.floor(ms/86400000);}
  }
  const _ctx = new Ctx();
  return {
    Ctx,
    getContext(){ return _ctx; },
    validate(src){ try{new P(tokenize(src)).parse();return{valid:true};} catch(e){return{valid:false,error:e.message};} },
    eval(src, record={}, params={}){ const c=new Ctx(); c.setRecord(record); c.setParams(params); return c.eval(src); },
    evalWithContext(src){ return _ctx.eval(src); },
    getFunctions(){ return ['IIf','If','IsNull','IsNumeric','IsString','IsDate','Sum','Avg','Count','Maximum','Minimum','DistinctCount','ToText','ToNumber','CStr','CDate','CBool','UCase','LCase','Trim','LTrim','RTrim','Len','Left','Right','Mid','InStr','Replace','Space','ReplicateString','Reverse','ProperCase','Abs','Round','Truncate','Sqrt','Pi','Power','Remainder','Sgn','Year','Month','Day','Hour','Minute','Second','Today','Now','DateAdd','DateDiff','DateSerial','PageNumber','TotalPages','RecordNumber']; },
  };
})();

window.FormulaEngine = FormulaEngine;
