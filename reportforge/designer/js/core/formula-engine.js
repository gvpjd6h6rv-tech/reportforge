/**
 * core/formula-engine.js — RF.Core.FormulaEngine
 * Client-side CR formula evaluator with:
 *   - variable scopes: local / global / shared
 *   - evaluation timing: whileReadingRecords / whilePrintingRecords
 *   - lazy iif/choose/switch
 *   - all standard CR functions
 *   - static analysis (field deps, syntax validation)
 */
import RF from '../rf.js';

RF.Core.FormulaEngine = (() => {

  // ── Tokenizer ─────────────────────────────────────────────────────────────

  const TT = Object.freeze({
    NUM:'NUM', STR:'STR', BOOL:'BOOL', NAME:'NAME', OP:'OP',
    LPAREN:'LPAREN', RPAREN:'RPAREN', COMMA:'COMMA', SEMI:'SEMI',
    FIELD:'FIELD', DATE:'DATE', EOF:'EOF',
  });

  function tokenize(src) {
    const tokens = [];
    let i = 0, n = src.length;
    while (i < n) {
      // Whitespace
      if (/\s/.test(src[i])) { i++; continue; }
      // Line comment
      if (src.slice(i,i+2) === '//') { while (i<n && src[i]!=='\n') i++; continue; }
      // Block comment
      if (src.slice(i,i+2) === '/*') {
        const end = src.indexOf('*/', i+2);
        i = end === -1 ? n : end+2; continue;
      }
      // Date literal #...#
      if (src[i] === '#') {
        const j = src.indexOf('#', i+1);
        if (j !== -1) { tokens.push({t:TT.DATE, v:src.slice(i+1,j), p:i}); i=j+1; continue; }
      }
      // Field {field.path}
      if (src[i] === '{') {
        const j = src.indexOf('}', i+1);
        if (j !== -1) { tokens.push({t:TT.FIELD, v:src.slice(i+1,j).trim(), p:i}); i=j+1; continue; }
      }
      // String
      if (src[i]==='"' || src[i]==="'") {
        const q=src[i]; let j=i+1, buf='';
        while (j<n) {
          if (src[j]===q) { if (src[j+1]===q){buf+=q;j+=2;} else {j++;break;} }
          else buf+=src[j++];
        }
        tokens.push({t:TT.STR, v:buf, p:i}); i=j; continue;
      }
      // Number
      if (/\d/.test(src[i]) || (src[i]==='.' && /\d/.test(src[i+1]||''))) {
        let j=i;
        while (j<n && (/\d/.test(src[j])||src[j]==='.')) j++;
        const s=src.slice(i,j);
        tokens.push({t:TT.NUM, v:s.includes('.')?parseFloat(s):parseInt(s,10), p:i});
        i=j; continue;
      }
      // Identifier/keyword (with dots for param.x, items.y)
      if (/[a-zA-Z_]/.test(src[i])) {
        let j=i;
        while (j<n && (/[a-zA-Z0-9_]/.test(src[j]) || (src[j]==='.' && j+1<n && /[a-zA-Z_]/.test(src[j+1])))) j++;
        const word=src.slice(i,j);
        const wl=word.toLowerCase();
        if (wl==='true')  { tokens.push({t:TT.BOOL,v:true, p:i}); }
        else if (wl==='false') { tokens.push({t:TT.BOOL,v:false,p:i}); }
        else { tokens.push({t:TT.NAME,v:word,p:i}); }
        i=j; continue;
      }
      // Multi-char operators
      const op2 = src.slice(i,i+2);
      if (['<>','<=','>=',':='].includes(op2)) {
        tokens.push({t:TT.OP,v:op2,p:i}); i+=2; continue;
      }
      // Single-char
      const c=src[i];
      if ('+-*/^%&!?:<>='.includes(c)) { tokens.push({t:TT.OP,v:c,p:i}); i++; continue; }
      if (c==='(') { tokens.push({t:TT.LPAREN,v:'(',p:i}); i++; continue; }
      if (c===')') { tokens.push({t:TT.RPAREN,v:')',p:i}); i++; continue; }
      if (c===',') { tokens.push({t:TT.COMMA,v:',',p:i}); i++; continue; }
      if (c===';') { tokens.push({t:TT.SEMI, v:';',p:i}); i++; continue; }
      i++;
    }
    tokens.push({t:TT.EOF,v:null,p:n});
    return tokens;
  }

  // ── Parser ────────────────────────────────────────────────────────────────

  class Parser {
    constructor(toks) { this._t=toks; this._p=0; }
    get _cur() { return this._t[this._p]; }
    _peek(d=1) { return this._t[Math.min(this._p+d, this._t.length-1)]; }
    _eat(tt,v) {
      const t=this._cur;
      if (tt && t.t!==tt) throw new SyntaxError(`Expected ${tt} got ${t.t}(${t.v}) at ${t.p}`);
      if (v && t.v?.toLowerCase()!==v.toLowerCase()) throw new SyntaxError(`Expected "${v}" got "${t.v}"`);
      this._p++; return t;
    }
    _match(tt,v) {
      if (this._cur.t===tt && (!v || this._cur.v?.toLowerCase()===v.toLowerCase())) { this._p++; return true; }
      return false;
    }
    _check(tt,v) {
      return this._cur.t===tt && (!v || this._cur.v?.toLowerCase()===v.toLowerCase());
    }

    parse() {
      const stmts=[];
      while (!this._check(TT.EOF)) {
        const s=this._parseStatement();
        if (s!==null) stmts.push(s);
        while (this._match(TT.SEMI));
      }
      return stmts.length===1 ? stmts[0] : stmts.length===0 ? {k:'null'} : {k:'block',stmts};
    }

    _parseStatement() {
      const t=this._cur;
      const v=typeof t.v==='string'?t.v.toLowerCase():'';
      if (v==='whilereadingrecords')  { this._p++; return {k:'timing',v:'reading'}; }
      if (v==='whileprintingrecords') { this._p++; return {k:'timing',v:'printing'}; }
      if (['local','global','shared'].includes(v)) return this._parseVarDecl();
      if (['numbervar','stringvar','booleanvar','datevar','datetimevar','currencyvar'].includes(v))
        return this._parseVarDecl(true);
      if (v==='if') return this._parseIf();
      if (v==='select') return this._parseSelect();
      return this._parseExpr();
    }

    _parseVarDecl(implicitLocal=false) {
      let scope='local';
      if (!implicitLocal) scope=this._eat(TT.NAME).v.toLowerCase();
      const typeT=this._eat(TT.NAME).v.toLowerCase();
      const name=this._eat(TT.NAME).v;
      let init=null;
      if (this._check(TT.OP,':=') || this._check(TT.OP,'=')) { this._p++; init=this._parseExpr(); }
      return {k:'decl',scope,type:typeT,name,init};
    }

    _parseIf() {
      this._eat(TT.NAME,'if');
      const cond=this._parseExpr();
      this._eat(TT.NAME,'then');
      const thenStmts=[];
      while (!this._check(TT.NAME,'else') && !this._check(TT.NAME,'end') && !this._check(TT.EOF)) {
        thenStmts.push(this._parseStatement()); while(this._match(TT.SEMI));
      }
      const then_=thenStmts.length===1?thenStmts[0]:{k:'block',stmts:thenStmts};
      let else_=null;
      if (this._match(TT.NAME,'else')) {
        const elseStmts=[];
        while (!this._check(TT.NAME,'end') && !this._check(TT.EOF)) {
          elseStmts.push(this._parseStatement()); while(this._match(TT.SEMI));
        }
        else_=elseStmts.length===1?elseStmts[0]:{k:'block',stmts:elseStmts};
      }
      this._match(TT.NAME,'end');
      return {k:'if',cond,then:then_,else:else_};
    }

    _parseSelect() {
      this._eat(TT.NAME,'select');
      const expr=this._parseExpr();
      const cases=[]; let default_=null;
      while (this._check(TT.NAME,'case')||this._check(TT.NAME,'default')) {
        if (this._match(TT.NAME,'default')) { default_=this._parseStatement(); }
        else { this._eat(TT.NAME,'case'); const cv=this._parseExpr(); const cb=this._parseStatement(); cases.push([cv,cb]); }
      }
      return {k:'select',expr,cases,default:default_};
    }

    _parseExpr()   { return this._parseOr(); }
    _parseOr()     { let l=this._parseAnd(); while(this._check(TT.NAME,'or')){this._p++;l={k:'binop',op:'or',l,r:this._parseAnd()};} return l; }
    _parseAnd()    { let l=this._parseNot(); while(this._check(TT.NAME,'and')){this._p++;l={k:'binop',op:'and',l,r:this._parseNot()};} return l; }
    _parseNot()    { if(this._check(TT.NAME,'not')){this._p++;return {k:'unary',op:'not',v:this._parseNot()};} return this._parseCmp(); }
    _parseCmp() {
      let l=this._parseConcat();
      const ops=['=','<>','<','>','<=','>='];
      while(this._check(TT.OP) && ops.includes(this._cur.v)) {
        const op=this._eat(TT.OP).v; l={k:'binop',op,l,r:this._parseConcat()};
      }
      if(this._check(TT.NAME,'in')) {
        this._p++; this._eat(TT.LPAREN);
        const items=[l,this._parseExpr()];
        while(this._match(TT.COMMA)) items.push(this._parseExpr());
        this._eat(TT.RPAREN); return {k:'call',name:'__in__',args:items};
      }
      if(this._check(TT.NAME,'between')) {
        this._p++; const lo=this._parseConcat(); this._match(TT.NAME,'and'); const hi=this._parseConcat();
        return {k:'call',name:'__between__',args:[l,lo,hi]};
      }
      return l;
    }
    _parseConcat() { let l=this._parseAdd(); while(this._check(TT.OP,'&')){this._p++;l={k:'binop',op:'&',l,r:this._parseAdd()};} return l; }
    _parseAdd()    { let l=this._parseMul(); while(this._check(TT.OP)&&(this._cur.v==='+'||this._cur.v==='-')){const op=this._eat(TT.OP).v;l={k:'binop',op,l,r:this._parseMul()};} return l; }
    _parseMul()    { let l=this._parseUnary(); while(this._check(TT.OP)&&'*/^%'.includes(this._cur.v)){const op=this._eat(TT.OP).v;l={k:'binop',op,l,r:this._parseUnary()};} return l; }
    _parseUnary()  {
      if(this._check(TT.OP,'-')) { this._p++; return {k:'unary',op:'-',v:this._parseUnary()}; }
      if(this._check(TT.OP,'+')) { this._p++; return this._parseUnary(); }
      return this._parsePrimary();
    }
    _parsePrimary() {
      const t=this._cur;
      if(t.t===TT.NUM)  { this._p++; return {k:'num',v:t.v}; }
      if(t.t===TT.STR)  { this._p++; return {k:'str',v:t.v}; }
      if(t.t===TT.BOOL) { this._p++; return {k:'bool',v:t.v}; }
      if(t.t===TT.FIELD){ this._p++; return {k:'field',v:t.v}; }
      if(t.t===TT.DATE) { this._p++; return {k:'date',v:t.v}; }
      if(t.t===TT.NAME) {
        const v=t.v.toLowerCase();
        if(v==='null'||v==='missing'){this._p++;return {k:'null'};}
        const name=t.v; this._p++;
        if(this._check(TT.LPAREN)) {
          this._p++;
          const args=[];
          if(!this._check(TT.RPAREN)) { args.push(this._parseExpr()); while(this._match(TT.COMMA))args.push(this._parseExpr()); }
          this._eat(TT.RPAREN);
          return {k:'call',name,args};
        }
        return {k:'var',name};
      }
      if(t.t===TT.LPAREN){ this._p++; const e=this._parseExpr(); this._eat(TT.RPAREN); return e; }
      this._p++; return {k:'null'};
    }
  }

  // ── Evaluation Context ─────────────────────────────────────────────────────

  class EvalContext {
    constructor() {
      this._global={};
      this._shared={};
      this._record={};
      this._allRecords=[];
      this._groupItems=[];
      this._params={};
      this._pageNumber=1;
      this._totalPages=1;
      this._recordNumber=0;
      this._formulas={};
    }

    setRecord(r, n=0)         { this._record=r||{}; this._recordNumber=n; }
    setRecords(rs)             { this._allRecords=rs||[]; }
    setGroup(items)            { this._groupItems=items||[]; }
    setParams(p)               { this._params=p||{}; }
    setPage(pg,tot)            { this._pageNumber=pg; this._totalPages=tot; }

    registerFormula(name, src, timing='whileReadingRecords') {
      try {
        const ast = new Parser(tokenize(src)).parse();
        this._formulas[name]={ast,timing,src};
      } catch(e) {
        this._formulas[name]={ast:null,timing,src,error:e.message};
      }
    }

    eval(expr) {
      // Named formula or inline expression
      if (this._formulas[expr]) {
        const f=this._formulas[expr];
        return f.ast ? this._evalNode(f.ast,{}) : null;
      }
      try {
        const ast=new Parser(tokenize(expr)).parse();
        return this._evalNode(ast,{});
      } catch { return null; }
    }

    validate(src) {
      try {
        const ast=new Parser(tokenize(src)).parse();
        const deps=this._collectDeps(ast);
        return {valid:true, deps, ast};
      } catch(e) {
        return {valid:false, error:e.message};
      }
    }

    _collectDeps(node) {
      if (!node) return [];
      const deps=new Set();
      const walk = n => {
        if (!n) return;
        if (n.k==='field') deps.add(n.v);
        if (n.k==='var') deps.add(n.name);
        if (n.k==='binop') { walk(n.l); walk(n.r); }
        if (n.k==='unary') walk(n.v);
        if (n.k==='call') n.args.forEach(walk);
        if (n.k==='if') { walk(n.cond); walk(n.then); walk(n.else); }
        if (n.k==='block') n.stmts.forEach(walk);
        if (n.k==='decl') walk(n.init);
      };
      walk(node);
      return [...deps];
    }

    _evalNode(node, local) {
      if (!node) return null;
      switch(node.k) {
        case 'num':   return node.v;
        case 'str':   return node.v;
        case 'bool':  return node.v;
        case 'null':  return null;
        case 'date':  return this._parseDate(node.v);
        case 'timing': return null;  // no-op
        case 'field': return this._resolveField(node.v);
        case 'var':   return this._resolveVar(node.name, local);
        case 'unary': return this._evalUnary(node, local);
        case 'binop': return this._evalBinop(node, local);
        case 'call':  return this._evalCall(node, local);
        case 'if':    return this._evalIf(node, local);
        case 'select':return this._evalSelect(node, local);
        case 'decl':  return this._evalDecl(node, local);
        case 'block': {
          let r=null;
          for (const s of node.stmts) r=this._evalNode(s, local);
          return r;
        }
      }
      return null;
    }

    _evalUnary(node, local) {
      const v=this._evalNode(node.v, local);
      if (node.op==='-') return -this._num(v);
      if (node.op==='not') return !this._truthy(v);
      return v;
    }

    _evalBinop(node, local) {
      const op=node.op;
      // Short-circuit
      if (op==='and') return this._truthy(this._evalNode(node.l,local)) && this._truthy(this._evalNode(node.r,local));
      if (op==='or')  return this._truthy(this._evalNode(node.l,local)) || this._truthy(this._evalNode(node.r,local));
      const l=this._evalNode(node.l,local), r=this._evalNode(node.r,local);
      switch(op) {
        case '+': return (typeof l==='string'||typeof r==='string') ? String(l??'')+String(r??'') : this._num(l)+this._num(r);
        case '-': return this._num(l)-this._num(r);
        case '*': return this._num(l)*this._num(r);
        case '/': { const d=this._num(r); return d===0?0:this._num(l)/d; }
        case '^': return Math.pow(this._num(l),this._num(r));
        case '%': return this._num(l)%this._num(r);
        case '&': return String(l??'')+String(r??'');
        case '=':  return this._eq(l,r);
        case '<>': return !this._eq(l,r);
        case '<':  return this._cmp(l,r)<0;
        case '>':  return this._cmp(l,r)>0;
        case '<=': return this._cmp(l,r)<=0;
        case '>=': return this._cmp(l,r)>=0;
      }
      return null;
    }

    _evalCall(node, local) {
      const name=node.name.toLowerCase();
      const rawArgs=node.args;

      // Lazy eval functions
      if (name==='iif'||name==='if') {
        if (!rawArgs.length) return null;
        const cond=this._evalNode(rawArgs[0],local);
        return this._evalNode(this._truthy(cond)?rawArgs[1]:rawArgs[2], local);
      }
      if (name==='__in__') {
        const val=this._evalNode(rawArgs[0],local);
        return rawArgs.slice(1).some(a=>this._eq(val, this._evalNode(a,local)));
      }
      if (name==='__between__') {
        const val=this._evalNode(rawArgs[0],local);
        const lo=this._evalNode(rawArgs[1],local), hi=this._evalNode(rawArgs[2],local);
        return this._cmp(val,lo)>=0 && this._cmp(val,hi)<=0;
      }
      if (name==='choose') {
        const idx=this._num(this._evalNode(rawArgs[0],local));
        return rawArgs[idx] ? this._evalNode(rawArgs[idx],local) : null;
      }
      if (name==='switch') {
        for (let i=0;i<rawArgs.length-1;i+=2) {
          if (this._truthy(this._evalNode(rawArgs[i],local))) return this._evalNode(rawArgs[i+1],local);
        }
        return null;
      }

      // Evaluate all args
      const args=rawArgs.map(a=>this._evalNode(a,local));

      // Aggregations
      const agg={'sum':this._aggSum,'avg':this._aggAvg,'average':this._aggAvg,
                 'count':this._aggCount,'maximum':this._aggMax,'max':this._aggMax,
                 'minimum':this._aggMin,'min':this._aggMin,'distinctcount':this._aggDistinct};
      if (agg[name]) return agg[name].call(this, args);

      // IsNull / type checks
      if (name==='isnull')    return args[0]==null;
      if (name==='isnumeric'||name==='isnumber') return typeof args[0]==='number';
      if (name==='isstring')  return typeof args[0]==='string';
      if (name==='isdate')    return args[0] instanceof Date;

      // Conversion
      if (['totext','cstr','str','tostring'].includes(name)) return this._fnToText(args);
      if (['tonumber','cdbl','cint','val','num'].includes(name)) return args.length?this._num(args[0]):0;
      if (['tobool','cbool'].includes(name)) return args.length?this._truthy(args[0]):false;

      // String
      if (name==='len')    return args.length?String(args[0]).length:0;
      if (name==='ucase'||name==='uppercase'||name==='upper') return args.length?String(args[0]).toUpperCase():'';
      if (name==='lcase'||name==='lowercase'||name==='lower') return args.length?String(args[0]).toLowerCase():'';
      if (name==='trim')   return args.length?String(args[0]).trim():'';
      if (name==='ltrim'||name==='trimleft')  return args.length?String(args[0]).trimStart():'';
      if (name==='rtrim'||name==='trimright') return args.length?String(args[0]).trimEnd():'';
      if (name==='left')   return args.length>=2?String(args[0]).slice(0,this._num(args[1])):'';
      if (name==='right')  { const n2=this._num(args[1]);return args.length>=2?String(args[0]).slice(-n2):''; }
      if (name==='mid')    { const s=String(args[0]),st=this._num(args[1])-1,le=args[2]!=null?this._num(args[2]):s.length;return s.slice(st,st+le); }
      if (name==='instr')  {
        if (args.length>=2) { const pos=String(args[0]).indexOf(String(args[1])); return pos>=0?pos+1:0; }
        return 0;
      }
      if (name==='replace') return args.length>=3?String(args[0]).split(String(args[1])).join(String(args[2])):String(args[0]||'');
      if (name==='space')   return ' '.repeat(Math.max(0,this._num(args[0])));
      if (name==='replicate'||name==='replicatestring') return args.length>=2?String(args[0]).repeat(this._num(args[1])):'';
      if (name==='reverse'||name==='strreverse') return args.length?String(args[0]).split('').reverse().join(''):'';
      if (name==='propercase'||name==='ucfirst') return args.length?String(args[0]).replace(/\b\w/g,c=>c.toUpperCase()):'';

      // Numeric
      if (name==='abs')    return Math.abs(this._num(args[0]));
      if (name==='round')  { const d=args[1]!=null?this._num(args[1]):0; return parseFloat(this._num(args[0]).toFixed(d)); }
      if (name==='truncate'||name==='int'||name==='fix') return Math.trunc(this._num(args[0]));
      if (name==='sqrt')   return Math.sqrt(Math.max(0,this._num(args[0])));
      if (name==='pi')     return Math.PI;
      if (name==='power')  return Math.pow(this._num(args[0]),this._num(args[1]));
      if (name==='remainder') return this._num(args[0])%this._num(args[1]);
      if (name==='sgn')    { const v=this._num(args[0]); return v>0?1:v<0?-1:0; }
      if (name==='exp')    return Math.exp(this._num(args[0]));
      if (name==='log')    return Math.log(this._num(args[0]));
      if (name==='sin')    return Math.sin(this._num(args[0]));
      if (name==='cos')    return Math.cos(this._num(args[0]));

      // Date
      if (name==='today'||name==='currentdate') return new Date();
      if (name==='now'||name==='currentdatetime') return new Date();
      if (name==='year')   return args.length?this._datePart(args[0],'FullYear'):new Date().getFullYear();
      if (name==='month')  return args.length?this._datePart(args[0],'Month')+1:new Date().getMonth()+1;
      if (name==='day')    return args.length?this._datePart(args[0],'Date'):new Date().getDate();
      if (name==='hour')   return args.length?this._datePart(args[0],'Hours'):0;
      if (name==='minute') return args.length?this._datePart(args[0],'Minutes'):0;
      if (name==='second') return args.length?this._datePart(args[0],'Seconds'):0;
      if (name==='dateadd') return this._fnDateAdd(args);
      if (name==='datediff') return this._fnDateDiff(args);
      if (name==='dateserial') {
        if (args.length>=3) return new Date(this._num(args[0]),this._num(args[1])-1,this._num(args[2]));
      }
      if (name==='cdate') return args.length?this._parseDate(String(args[0])):null;

      // Special fields
      if (name==='pagenumber')   return this._pageNumber;
      if (name==='totalpages')   return this._totalPages;
      if (name==='recordnumber') return this._recordNumber;

      return null;
    }

    _evalIf(node, local) {
      const cond=this._evalNode(node.cond,local);
      if (this._truthy(cond)) return this._evalNode(node.then,local);
      return node.else ? this._evalNode(node.else,local) : null;
    }

    _evalSelect(node, local) {
      const val=this._evalNode(node.expr,local);
      for (const [cv,cb] of node.cases) {
        if (this._eq(val, this._evalNode(cv,local))) return this._evalNode(cb,local);
      }
      return node.default ? this._evalNode(node.default,local) : null;
    }

    _evalDecl(node, local) {
      const defaults={numbervar:0,currencyvar:0,stringvar:'',booleanvar:false,datevar:new Date(),datetimevar:new Date()};
      const init = node.init ? this._evalNode(node.init,local) : defaults[node.type]??null;
      if (node.scope==='global') { if (!(node.name in this._global)) this._global[node.name]=init; return this._global[node.name]; }
      if (node.scope==='shared') { if (!(node.name in this._shared)) this._shared[node.name]=init; return this._shared[node.name]; }
      local[node.name]=init; return init;
    }

    // ── Aggregations ─────────────────────────────────────────────────────────

    _aggItems(args) {
      const items=this._groupItems.length?this._groupItems:this._allRecords;
      if (!args.length) return [null, items];
      if (typeof args[0]==='string') return [args[0], items];
      return [null, args];
    }

    _aggSum(args)     { const [f,it]=this._aggItems(args); return f?it.reduce((s,r)=>s+this._num(r[f]),0):it.reduce((s,v)=>s+this._num(v),0); }
    _aggAvg(args)     { const [f,it]=this._aggItems(args); const vals=f?it.map(r=>this._num(r[f])):it.map(v=>this._num(v)); return vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:0; }
    _aggCount(args)   { const [f,it]=this._aggItems(args); return f?it.filter(r=>r[f]!=null).length:it.length; }
    _aggMax(args)     { const [f,it]=this._aggItems(args); const v=f?it.map(r=>r[f]):it; return v.length?v.reduce((m,x)=>x>m?x:m,v[0]):null; }
    _aggMin(args)     { const [f,it]=this._aggItems(args); const v=f?it.map(r=>r[f]):it; return v.length?v.reduce((m,x)=>x<m?x:m,v[0]):null; }
    _aggDistinct(args){ const [f,it]=this._aggItems(args); return new Set(f?it.map(r=>r[f]):it).size; }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _resolveVar(name, local) {
      const special={pagenumber:this._pageNumber,totalpages:this._totalPages,
                     recordnumber:this._recordNumber,true:true,false:false,null:null};
      if (name.toLowerCase() in special) return special[name.toLowerCase()];
      if (name in local)        return local[name];
      if (name in this._global) return this._global[name];
      if (name in this._shared) return this._shared[name];
      return this._resolveField(name);
    }

    _resolveField(path) {
      if (!path) return null;
      const parts=path.split('.');
      if (parts[0]==='param' && parts.length>1) return this._params[parts.slice(1).join('.')] ?? null;
      let v=this._record;
      for (const p of parts) {
        if (v==null||typeof v!=='object') return null;
        v=v[p];
      }
      return v ?? null;
    }

    _parseDate(s) {
      if (s instanceof Date) return s;
      if (!s) return null;
      const d=new Date(s);
      return isNaN(d.getTime())?null:d;
    }

    _datePart(v, part) {
      const d=this._parseDate(v)||new Date();
      return d[`get${part}`]?.()??0;
    }

    _fnToText(args) {
      if (!args.length) return '';
      const v=args[0];
      if (typeof v==='number' && args[1]!=null) return v.toFixed(this._num(args[1]));
      if (v instanceof Date) {
        const fmt=args[1]||'dd/MM/yyyy';
        return v.toLocaleDateString('en-GB');
      }
      return v==null?'':String(v);
    }

    _fnDateAdd(args) {
      if (args.length<3) return null;
      const interval=String(args[0]).toLowerCase();
      const n=this._num(args[1]);
      const d=this._parseDate(args[2]); if (!d) return null;
      const r=new Date(d);
      if (['d','day','days'].includes(interval))     r.setDate(r.getDate()+n);
      else if (['m','month','months'].includes(interval)) r.setMonth(r.getMonth()+n);
      else if (['y','year','years','yyyy'].includes(interval)) r.setFullYear(r.getFullYear()+n);
      else if (['w','week','weeks'].includes(interval)) r.setDate(r.getDate()+n*7);
      else if (['h','hour','hours'].includes(interval)) r.setHours(r.getHours()+n);
      else if (['n','min','minute'].includes(interval)) r.setMinutes(r.getMinutes()+n);
      return r;
    }

    _fnDateDiff(args) {
      if (args.length<3) return 0;
      const interval=String(args[0]).toLowerCase();
      const d1=this._parseDate(args[1]),d2=this._parseDate(args[2]);
      if (!d1||!d2) return 0;
      const ms=d2-d1;
      if (['d','day','days'].includes(interval))  return Math.floor(ms/86400000);
      if (['w','week','weeks'].includes(interval)) return Math.floor(ms/(86400000*7));
      if (['m','month','months'].includes(interval)) return (d2.getFullYear()-d1.getFullYear())*12+(d2.getMonth()-d1.getMonth());
      if (['y','year','years','yyyy'].includes(interval)) return d2.getFullYear()-d1.getFullYear();
      if (['h','hour','hours'].includes(interval)) return Math.floor(ms/3600000);
      return Math.floor(ms/86400000);
    }

    _truthy(v) { return v!=null && v!==false && v!==0 && v!=='' && v!=='false' && v!=='0'; }
    _num(v)    { if (v==null||v==='') return 0; const n=parseFloat(v); return isNaN(n)?0:n; }
    _eq(a,b)   { if (a==null&&b==null) return true; if (a==null||b==null) return false; try { return parseFloat(a)===parseFloat(b); } catch { return String(a)===String(b); } }
    _cmp(a,b)  { try { const na=parseFloat(a),nb=parseFloat(b); if (!isNaN(na)&&!isNaN(nb)) return na<nb?-1:na>nb?1:0; } catch {} return String(a)<String(b)?-1:String(a)>String(b)?1:0; }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  const _sharedContext = new EvalContext();

  return {
    EvalContext,  // expose class for per-report instances

    /** Validate a formula expression, return {valid, error?, deps?} */
    validate(src) {
      try {
        const ast = new Parser(tokenize(src)).parse();
        const ctx = new EvalContext();
        const deps = ctx._collectDeps(ast);
        return { valid: true, deps };
      } catch(e) {
        return { valid: false, error: e.message };
      }
    },

    /** Quick evaluate against shared context (useful for formula editor preview) */
    evalQuick(src, record={}, params={}) {
      const ctx = new EvalContext();
      ctx.setRecord(record);
      ctx.setParams(params);
      try { return ctx.eval(src); } catch { return null; }
    },

    /** Extract field dependencies from a formula source */
    getDeps(src) {
      try {
        const ast = new Parser(tokenize(src)).parse();
        return new EvalContext()._collectDeps(ast);
      } catch { return []; }
    },

    /** Get all CR function names for autocomplete */
    getFunctionList() {
      return [
        'IIf','If','IsNull','IsNumeric','IsString','IsDate',
        'Sum','Avg','Count','Maximum','Minimum','DistinctCount',
        'ToText','ToNumber','CBool','CDate','CStr',
        'UCase','LCase','Trim','LTrim','RTrim','Len','Left','Right','Mid',
        'InStr','Replace','Space','ReplicateString','Reverse','ProperCase',
        'Abs','Round','Truncate','Sqrt','Pi','Power','Remainder','Sgn',
        'Year','Month','Day','Hour','Minute','Second','Today','Now',
        'DateAdd','DateDiff','DateSerial','CDate',
        'Choose','Switch','In','Between',
      ];
    },
  };
})();
