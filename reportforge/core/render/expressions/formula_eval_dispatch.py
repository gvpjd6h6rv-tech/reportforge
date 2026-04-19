from __future__ import annotations

from typing import Any, Dict

from .formula_ast import (
    Assignment,
    BinOp,
    Block,
    BoolLit,
    DateLit,
    EvalTimingDecl,
    FieldRef,
    FuncCall,
    IfExpr,
    NullLit,
    NumLit,
    SelectExpr,
    StrLit,
    UnaryOp,
    VarDecl,
    VarRef,
    VarScope,
)
from .formula_eval_functions import eval_func
from .formula_eval_resolution import resolve_field, special_field
from .type_coercion import cmp, default_for_type, eq, truthy, to_num


def eval_node(evaluator, node: Any, local: Dict) -> Any:
    if isinstance(node, NumLit):
        return node.value
    if isinstance(node, StrLit):
        return node.value
    if isinstance(node, BoolLit):
        return node.value
    if isinstance(node, NullLit):
        return None
    if isinstance(node, DateLit):
        from .type_coercion import parse_date
        return parse_date(node.value)
    if isinstance(node, FieldRef):
        return resolve_field(evaluator, node.path)
    if isinstance(node, VarRef):
        name_l = node.name.lower()
        special = special_field(evaluator, name_l)
        if special is not None:
            return special
        if node.name in local:
            return local[node.name]
        if node.name in evaluator._global:
            return evaluator._global[node.name]
        if node.name in evaluator._shared:
            return evaluator._shared[node.name]
        return resolve_field(evaluator, node.name)
    if isinstance(node, VarDecl):
        init_val = eval_node(evaluator, node.init, local) if node.init else default_for_type(node.type_)
        if node.scope == VarScope.GLOBAL:
            if node.name not in evaluator._global:
                evaluator._global[node.name] = init_val
            return evaluator._global[node.name]
        if node.scope == VarScope.SHARED:
            if node.name not in evaluator._shared:
                evaluator._shared[node.name] = init_val
            return evaluator._shared[node.name]
        local[node.name] = init_val
        return init_val
    if isinstance(node, Assignment):
        val = eval_node(evaluator, node.value, local)
        if node.name in evaluator._global:
            evaluator._global[node.name] = val
        elif node.name in evaluator._shared:
            evaluator._shared[node.name] = val
        else:
            local[node.name] = val
        return val
    if isinstance(node, Block):
        result = None
        for stmt in node.stmts:
            result = eval_node(evaluator, stmt, local)
        return result if result is not None else ""
    if isinstance(node, IfExpr):
        cond = eval_node(evaluator, node.cond, local)
        if truthy(cond):
            return eval_node(evaluator, node.then_, local)
        if node.else_ is not None:
            return eval_node(evaluator, node.else_, local)
        return None
    if isinstance(node, SelectExpr):
        expr_val = eval_node(evaluator, node.expr, local)
        for case_val, case_body in node.cases:
            if eq(expr_val, eval_node(evaluator, case_val, local)):
                return eval_node(evaluator, case_body, local)
        if node.default_ is not None:
            return eval_node(evaluator, node.default_, local)
        return None
    if isinstance(node, EvalTimingDecl):
        return None
    if isinstance(node, BinOp):
        return eval_binop(evaluator, node, local)
    if isinstance(node, UnaryOp):
        v = eval_node(evaluator, node.operand, local)
        if node.op == "-":
            return -to_num(v)
        if node.op == "not":
            return not truthy(v)
        return v
    if isinstance(node, FuncCall):
        return eval_func(evaluator, node, local)
    return None


def eval_binop(evaluator, node: BinOp, local: Dict) -> Any:
    op = node.op
    if op == "and":
        return truthy(eval_node(evaluator, node.left, local)) and truthy(eval_node(evaluator, node.right, local))
    if op == "or":
        return truthy(eval_node(evaluator, node.left, local)) or truthy(eval_node(evaluator, node.right, local))

    left = eval_node(evaluator, node.left, local)
    right = eval_node(evaluator, node.right, local)

    if op == "+":
        if isinstance(left, str) or isinstance(right, str):
            return str(left or "") + str(right or "")
        return to_num(left) + to_num(right)
    if op == "-":
        return to_num(left) - to_num(right)
    if op == "*":
        return to_num(left) * to_num(right)
    if op == "/":
        r = to_num(right)
        return to_num(left) / r if r != 0 else 0
    if op == "^":
        return to_num(left) ** to_num(right)
    if op == "%":
        return to_num(left) % to_num(right)
    if op == "&":
        return str(left or "") + str(right or "")
    if op == "=":
        return eq(left, right)
    if op == "<>":
        return not eq(left, right)
    if op == "<":
        return cmp(left, right) < 0
    if op == ">":
        return cmp(left, right) > 0
    if op == "<=":
        return cmp(left, right) <= 0
    if op == ">=":
        return cmp(left, right) >= 0
    return None
