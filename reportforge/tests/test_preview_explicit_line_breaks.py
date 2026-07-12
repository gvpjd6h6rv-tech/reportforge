# RF-PREVIEW-EXPLICIT-LINE-BREAKS-1
# Preview must preserve line breaks authored in Design without turning on
# automatic word wrapping for the whole text object.
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.render.engines.element_style_helpers import _div


class TestPreviewExplicitLineBreaks(unittest.TestCase):
    def test_preview_preserves_authored_newlines_without_enabling_word_wrap(self):
        el = SimpleNamespace(
            wordWrap=False,
            canGrow=False,
            h=25,
            type="text",
            valign=None,
            bgColor="transparent",
            format=None,
            borderWidth=0,
            borderStyle="solid",
            borderColor="transparent",
            x=11,
            y=3,
            w=62,
            fontFamily="Arial",
            fontSize=6,
            bold=True,
            italic=False,
            underline=False,
            align="left",
            color="#000000",
            zIndex=0,
        )

        html = _div(None, el, "Cod.\nPrincipal")

        self.assertIn('class="cr-el nowrap"', html)
        self.assertIn(
            '<span class="cr-el-inner" style="white-space:pre">Cod.\nPrincipal</span>',
            html,
        )


if __name__ == "__main__":
    unittest.main()
