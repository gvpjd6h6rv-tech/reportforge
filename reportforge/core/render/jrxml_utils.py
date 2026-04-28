from __future__ import annotations

import re
from pathlib import Path
from typing import Optional
import xml.etree.ElementTree as ET


def tag_name(el: ET.Element) -> str:
    return el.tag.split("}")[1] if "}" in el.tag else el.tag


def text_of(el: Optional[ET.Element]) -> str:
    if el is None:
        return ""
    return (el.text or "").strip()


def convert_expr(expr: str) -> str:
    if not expr:
        return ""
    expr = re.sub(r'\$F\{(\w+)\}', r'item.\1', expr)
    expr = re.sub(r'\$P\{(\w+)\}', r'param.\1', expr)
    expr = re.sub(r'\$V\{(\w+)\}', r'\1', expr)
    expr = expr.strip('"\'')
    expr = re.sub(r'"([^"]*)"', r'\1', expr)
    return expr.strip()


def guess_fmt(pattern: str) -> str:
    p = pattern.lower()
    if "#,##0.00" in p or "currency" in p:
        return "currency"
    if "#,##0" in p:
        return "int"
    if "%" in p:
        return "pct"
    if "yyyy" in p or "mm/dd" in p or "dd/mm" in p:
        return "date"
    return ""


def next_section_id(parser) -> str:
    parser._sec_counter += 1
    return f"jrxml-sec-{parser._sec_counter}"


def next_element_id(parser) -> str:
    parser._el_counter += 1
    return f"jrxml-el-{parser._el_counter}"

