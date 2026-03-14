# reportforge/tests/test_ui_smoke.py
# UI smoke tests — simulate designer interactions without a browser.
# Tests the server endpoints that the designer calls.
# All tests use unittest (no pytest dependency).
import sys, os, json, threading, time, unittest, urllib.request, urllib.error
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# ── Lazy server fixture ────────────────────────────────────────────────────────

_server = None
_port   = 9977

def _start_server():
    global _server
    if _server is not None:
        return
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'rfserver',
        Path(__file__).resolve().parents[2] / 'reportforge_server.py'
    )
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    from http.server import HTTPServer
    _server = HTTPServer(('127.0.0.1', _port), mod.RFHandler)
    t = threading.Thread(target=_server.serve_forever, daemon=True)
    t.start()
    time.sleep(0.4)


def _get(path, timeout=10):
    url = f'http://127.0.0.1:{_port}{path}'
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.status, r.read()


def _post(path, payload, timeout=10):
    body = json.dumps(payload).encode()
    req = urllib.request.Request(
        f'http://127.0.0.1:{_port}{path}', data=body,
        headers={'Content-Type': 'application/json'}, method='POST'
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read()


# ── Base class ─────────────────────────────────────────────────────────────────

class ServerTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _start_server()


# ═══════════════════════════════════════════════════════
# 1. SERVER HEALTH
# ═══════════════════════════════════════════════════════

class TestServerHealth(ServerTestCase):

    def test_health_returns_200(self):
        st, body = _get('/health')
        self.assertEqual(st, 200)

    def test_health_json_status_ok(self):
        st, body = _get('/health')
        d = json.loads(body)
        self.assertEqual(d['status'], 'ok')

    def test_health_has_version(self):
        _, body = _get('/health')
        d = json.loads(body)
        self.assertIn('version', d)

    def test_root_returns_200(self):
        st, _ = _get('/')
        self.assertEqual(st, 200)

    def test_designer_returns_html(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertIn('<!DOCTYPE', html)

    def test_designer_no_mousedown(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertNotIn("addEventListener('mousedown',", html,
                         "Designer still uses mousedown — should use pointerdown")

    def test_designer_uses_pointer_events(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertIn("addEventListener('pointerdown',", html)

    def test_designer_has_formula_engine(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertIn('FormulaEngine', html)

    def test_designer_has_raf_batching(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertIn('requestAnimationFrame', html)

    def test_designer_no_innerHTML_destruction(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertNotIn("layer.innerHTML=''", html)

    def test_designer_has_performance_css(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        self.assertIn('content-visibility', html)

    def test_designer_script_tags_balanced(self):
        _, body = _get('/')
        html = body.decode('utf-8', errors='replace')
        opens = html.count('<script')
        closes = html.count('</script')
        self.assertEqual(opens, closes,
                         f"Script tags unbalanced: {opens} open, {closes} close")


# ═══════════════════════════════════════════════════════
# 2. VALIDATE-FORMULA ENDPOINT
# ═══════════════════════════════════════════════════════

class TestValidateFormula(ServerTestCase):

    def _validate(self, formula, sample=None):
        payload = {'formula': formula}
        if sample:
            payload['sample'] = sample
        _, body = _post('/validate-formula', payload)
        return json.loads(body)

    def test_simple_arithmetic_valid(self):
        r = self._validate('{qty} * {price}')
        self.assertTrue(r['valid'], r)

    def test_iif_valid(self):
        r = self._validate('IIf({total} > 100, "High", "Low")')
        self.assertTrue(r['valid'], r)

    def test_dateadd_valid(self):
        r = self._validate('DateAdd("m", 3, #2024-01-01#)')
        self.assertTrue(r['valid'], r)

    def test_today_valid(self):
        r = self._validate('Today()')
        self.assertTrue(r['valid'], r)

    def test_now_valid(self):
        r = self._validate('Now()')
        self.assertTrue(r['valid'], r)

    def test_totext_valid(self):
        r = self._validate('ToText({amount}, 2)')
        self.assertTrue(r['valid'], r)

    def test_isnull_valid(self):
        r = self._validate('IsNull({field})')
        self.assertTrue(r['valid'], r)

    def test_sum_valid(self):
        r = self._validate('Sum({total})')
        self.assertTrue(r['valid'], r)

    def test_count_valid(self):
        r = self._validate('Count({id})')
        self.assertTrue(r['valid'], r)

    def test_datediff_valid(self):
        r = self._validate('DateDiff("d", #2024-01-01#, Today())')
        self.assertTrue(r['valid'], r)

    def test_if_then_else_valid(self):
        r = self._validate('If {score} >= 90 Then "A" Else "B"')
        self.assertTrue(r['valid'], r)

    def test_string_concat_valid(self):
        r = self._validate('{first_name} & " " & {last_name}')
        self.assertTrue(r['valid'], r)

    def test_tonumber_valid(self):
        r = self._validate('ToNumber({qty})')
        self.assertTrue(r['valid'], r)

    def test_unbalanced_parens_invalid(self):
        r = self._validate('IIf({x} > 1, "a", "b"')  # missing )
        self.assertFalse(r['valid'])
        self.assertTrue(any('paren' in e.lower() for e in r.get('errors', [])))

    def test_empty_formula_invalid(self):
        r = self._validate('')
        self.assertFalse(r['valid'])

    def test_sample_eval_arithmetic(self):
        r = self._validate('{price} * {qty}', {'price': 10, 'qty': 5})
        self.assertTrue(r['valid'])
        self.assertIsNotNone(r.get('result'))

    def test_sample_eval_totext(self):
        r = self._validate('ToText({amount}, 2)', {'amount': 3.14159})
        self.assertTrue(r['valid'])
        self.assertIn('3.14', r.get('result', ''))

    def test_field_refs_extracted(self):
        r = self._validate('{items.qty} * {items.price}')
        self.assertIn('items.qty', r.get('fieldRefs', []))

    def test_function_names_extracted(self):
        r = self._validate('IIf(IsNull({val}), 0, {val})')
        fns = [f.lower() for f in r.get('functions', [])]
        self.assertIn('iif', fns)

    def test_whilereadingrecords_valid(self):
        r = self._validate('WhileReadingRecords;\n{qty} * {price}')
        self.assertTrue(r['valid'], r)

    def test_local_var_valid(self):
        r = self._validate('Local NumberVar x := 10;\nx + {total}')
        self.assertTrue(r['valid'], r)

    def test_in_operator_valid(self):
        r = self._validate('{status} In ("Active", "Pending", "Review")')
        self.assertTrue(r['valid'], r)

    def test_between_operator_valid(self):
        r = self._validate('{score} Between 0 And 100')
        self.assertTrue(r['valid'], r)

    def test_pi_function_valid(self):
        r = self._validate('Pi()')
        self.assertTrue(r['valid'], r)

    def test_math_functions_valid(self):
        r = self._validate('Round(Abs({value}), 2)')
        self.assertTrue(r['valid'], r)


# ═══════════════════════════════════════════════════════
# 3. BARCODE PREVIEW ENDPOINT
# ═══════════════════════════════════════════════════════

class TestBarcodePreview(ServerTestCase):

    def test_code128_returns_svg(self):
        st, body = _get('/preview-barcode?value=RF-001&barcodeType=code128')
        self.assertEqual(st, 200)
        self.assertIn(b'<svg', body)

    def test_qrcode_returns_svg(self):
        st, body = _get('/preview-barcode?value=https://example.com&barcodeType=qr')
        self.assertEqual(st, 200)
        self.assertIn(b'<svg', body)

    def test_barcode_default_type(self):
        st, body = _get('/preview-barcode?value=12345')
        self.assertEqual(st, 200)

    def test_barcode_empty_value(self):
        st, body = _get('/preview-barcode?value=&barcodeType=code128')
        # Should handle gracefully
        self.assertIn(st, [200, 400])


# ═══════════════════════════════════════════════════════
# 4. DESIGNER PREVIEW / RENDER ENDPOINT
# ═══════════════════════════════════════════════════════

_MINIMAL_LAYOUT = {
    "name": "Test Report",
    "version": "3.0",
    "pageSize": "A4",
    "orientation": "portrait",
    "pageWidth": 754,
    "margins": {"top": 15, "bottom": 15, "left": 20, "right": 20},
    "sections": [
        {"id": "s-ph", "stype": "ph", "label": "Page Header", "height": 36},
        {"id": "s-det", "stype": "det", "label": "Detail", "height": 18, "iterates": "items"},
        {"id": "s-pf", "stype": "pf", "label": "Page Footer", "height": 30},
    ],
    "elements": [
        {"id": "e1", "type": "text", "sectionId": "s-ph", "x": 10, "y": 5,
         "w": 200, "h": 14, "content": "Test Report Header",
         "fontFamily": "Arial", "fontSize": 12, "bold": True,
         "italic": False, "underline": False, "align": "left",
         "color": "#000000", "bgColor": "transparent",
         "borderColor": "transparent", "borderWidth": 0, "zIndex": 0},
        {"id": "e2", "type": "field", "sectionId": "s-det", "x": 10, "y": 2,
         "w": 180, "h": 12, "fieldPath": "items.name",
         "fontFamily": "Arial", "fontSize": 10, "bold": False,
         "italic": False, "underline": False, "align": "left",
         "color": "#000000", "bgColor": "transparent",
         "borderColor": "transparent", "borderWidth": 0, "zIndex": 0},
    ],
    "groups": [],
    "sortBy": [],
    "parameters": [],
    "filters": [],
}

_SAMPLE_DATA = {
    "items": [
        {"id": 1, "name": "Widget Pro", "qty": 10, "unit_price": 25.00, "total": 250.00},
        {"id": 2, "name": "DataSync Suite", "qty": 5, "unit_price": 99.99, "total": 499.95},
    ],
    "empresa": {"razon_social": "Acme Corp"}
}


class TestDesignerPreview(ServerTestCase):

    def test_preview_post_returns_html(self):
        payload = {"layout": _MINIMAL_LAYOUT, "data": _SAMPLE_DATA}
        st, body = _post('/designer-preview', payload)
        self.assertEqual(st, 200)
        html = body.decode('utf-8', errors='replace')
        self.assertIn('<html', html.lower())

    def test_preview_renders_field_data(self):
        payload = {"layout": _MINIMAL_LAYOUT, "data": _SAMPLE_DATA}
        _, body = _post('/designer-preview', payload)
        html = body.decode('utf-8', errors='replace')
        self.assertIn('Widget Pro', html)

    def test_preview_renders_text_element(self):
        payload = {"layout": _MINIMAL_LAYOUT, "data": _SAMPLE_DATA}
        _, body = _post('/designer-preview', payload)
        html = body.decode('utf-8', errors='replace')
        self.assertIn('Test Report Header', html)

    def test_preview_with_groups(self):
        layout = {**_MINIMAL_LAYOUT}
        layout = dict(_MINIMAL_LAYOUT)
        layout['groups'] = [{'field': 'items.category', 'sortDesc': False, 'label': 'Category'}]
        payload = {"layout": layout, "data": _SAMPLE_DATA}
        st, body = _post('/designer-preview', payload)
        self.assertEqual(st, 200)

    def test_preview_with_parameters(self):
        layout = dict(_MINIMAL_LAYOUT)
        layout['parameters'] = [{'name': 'company', 'type': 'string',
                                   'defaultValue': 'Acme Corp', 'prompt': 'Company'}]
        payload = {"layout": layout, "data": _SAMPLE_DATA,
                   "params": {"company": "Acme Corp"}}
        st, _ = _post('/designer-preview', payload)
        self.assertEqual(st, 200)

    def test_preview_with_filters(self):
        layout = dict(_MINIMAL_LAYOUT)
        layout['filters'] = [{'field': 'items.total', 'op': '>', 'value': '100', 'connector': 'AND'}]
        payload = {"layout": layout, "data": _SAMPLE_DATA}
        st, _ = _post('/designer-preview', payload)
        self.assertEqual(st, 200)

    def test_preview_with_formula_elements(self):
        layout = dict(_MINIMAL_LAYOUT)
        layout = {**_MINIMAL_LAYOUT, 'elements': list(_MINIMAL_LAYOUT['elements']) + [
            {"id": "ef1", "type": "field", "sectionId": "s-det", "x": 200, "y": 2,
             "w": 100, "h": 12, "fieldPath": "", "formula": "{items.qty} * {items.unit_price}",
             "fontFamily": "Arial", "fontSize": 10, "bold": False,
             "italic": False, "underline": False, "align": "right",
             "color": "#000000", "bgColor": "transparent",
             "borderColor": "transparent", "borderWidth": 0, "zIndex": 0},
        ]}
        payload = {"layout": layout, "data": _SAMPLE_DATA}
        st, _ = _post('/designer-preview', payload)
        self.assertEqual(st, 200)

    def test_preview_empty_data(self):
        payload = {"layout": _MINIMAL_LAYOUT, "data": {"items": []}}
        st, _ = _post('/designer-preview', payload)
        self.assertEqual(st, 200)

    def test_preview_no_sections(self):
        layout = dict(_MINIMAL_LAYOUT)
        layout['sections'] = []
        layout['elements'] = []
        payload = {"layout": layout, "data": _SAMPLE_DATA}
        st, _ = _post('/designer-preview', payload)
        self.assertIn(st, [200, 400])  # graceful handling


# ═══════════════════════════════════════════════════════
# 5. EXPORT ENDPOINT
# ═══════════════════════════════════════════════════════

class TestExportEndpoint(ServerTestCase):

    def _render(self, fmt='pdf'):
        payload = {
            "layout": _MINIMAL_LAYOUT,
            "data": _SAMPLE_DATA,
            "format": fmt,
        }
        try:
            st, body = _post('/render', payload)
            return st, body
        except urllib.error.HTTPError as e:
            return e.code, b''

    def test_render_endpoint_exists(self):
        st, _ = _post('/render', {"layout": _MINIMAL_LAYOUT, "data": _SAMPLE_DATA})
        self.assertNotEqual(st, 404, "Render endpoint should exist")

    def test_render_html_format(self):
        st, body = _post('/render', {
            "layout": _MINIMAL_LAYOUT,
            "data": _SAMPLE_DATA,
            "format": "html"
        })
        if st == 200:
            html = body.decode('utf-8', errors='replace')
            self.assertIn('Widget Pro', html)


# ═══════════════════════════════════════════════════════
# 6. VALIDATE-LAYOUT ENDPOINT
# ═══════════════════════════════════════════════════════

class TestValidateLayout(ServerTestCase):

    def test_valid_layout(self):
        _, body = _post('/validate-layout', {"layout": _MINIMAL_LAYOUT})
        d = json.loads(body)
        self.assertTrue(d.get('valid'), d)

    def test_empty_layout_invalid(self):
        _, body = _post('/validate-layout', {"layout": {}})
        d = json.loads(body)
        self.assertFalse(d.get('valid'))

    def test_missing_sections_flagged(self):
        layout = {**_MINIMAL_LAYOUT, 'sections': []}
        _, body = _post('/validate-layout', {"layout": layout})
        d = json.loads(body)
        # May or may not be invalid — just must not crash
        self.assertIn('valid', d)

    def test_layout_with_unknown_element_type(self):
        layout = dict(_MINIMAL_LAYOUT)
        layout['elements'] = [
            {**_MINIMAL_LAYOUT['elements'][0], 'type': 'unknown_type_xyz'}
        ]
        _, body = _post('/validate-layout', {"layout": layout})
        d = json.loads(body)
        self.assertIn('valid', d)


# ═══════════════════════════════════════════════════════
# 7. FULL REPORT CREATION WORKFLOW
# ═══════════════════════════════════════════════════════

class TestReportWorkflow(ServerTestCase):
    """Simulate a complete designer session: create layout → validate → preview → export."""

    def test_full_workflow(self):
        # Step 1: Validate the layout
        _, body = _post('/validate-layout', {'layout': _MINIMAL_LAYOUT})
        d = json.loads(body)
        self.assertTrue(d.get('valid'), f"Layout should be valid: {d}")

        # Step 2: Validate a formula
        _, body = _post('/validate-formula', {
            'formula': 'IIf({items.total} > 200, "High", "Low")',
            'sample': {'items': {'total': 250}}
        })
        d = json.loads(body)
        self.assertTrue(d.get('valid'), f"Formula should be valid: {d}")

        # Step 3: Preview
        _, body = _post('/designer-preview', {
            'layout': _MINIMAL_LAYOUT,
            'data': _SAMPLE_DATA
        })
        html = body.decode('utf-8', errors='replace')
        self.assertIn('Widget Pro', html)

        # Step 4: Export
        st, _ = _post('/render', {'layout': _MINIMAL_LAYOUT, 'data': _SAMPLE_DATA})
        self.assertNotEqual(st, 500, "Export should not crash")

    def test_report_with_sections_resize(self):
        """Simulate section resize then re-validate."""
        layout = dict(_MINIMAL_LAYOUT)
        layout['sections'] = [
            dict(s, height=s['height'] + 20) for s in _MINIMAL_LAYOUT['sections']
        ]
        _, body = _post('/validate-layout', {'layout': layout})
        d = json.loads(body)
        self.assertIn('valid', d)

    def test_report_with_multiselect_align(self):
        """Multiple elements aligned — preview should work."""
        layout = dict(_MINIMAL_LAYOUT)
        # All elements aligned to x=10
        layout['elements'] = [
            {**e, 'x': 10} for e in _MINIMAL_LAYOUT['elements']
        ]
        _, body = _post('/designer-preview', {
            'layout': layout, 'data': _SAMPLE_DATA
        })
        self.assertIn(b'<html', body.lower())


if __name__ == '__main__':
    unittest.main(verbosity=2)
