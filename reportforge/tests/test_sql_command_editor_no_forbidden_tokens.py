"""
test_sql_command_editor_no_forbidden_tokens.py

Contract: engines/SqlCommandEditor.js never references the SQL executor,
Preview, Field Explorer, or the document serializer/CommandRuntimeFile —
a purely static check on its own source text, outside comments (which
legitimately name these concepts in "does NOT" prose).
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "engines" / "SqlCommandEditor.js"

_FORBIDDEN_TOKENS = [
    "sql_executor", "execute_command", "PreviewEngine", "FieldExplorer",
    "CommandRuntimeFile", "serializer",
]


class TestSqlCommandEditorNoForbiddenTokens(unittest.TestCase):

    def test_no_forbidden_token_outside_the_leading_comment_block(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        # Strip the leading /** ... */ doc comment — it legitimately
        # names these concepts in its "NO hace" prose.
        start = source.find("/**")
        end = source.find("*/", start) + 2 if start != -1 else 0
        code_only = source[end:]
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, code_only, f"forbidden token {token!r} found in executable code")

    def test_only_fetch_target_is_the_parse_endpoint(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        import re
        fetch_calls = re.findall(r"fetch\(\s*['\"]([^'\"]+)['\"]", source)
        self.assertTrue(fetch_calls, "expected at least one fetch() call")
        for url in fetch_calls:
            self.assertEqual(url, "/sql-commands/parse")


if __name__ == "__main__":
    unittest.main()
