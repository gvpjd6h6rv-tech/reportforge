from __future__ import annotations

from pathlib import Path
from typing import Any

try:
    from fastapi import FastAPI, HTTPException, Request, Header, BackgroundTasks
    from fastapi.responses import Response, HTMLResponse, JSONResponse, StreamingResponse
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel, Field
    _HAS_FASTAPI = True
except ImportError:
    _HAS_FASTAPI = False
    FastAPI = object  # type: ignore
    Request = object  # type: ignore
    Header = object  # type: ignore
    BackgroundTasks = object  # type: ignore
    CORSMiddleware = object  # type: ignore

    class BaseModel:  # type: ignore
        pass

    def Field(*_a, **_k):  # type: ignore
        return None

    class _ResponseStub:  # type: ignore
        def __init__(self, content=None, media_type=None, status_code=200, headers=None, **_kw):
            self.content = content
            self.media_type = media_type
            self.status_code = status_code
            self.headers = headers or {}

        @property
        def body(self):
            return self.content if isinstance(self.content, bytes) else (self.content or "").encode()

    Response = _ResponseStub  # type: ignore
    HTMLResponse = _ResponseStub  # type: ignore
    JSONResponse = _ResponseStub  # type: ignore
    StreamingResponse = _ResponseStub  # type: ignore

    class HTTPException(Exception):  # type: ignore
        def __init__(self, status_code=500, detail=""):
            self.status_code = status_code
            self.detail = detail
            super().__init__(detail)


class RenderRequest(BaseModel):
    layout: Any = Field(..., description="Layout dict or file path string")
    data: Any = Field({}, description="Report data dict or URL")
    params: dict = Field({}, description="Report parameters")
    tenant: str = Field("default", description="Tenant ID for theme")
    debug: bool = Field(False)
    format: str = Field("pdf", description="pdf | html | png | csv | xlsx")


class JrxmlRenderRequest(BaseModel):
    jrxml: str = Field(..., description="Path to .jrxml file")
    data: Any = Field({}, description="Report data dict or URL")
    params: dict = Field({}, description="Report parameters")
    tenant: str = Field("default")
    format: str = Field("pdf")


class PreviewRequest(BaseModel):
    layout: Any = Field(..., description="Layout dict or file path string")
    data: Any = Field({}, description="Report data")
    params: dict = Field({})
    tenant: str = Field("default")


class TemplateRenderRequest(BaseModel):
    templateId: str = Field(..., description="Registered template ID")
    data: Any = Field({}, description="Report data")
    params: dict = Field({})
    tenant: str = Field("default")
    format: str = Field("pdf")


class RegisterTemplateRequest(BaseModel):
    templateId: str
    layout: dict
    tenant: str = Field("default")


class TenantThemeRequest(BaseModel):
    theme: dict
    params: dict = Field({})
    styles: dict = Field({})


class FormulaValidateRequest(BaseModel):
    formula: str = Field(..., description="CR formula expression to validate")
    fields: list = Field([], description="Known field names for context")
    sample: dict = Field({}, description="Sample data item for eval test")


class BarcodePreviewRequest(BaseModel):
    value: str = Field("RF-001", description="Value to encode")
    barcodeType: str = Field("code128", description="code128 | ean13 | qr | code39")
    width: int = Field(200)
    height: int = Field(80)
    showText: bool = Field(True)


class DatasourceRegisterRequest(BaseModel):
    alias: str = Field(..., description="Unique name for this datasource")
    type: str = Field("sqlite", description="sqlite | db | rest | json")
    url: str = Field("", description="SQLAlchemy URL or file path")
    query: str = Field("", description="Default SQL query")
    params: dict = Field({})
    ttl: int = Field(300, description="Cache TTL in seconds")
