from __future__ import annotations

def _el(id, tp, sid, x, y, w, h, **kw):
    base = dict(id=id, type=tp, sectionId=sid, x=x, y=y, w=w, h=h,
                fontFamily="Arial", fontSize=8, bold=False, italic=False,
                underline=False, align="left", color="#000000",
                bgColor="transparent", borderColor="transparent",
                borderWidth=0, borderStyle="solid",
                lineDir="h", lineWidth=1, zIndex=0,
                content="", fieldPath="", fieldFmt=None)
    base.update(kw)
    return base


# ═════════════════════════════════════════════════════════════════
