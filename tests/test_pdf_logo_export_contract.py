from reportforge.core.render.engines.element_renderers import _image_src_candidates, _isrc


def test_reportforge_logo_relative_src_is_embedded_for_pdf_export():
    src = "reportforge/assets/logos/company_logo.png"

    candidates = _image_src_candidates(src)
    assert any(path.exists() for path in candidates)

    embedded = _isrc(src)
    assert embedded.startswith("data:image/")
    assert ";base64," in embedded
