from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, List, Optional, Tuple


class EvalTiming(str, Enum):
    WHILE_READING = "whileReadingRecords"
    WHILE_PRINTING = "whilePrintingRecords"


class VarScope(str, Enum):
    LOCAL = "local"
    GLOBAL = "global"
    SHARED = "shared"


class VarType(str, Enum):
    NUMBER = "numbervar"
    STRING = "stringvar"
    BOOLEAN = "booleanvar"
    DATE = "datevar"
    DATETIME = "datetimevar"
    CURRENCY = "currencyvar"


@dataclass
class NumLit:
    value: float


@dataclass
class StrLit:
    value: str


@dataclass
class BoolLit:
    value: bool


@dataclass
class NullLit:
    pass


@dataclass
class DateLit:
    value: str


@dataclass
class FieldRef:
    path: str


@dataclass
class VarRef:
    name: str


@dataclass
class BinOp:
    op: str
    left: Any
    right: Any


@dataclass
class UnaryOp:
    op: str
    operand: Any


@dataclass
class FuncCall:
    name: str
    args: List[Any]


@dataclass
class IfExpr:
    cond: Any
    then_: Any
    else_: Optional[Any]


@dataclass
class SelectExpr:
    expr: Any
    cases: List[Tuple[Any, Any]]
    default_: Optional[Any]


@dataclass
class VarDecl:
    scope: VarScope
    type_: VarType
    name: str
    init: Optional[Any] = None


@dataclass
class Assignment:
    name: str
    value: Any


@dataclass
class Block:
    stmts: List[Any]


@dataclass
class EvalTimingDecl:
    timing: EvalTiming
