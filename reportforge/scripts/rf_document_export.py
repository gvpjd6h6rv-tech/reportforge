"""rf_document_export — RF's own live-document export, wired to the shared
canonical contract pipeline (the same one sap_b1_linux's operational_docs_bridge.py
uses).

Single responsibility: fetch a live document via RF's OWN data source
(reportforge.core.models.invoice_model / remision_model — RF's independent SQL
query path against the SAP database, separate from sap_b1_linux's own SAP
Service Layer path) and produce the SAME contract payload SAP's bridge
produces for the SAME document, so both sources render identically through
the same layouts and the same renderer.

    RF source (build_invoice_model / build_remision_model)
      -> adapt_rf_invoice_model / adapt_rf_remision_model   (core/contracts/model_adapters.py)
      -> normalize_factura / normalize_guia                 (core/contracts/*_normalizer.py)
      -> render_document_pdf / render_document_html          (operational_docs.py — the SAME
         renderer sap_b1_linux's bridge calls; neither the renderer nor any
         layout file is touched here)

No hardcoded layout path: the caller supplies layout_path explicitly (e.g. the
same sap_b1_linux/reportforge_layouts/*.json files SAP renders against), so
this module stays agnostic of any specific project's directory layout.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any

from reportforge.core.models.invoice_model import build_invoice_model
from reportforge.core.models.remision_model import build_remision_model
from reportforge.core.contracts.model_adapters import (
    adapt_rf_invoice_model,
    adapt_rf_remision_model,
)
from reportforge.core.contracts.factura_normalizer import normalize_factura
from reportforge.core.contracts.guia_normalizer import normalize_guia
from reportforge.scripts.operational_docs import render_document_html, render_document_pdf


def build_factura_a4_payload_from_rf(doc_num: int, datasource_alias: str | None = None) -> dict[str, Any]:
    """RF's own data source -> canonical model -> factura contract payload."""
    raw_model = build_invoice_model(doc_num, datasource_alias=datasource_alias)
    return normalize_factura(adapt_rf_invoice_model(raw_model))


def build_guia_a4_payload_from_rf(doc_num: int, datasource_alias: str | None = None) -> dict[str, Any]:
    """RF's own data source -> canonical model -> guia contract payload."""
    raw_model = build_remision_model(doc_num, datasource_alias=datasource_alias)
    return normalize_guia(adapt_rf_remision_model(raw_model))


def render_factura_a4_html_from_rf(
    doc_num: int,
    *,
    layout_path: str | Path,
    datasource_alias: str | None = None,
    debug: bool = False,
) -> str:
    payload = build_factura_a4_payload_from_rf(doc_num, datasource_alias=datasource_alias)
    return render_document_html("factura_a4", payload, layout_path=layout_path, debug=debug)


def render_factura_a4_pdf_from_rf(
    doc_num: int,
    *,
    layout_path: str | Path,
    datasource_alias: str | None = None,
    debug: bool = False,
) -> bytes:
    payload = build_factura_a4_payload_from_rf(doc_num, datasource_alias=datasource_alias)
    return render_document_pdf("factura_a4", payload, layout_path=layout_path, debug=debug)


def render_guia_a4_html_from_rf(
    doc_num: int,
    *,
    layout_path: str | Path,
    datasource_alias: str | None = None,
    debug: bool = False,
) -> str:
    payload = build_guia_a4_payload_from_rf(doc_num, datasource_alias=datasource_alias)
    return render_document_html("guia_remision_a4", payload, layout_path=layout_path, debug=debug)


def render_guia_a4_pdf_from_rf(
    doc_num: int,
    *,
    layout_path: str | Path,
    datasource_alias: str | None = None,
    debug: bool = False,
) -> bytes:
    payload = build_guia_a4_payload_from_rf(doc_num, datasource_alias=datasource_alias)
    return render_document_pdf("guia_remision_a4", payload, layout_path=layout_path, debug=debug)
