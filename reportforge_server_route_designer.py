from __future__ import annotations

from reportforge_server_designer import _minimal_designer_html
from reportforge_server_http_utils import _html
from reportforge_server_shared import _DESIGNER_HTML, _DESIGNER_HTML_V3, get_designer_build_info


def _serve_designer(handler, force_mode=None):
    path = _DESIGNER_HTML if _DESIGNER_HTML.exists() else _DESIGNER_HTML_V3
    if path.exists():
        html = path.read_text(encoding="utf-8")
        build = get_designer_build_info()
        html = html.replace('__RF_BUILD_COMMIT__', build.get('commit', 'unknown'))
        html = html.replace('__RF_BUILD_ASSET_VERSION__', build.get('assetVersion', 'unknown'))
        html = html.replace('__RF_BUILD_HTML_TIMESTAMP__', build.get('htmlTimestamp', 'unknown'))
        html = html.replace('__RF_BUILD_JS_TIMESTAMP__', build.get('jsTimestamp', 'unknown'))
        html = html.replace('__RF_BUILD_JS_ROUTE__', build.get('jsRoute', '/engines/ZoomEngine.js'))
        html = html.replace('__RF_BUILD_HTML_ROUTE__', build.get('htmlRoute', '/designer/crystal-reports-designer-v4.html'))
        html = html.replace('__RF_BUILD_CACHE_STATUS__', build.get('cacheStatus', 'no-store'))
        if force_mode:
            html = html.replace('data-ui="classic"', f'data-ui="{force_mode}"', 1)
    else:
        html = _minimal_designer_html()
    _html(handler, html)
