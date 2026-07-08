"""
test_stored_procedure_catalog_no_ui_imports.py

Contract: this module's source contains no UI, HTTP, Field Explorer,
Preview, or document-serializer references — a purely backend, static
check on its own import list and full source text.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "reportforge" / "core" / "render" / "datasource" / "stored_procedure_catalog.py"

_FORBIDDEN_TOKENS = [
    "fastapi", "FastAPI", "HTTPException",
    "engines/", "engines.", "FieldExplorer",
    "PreviewEngine", "document_serializer", "DocumentSerializer",
    "request.", "response.",
]


class TestStoredProcedureCatalogNoUiImports(unittest.TestCase):

    def test_source_contains_no_forbidden_tokens_outside_comments(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        # Strip the module docstring/comments' prose mentions of what it
        # does NOT do — those legitimately name forbidden concepts in
        # explanatory text. Only fail on tokens appearing in actual code
        # lines (a real import or a real call), i.e. outside the leading
        # triple-quoted docstring block.
        doc_end = source.find('"""', source.find('"""') + 3) + 3
        code_only = source[doc_end:]
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, code_only, f"forbidden token {token!r} found in executable code")

    def test_no_fastapi_or_engines_import_statement(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        import_lines = [line for line in source.splitlines() if line.strip().startswith(("import ", "from "))]
        for line in import_lines:
            self.assertNotIn("fastapi", line.lower())
            self.assertNotIn("engines", line.lower())


if __name__ == "__main__":
    unittest.main()
