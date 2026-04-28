import sys
import unittest
from pathlib import Path


# These tests protect the stdlib-only dev server from import regressions.
# Keep them pure-import (no socket bind) so they can run in restricted sandboxes.
_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_ROOT))


class TestServerImports(unittest.TestCase):
    def test_server_and_barcode_route_import_cleanly(self):
        # If this fails, ./run.sh will also fail at startup.
        import reportforge_server  # noqa: F401
        import reportforge_server_route_barcode  # noqa: F401

    def test_barcode_route_uses_canonical_renderer(self):
        import reportforge_server_route_barcode as route
        from reportforge.core.render.engines import barcode_renderer

        # The route should import the renderer from its canonical module.
        self.assertIs(route._render_barcode_svg, barcode_renderer._render_barcode_svg)

    def test_barcode_route_does_not_import_from_advanced_engine(self):
        # Source-level guardrail: prevents "fixing" this by re-exporting in advanced_engine.
        src = (_ROOT / "reportforge_server_route_barcode.py").read_text(encoding="utf-8")
        self.assertIn(
            "from reportforge.core.render.engines.barcode_renderer import _render_barcode_svg",
            src,
        )
        self.assertNotIn("advanced_engine", src)

