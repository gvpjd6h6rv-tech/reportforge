"""
RF-BARCODE-CODE39-1 / RF-BARCODE-QR-1 / RF-BARCODE-ALIAS-1

Red tests — all expected to fail until real encoders exist.
"""
import re
import unittest

from reportforge.core.render.engines.barcode_renderer import _render_barcode_svg


class TestCode39Distinct(unittest.TestCase):
    """code39 must produce a different SVG than code128 for the same value."""

    def _svg39(self, v):
        return _render_barcode_svg(v, "code39", 200, 80, False)

    def _svg128(self, v):
        return _render_barcode_svg(v, "code128", 200, 80, False)

    def test_code39_differs_from_code128_for_letter_A(self):
        self.assertNotEqual(self._svg39("A"), self._svg128("A"),
                            "code39 must NOT silently render as Code128B")

    def test_code39_differs_from_code128_for_digit(self):
        self.assertNotEqual(self._svg39("1"), self._svg128("1"))

    def test_code39_produces_real_bars(self):
        svg = self._svg39("A")
        rects = re.findall(r'<rect ', svg)
        self.assertGreater(len(rects), 0, "code39 must produce bar rects")

    def test_code39_letter_A_has_correct_bar_count(self):
        # Code39 'A' = START(*) + 'A' + STOP(*), each symbol has 9 elements (5 bars + 4 spaces)
        # 3 symbols × 5 bars = 15 filled rects (bars), plus background rect
        svg = self._svg39("A")
        rects = re.findall(r'<rect [^>]*fill="#000"', svg)
        # each Code39 symbol: 3 wide + 2 narrow bars = 5 bars per symbol, 3 symbols → 15
        self.assertEqual(len(rects), 15,
                         f"Code39 'A' (START+A+STOP) must have 15 black bar rects, got {len(rects)}")

    def test_code39_rejects_invalid_characters(self):
        # Code39 alphabet: A-Z, 0-9, space, - . $ / + %  only
        # CR silently uppercases — RF matches; truly invalid chars raise
        with self.assertRaises(ValueError):
            _render_barcode_svg("@", "code39", 200, 80, False)  # @ not in Code39 alphabet

    def test_code39_silently_uppercases(self):
        # Lowercase input must produce same result as uppercase (CR behavior)
        svg_lower = _render_barcode_svg("abc", "code39", 200, 80, False)
        svg_upper = _render_barcode_svg("ABC", "code39", 200, 80, False)
        self.assertEqual(svg_lower, svg_upper)

    def test_code39_rejects_start_stop_as_data(self):
        with self.assertRaises(ValueError):
            _render_barcode_svg("*", "code39", 200, 80, False)  # * is START/STOP, not data


class TestQRReal(unittest.TestCase):
    """QR must produce a scannable matrix, not a decorative placeholder."""

    def _qrsvg(self, v):
        return _render_barcode_svg(v, "qr", 200, 200, False)

    def test_qr_differs_from_placeholder(self):
        # The old placeholder had exactly 3 corner rects + some scattered cells
        # A real QR has hundreds of module rects
        svg = self._qrsvg("HELLO")
        rects = re.findall(r'<rect ', svg)
        # Even a version-1 QR (21×21) has 441 modules; many are white (bg) but
        # dark modules for a simple "HELLO" at level M should be > 100
        self.assertGreater(len(rects), 50,
                           f"QR must have many module rects for a real matrix, got {len(rects)}")

    def test_qr_distinct_values_produce_distinct_svgs(self):
        svg1 = self._qrsvg("HELLO")
        svg2 = self._qrsvg("WORLD")
        self.assertNotEqual(svg1, svg2, "different values must produce different QR matrices")

    def test_qr_has_finder_pattern_signature(self):
        # Finder patterns: three 7×7 dark squares at corners.
        # In a 21×21 QR grid scaled to 200px, each module is ~9.5px.
        # Real QR SVG must contain at least 3 filled 7-module-wide rects (finder outlines).
        svg = self._qrsvg("1")
        # A real QR will have contiguous dark runs wider than a single module
        # Placeholder only had 3 outline rects + a few scattered small squares
        dark_rects = re.findall(r'<rect [^>]*fill="#000"[^/]*/>', svg)
        self.assertGreater(len(dark_rects), 30,
                           f"Real QR finder + data modules must exceed 30 dark rects, got {len(dark_rects)}")

    def test_qr_fiscal_clave_acceso_length(self):
        # Typical Ecuador fiscal key is 49 chars; must not crash or produce placeholder
        clave = "2602202601991234567001120010010000248212345678" + "11"  # 47 chars
        svg = self._qrsvg(clave)
        self.assertIn("svg", svg)
        rects = re.findall(r'<rect ', svg)
        self.assertGreater(len(rects), 50)


class TestUnknownTypeExplicitError(unittest.TestCase):
    """Unknown barcode types must raise ValueError, not silently fall back."""

    def test_ean13_raises(self):
        with self.assertRaises(ValueError):
            _render_barcode_svg("123456789012", "ean13", 200, 80, False)

    def test_upc_raises(self):
        with self.assertRaises(ValueError):
            _render_barcode_svg("01234567890", "upc", 200, 80, False)

    def test_pdf417_raises(self):
        with self.assertRaises(ValueError):
            _render_barcode_svg("data", "pdf417", 200, 80, False)

    def test_empty_type_defaults_to_code128_not_raises(self):
        # Empty/None bc_type still defaults to code128 (backward compat)
        svg = _render_barcode_svg("A", "", 200, 80, False)
        self.assertIn("svg", svg)

    def test_gibberish_type_raises(self):
        with self.assertRaises(ValueError):
            _render_barcode_svg("A", "notabarcode", 200, 80, False)


if __name__ == "__main__":
    unittest.main()
