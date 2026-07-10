"""
test_stored_procedure_security_no_freeform_exec.py

Contract (F19C security grep): no production source constructs an EXEC
statement by interpolating a value that came from the HTTP request body —
the only two f"EXEC {name}" sites in the codebase build the string from
an ALREADY-VALIDATED, allowlisted/registered procedure name, never from
raw request/user input directly.
"""
from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

_EXEC_ROUTE = ROOT / "reportforge" / "server" / "api_routes_stored_procedures.py"
_EXECUTOR = ROOT / "reportforge" / "core" / "render" / "datasource" / "stored_procedure_executor.py"


class TestStoredProcedureSecurityNoFreeformExec(unittest.TestCase):

    def test_route_never_reads_a_raw_procedure_field_from_the_request_body(self):
        source = _EXEC_ROUTE.read_text(encoding="utf-8")
        self.assertNotIn('body.get("procedure")', source)
        self.assertNotIn("body.get('procedure')", source)
        self.assertNotIn('body.get("sql")', source)
        self.assertNotIn("body.get('sql')", source)
        self.assertNotIn('body.get("procedure_name")', source)

    def test_route_only_reads_storedprocedureid_and_params_from_body(self):
        source = _EXEC_ROUTE.read_text(encoding="utf-8")
        body_get_calls = re.findall(r'body\.get\("([^"]+)"\)', source)
        self.assertEqual(set(body_get_calls), {"storedProcedureId", "params"})

    def test_executor_builds_exec_sql_only_from_the_registered_definition(self):
        source = _EXECUTOR.read_text(encoding="utf-8")
        # The one EXEC-building line must reference the local `procedure`
        # parameter of `_build_exec_sql`, fed only by
        # `definition["procedure"]` at its call site — never a value
        # traceable to raw_params or the HTTP request.
        self.assertIn('f"EXEC {procedure}"', source)
        self.assertIn('_build_exec_sql(definition["procedure"]', source)

    def test_no_string_concatenation_of_param_values_into_sql(self):
        source = _EXECUTOR.read_text(encoding="utf-8")
        # Parameter VALUES must never appear inside the function that
        # builds SQL — only bind-marker placeholders (":name") do.
        exec_sql_fn = source[source.index("def _build_exec_sql"):source.index("def execute_stored_procedure")]
        self.assertNotIn("raw_params", exec_sql_fn)
        self.assertNotIn("validated_params[", exec_sql_fn)


if __name__ == "__main__":
    unittest.main()
