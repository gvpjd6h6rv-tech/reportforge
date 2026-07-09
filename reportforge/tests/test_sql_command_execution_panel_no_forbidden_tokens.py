"""
test_sql_command_execution_panel_no_forbidden_tokens.py

Contract: engines/SqlCommandExecutionPanel.js never references Field
Explorer, the document serializer/CommandRuntimeFile, schema discovery,
or stored-procedure endpoints — a purely static check on its own source
text, outside comments (which legitimately name these concepts in "does
NOT" prose). Its only fetch() target is POST /sql-commands/execute — it
never calls /datasources/{alias}/query or any stored-procedure route.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

MODULE_PATH = ROOT / "engines" / "SqlCommandExecutionPanel.js"

_FORBIDDEN_TOKENS = [
    "FieldExplorer", "FIELD_TREE", "CommandRuntimeFile", "serializer",
    "SqlCommandSchemaDiscovery", "query_registered",
    "/datasources/", "build-command", "/procedures",
    "SqlCommandStore.add", "SqlCommandStore.remove",
]


class TestSqlCommandExecutionPanelNoForbiddenTokens(unittest.TestCase):

    def test_no_forbidden_token_outside_the_leading_comment_block(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        start = source.find("/**")
        end = source.find("*/", start) + 2 if start != -1 else 0
        code_only = source[end:]
        for token in _FORBIDDEN_TOKENS:
            self.assertNotIn(token, code_only, f"forbidden token {token!r} found in executable code")

    def test_only_fetch_target_is_the_execute_endpoint(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        fetch_calls = re.findall(r"fetch\(\s*['\"]([^'\"]+)['\"]", source)
        self.assertTrue(fetch_calls, "expected at least one fetch() call")
        for url in fetch_calls:
            self.assertEqual(url, "/sql-commands/execute")

    def test_never_renders_the_raw_sql_text(self):
        # Contract: never show the full SQL (may contain sensitive
        # literals) — only name/id and datasource_alias are rendered.
        source = MODULE_PATH.read_text(encoding="utf-8")
        start = source.find("/**")
        end = source.find("*/", start) + 2 if start != -1 else 0
        code_only = source[end:]
        self.assertNotIn("cmd.sql}", code_only)
        self.assertNotIn("cmd.sql)", code_only)
        self.assertNotIn(".textContent = cmd.sql", code_only)

    def test_no_console_calls(self):
        source = MODULE_PATH.read_text(encoding="utf-8")
        self.assertNotRegex(source, r"console\.")


if __name__ == "__main__":
    unittest.main()
