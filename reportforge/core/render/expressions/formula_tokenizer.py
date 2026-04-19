from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, List


class TT(str, Enum):
    NUM = "NUM"
    STR = "STR"
    BOOL = "BOOL"
    NAME = "NAME"
    OP = "OP"
    LPAREN = "LPAREN"
    RPAREN = "RPAREN"
    COMMA = "COMMA"
    SEMI = "SEMI"
    EOF = "EOF"
    FIELD = "FIELD"
    DATE = "DATE"


@dataclass
class Token:
    type: TT
    value: Any
    pos: int = 0


_KEYWORDS = frozenset([
    "if", "then", "else", "end", "and", "or", "not", "in", "like", "between",
    "select", "case", "default", "while", "do", "for", "to", "step", "exit",
    "local", "global", "shared", "dim", "numbervar", "stringvar", "booleanvar",
    "datevar", "datetimevar", "currencyvar", "true", "false", "null",
    "whilereadingrecords", "whileprintingrecords",
])


def tokenize(src: str) -> List[Token]:
    tokens: List[Token] = []
    i = 0
    n = len(src)

    while i < n:
        if src[i] in " \t\r\n":
            i += 1
            continue
        if src[i:i + 2] == "//":
            while i < n and src[i] != "\n":
                i += 1
            continue
        if src[i:i + 2] == "/*":
            end = src.find("*/", i + 2)
            i = end + 2 if end != -1 else n
            continue

        if src[i] == "#":
            j = src.find("#", i + 1)
            if j != -1:
                tokens.append(Token(TT.DATE, src[i + 1:j], i))
                i = j + 1
                continue

        if src[i] == "{":
            j = src.find("}", i + 1)
            if j != -1:
                tokens.append(Token(TT.FIELD, src[i + 1:j].strip(), i))
                i = j + 1
                continue

        if src[i] in ('"', "'"):
            q = src[i]
            j = i + 1
            buf = []
            while j < n:
                if src[j] == q:
                    if j + 1 < n and src[j + 1] == q:
                        buf.append(q)
                        j += 2
                    else:
                        j += 1
                        break
                else:
                    buf.append(src[j])
                    j += 1
            tokens.append(Token(TT.STR, "".join(buf), i))
            i = j
            continue

        if src[i].isdigit() or (src[i] == "." and i + 1 < n and src[i + 1].isdigit()):
            j = i
            while j < n and (src[j].isdigit() or src[j] == "."):
                j += 1
            s = src[i:j]
            tokens.append(Token(TT.NUM, float(s) if "." in s else int(s), i))
            i = j
            continue

        if src[i].isalpha() or src[i] == "_":
            j = i
            while j < n and (src[j].isalnum() or src[j] in "_."):
                if src[j] == "." and (j + 1 >= n or not (src[j + 1].isalpha() or src[j + 1] == "_")):
                    break
                j += 1
            word = src[i:j]
            wl = word.lower()
            if wl == "true":
                tokens.append(Token(TT.BOOL, True, i))
            elif wl == "false":
                tokens.append(Token(TT.BOOL, False, i))
            else:
                tokens.append(Token(TT.NAME, word, i))
            i = j
            continue

        for op in ("<>", "<=", ">=", "<", ">", "=", "+", "-", "*", "/", "^", "&", "%", "!", "?", ":"):
            if src[i:i + len(op)] == op:
                tokens.append(Token(TT.OP, op, i))
                i += len(op)
                break
        else:
            if src[i] == "(":
                tokens.append(Token(TT.LPAREN, "(", i))
                i += 1
            elif src[i] == ")":
                tokens.append(Token(TT.RPAREN, ")", i))
                i += 1
            elif src[i] == ",":
                tokens.append(Token(TT.COMMA, ",", i))
                i += 1
            elif src[i] == ";":
                tokens.append(Token(TT.SEMI, ";", i))
                i += 1
            else:
                i += 1

    tokens.append(Token(TT.EOF, None, n))
    return tokens
