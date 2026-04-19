from __future__ import annotations

from typing import Any

from .formula_ast import *  # noqa: F401,F403
from .formula_tokenizer import *  # noqa: F401,F403
from .formula_parser_core import ParseError, FormulaParser


def parse_formula(src: str) -> Any:
    """Parse a CR formula string into an AST. Returns the AST root."""
    tokens = tokenize(src)
    return FormulaParser(tokens).parse()
