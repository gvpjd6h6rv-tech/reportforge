from __future__ import annotations

from typing import Any, List, Tuple

from .formula_ast import *
from .formula_tokenizer import *

# ── Parser ────────────────────────────────────────────────────────────────────

class ParseError(Exception):
    pass


class FormulaParser:
    """Recursive-descent CR formula parser."""

    def __init__(self, tokens: List[Token]):
        self._tok = tokens
        self._pos = 0

    @property
    def _cur(self) -> Token:
        return self._tok[self._pos]

    def _peek(self, offset=1) -> Token:
        p = self._pos + offset
        return self._tok[p] if p < len(self._tok) else self._tok[-1]

    def _eat(self, tt=None, val=None) -> Token:
        t = self._cur
        if tt and t.type != tt:
            raise ParseError(f"Expected {tt} but got {t.type}({t.value!r}) at pos {t.pos}")
        if val and str(t.value).lower() != str(val).lower():
            raise ParseError(f"Expected {val!r} but got {t.value!r} at pos {t.pos}")
        self._pos += 1
        return t

    def _check(self, tt=None, val=None) -> bool:
        t = self._cur
        if tt and t.type != tt: return False
        if val and str(t.value).lower() != str(val).lower(): return False
        return True

    def _match(self, tt=None, val=None) -> bool:
        if self._check(tt, val):
            self._pos += 1; return True
        return False

    def parse(self) -> Any:
        """Parse a complete formula — may be a block of statements or a single expr."""
        stmts = []
        while not self._check(TT.EOF):
            stmt = self._parse_statement()
            if stmt is not None:
                stmts.append(stmt)
            while self._match(TT.SEMI):
                pass
        if len(stmts) == 1:
            return stmts[0]
        return Block(stmts) if stmts else NullLit()

    def _parse_statement(self) -> Any:
        t = self._cur
        tl = str(t.value).lower() if t.type == TT.NAME else ''

        # EvalTiming declaration
        if tl in ('whilereadingrecords', 'whileprintingrecords'):
            self._pos += 1
            timing = EvalTiming.WHILE_READING if tl == 'whilereadingrecords' else EvalTiming.WHILE_PRINTING
            return EvalTimingDecl(timing)

        # Variable declaration
        if tl in ('local', 'global', 'shared'):
            return self._parse_var_decl()

        # Type-only declaration (no scope keyword)
        if tl in ('numbervar', 'stringvar', 'booleanvar', 'datevar', 'datetimevar', 'currencyvar'):
            return self._parse_var_decl(implicit_local=True)

        # If statement
        if tl == 'if':
            return self._parse_if()

        # Select Case
        if tl == 'select':
            return self._parse_select()

        # Assignment: VarName := Expr
        if t.type == TT.NAME and self._peek().type == TT.OP and self._peek().value == ':=':
            # wait — CR uses :=  but tokenizer splits : and = separately... handle
            pass

        return self._parse_expr()

    def _parse_var_decl(self, implicit_local=False) -> VarDecl:
        scope = VarScope.LOCAL
        if not implicit_local:
            s = self._eat(TT.NAME).value.lower()
            scope = {'local': VarScope.LOCAL, 'global': VarScope.GLOBAL,
                     'shared': VarScope.SHARED}.get(s, VarScope.LOCAL)

        # type keyword
        type_t = self._eat(TT.NAME)
        type_map = {
            'numbervar': VarType.NUMBER, 'stringvar': VarType.STRING,
            'booleanvar': VarType.BOOLEAN, 'datevar': VarType.DATE,
            'datetimevar': VarType.DATETIME, 'currencyvar': VarType.CURRENCY,
        }
        vtype = type_map.get(type_t.value.lower(), VarType.NUMBER)

        name = self._eat(TT.NAME).value
        init = None
        # optional := initializer
        if self._check(TT.OP, ':') and self._peek().type == TT.OP:
            self._pos += 2  # eat : =
            init = self._parse_expr()
        elif self._check(TT.OP, '='):
            self._pos += 1
            init = self._parse_expr()

        return VarDecl(scope, vtype, name, init)

    def _parse_if(self) -> IfExpr:
        self._eat(TT.NAME, 'if')
        cond = self._parse_expr()
        self._eat(TT.NAME, 'then')
        then_stmts = []
        while not self._check(TT.NAME, 'else') and not self._check(TT.NAME, 'end') \
              and not self._check(TT.EOF):
            then_stmts.append(self._parse_statement())
            while self._match(TT.SEMI): pass
        then_ = Block(then_stmts) if len(then_stmts) != 1 else then_stmts[0]

        else_ = None
        if self._match(TT.NAME, 'else'):
            else_stmts = []
            while not self._check(TT.NAME, 'end') and not self._check(TT.EOF):
                else_stmts.append(self._parse_statement())
                while self._match(TT.SEMI): pass
            else_ = Block(else_stmts) if len(else_stmts) != 1 else else_stmts[0]
        self._match(TT.NAME, 'end')
        return IfExpr(cond, then_, else_)

    def _parse_select(self) -> SelectExpr:
        self._eat(TT.NAME, 'select')
        expr = self._parse_expr()
        cases: List[Tuple[Any, Any]] = []
        default_ = None
        while self._check(TT.NAME, 'case') or self._check(TT.NAME, 'default'):
            if self._match(TT.NAME, 'default'):
                default_ = self._parse_statement()
            else:
                self._eat(TT.NAME, 'case')
                val = self._parse_expr()
                body = self._parse_statement()
                cases.append((val, body))
        return SelectExpr(expr, cases, default_)

    def _parse_expr(self) -> Any:
        return self._parse_or()

    def _parse_or(self) -> Any:
        left = self._parse_and()
        while self._check(TT.NAME, 'or'):
            self._pos += 1
            left = BinOp('or', left, self._parse_and())
        return left

    def _parse_and(self) -> Any:
        left = self._parse_not()
        while self._check(TT.NAME, 'and'):
            self._pos += 1
            left = BinOp('and', left, self._parse_not())
        return left

    def _parse_not(self) -> Any:
        if self._check(TT.NAME, 'not'):
            self._pos += 1
            return UnaryOp('not', self._parse_not())
        return self._parse_compare()

    def _parse_compare(self) -> Any:
        left = self._parse_concat()
        ops = {'=', '<>', '<', '>', '<=', '>='}
        while self._check(TT.OP) and self._cur.value in ops:
            op = self._eat(TT.OP).value
            left = BinOp(op, left, self._parse_concat())
        # 'in' operator
        if self._check(TT.NAME, 'in'):
            self._pos += 1
            self._eat(TT.LPAREN)
            items = [self._parse_expr()]
            while self._match(TT.COMMA):
                items.append(self._parse_expr())
            self._eat(TT.RPAREN)
            return FuncCall('__in__', [left] + items)
        # 'between' operator
        if self._check(TT.NAME, 'between'):
            self._pos += 1
            lo = self._parse_concat()
            self._match(TT.NAME, 'and')
            hi = self._parse_concat()
            return FuncCall('__between__', [left, lo, hi])
        return left

    def _parse_concat(self) -> Any:
        left = self._parse_add()
        while self._check(TT.OP, '&'):
            self._pos += 1
            left = BinOp('&', left, self._parse_add())
        return left

    def _parse_add(self) -> Any:
        left = self._parse_mul()
        while self._check(TT.OP) and self._cur.value in ('+', '-'):
            op = self._eat(TT.OP).value
            left = BinOp(op, left, self._parse_mul())
        return left

    def _parse_mul(self) -> Any:
        left = self._parse_unary()
        while self._check(TT.OP) and self._cur.value in ('*', '/', '%', '^'):
            op = self._eat(TT.OP).value
            left = BinOp(op, left, self._parse_unary())
        return left

    def _parse_unary(self) -> Any:
        if self._check(TT.OP, '-'):
            self._pos += 1
            return UnaryOp('-', self._parse_unary())
        if self._check(TT.OP, '+'):
            self._pos += 1
            return self._parse_unary()
        return self._parse_primary()

    def _parse_primary(self) -> Any:
        t = self._cur

        if t.type == TT.NUM:
            self._pos += 1
            return NumLit(t.value)

        if t.type == TT.STR:
            self._pos += 1
            return StrLit(t.value)

        if t.type == TT.BOOL:
            self._pos += 1
            return BoolLit(t.value)

        if t.type == TT.FIELD:
            self._pos += 1
            return FieldRef(t.value)

        if t.type == TT.DATE:
            self._pos += 1
            return DateLit(t.value)

        if t.type == TT.NAME:
            if str(t.value).lower() in ('null', 'crm', 'missing'):
                self._pos += 1
                return NullLit()
            # function call or variable reference
            name = t.value
            self._pos += 1
            if self._check(TT.LPAREN):
                self._pos += 1  # eat (
                args = []
                if not self._check(TT.RPAREN):
                    args.append(self._parse_expr())
                    while self._match(TT.COMMA):
                        args.append(self._parse_expr())
                self._eat(TT.RPAREN)
                return FuncCall(name, args)
            return VarRef(name)

        if t.type == TT.LPAREN:
            self._pos += 1
            expr = self._parse_expr()
            self._eat(TT.RPAREN)
            return expr

        # fallback
        self._pos += 1
        return NullLit()
