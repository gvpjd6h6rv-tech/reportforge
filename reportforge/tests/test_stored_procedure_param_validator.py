"""
test_stored_procedure_param_validator.py

Contract: validate_params() enforces the declared params schema — no
extra params, required present, correct type, string maxLength — and
never lets an undeclared key or wrong-typed value through.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(ROOT))

from reportforge.core.render.datasource.stored_procedure_param_validator import (
    StoredProcedureParamError,
    validate_params,
)

_DEFINITION = {
    "params": [
        {"name": "CardCode", "type": "string", "required": True, "maxLength": 5},
        {"name": "Limit", "type": "number", "required": False},
        {"name": "Active", "type": "boolean", "required": False, "default": True},
    ],
}


class TestStoredProcedureParamValidator(unittest.TestCase):

    def test_accepts_valid_params(self):
        result = validate_params(_DEFINITION, {"CardCode": "C001", "Limit": 10})
        self.assertEqual(result["CardCode"], "C001")
        self.assertEqual(result["Limit"], 10)

    def test_rejects_extra_param(self):
        with self.assertRaises(StoredProcedureParamError):
            validate_params(_DEFINITION, {"CardCode": "C001", "evil": "x"})

    def test_rejects_missing_required_param(self):
        with self.assertRaises(StoredProcedureParamError):
            validate_params(_DEFINITION, {})

    def test_allows_missing_optional_param(self):
        result = validate_params(_DEFINITION, {"CardCode": "C001"})
        self.assertNotIn("Limit", result)

    def test_fills_default_for_optional_missing_with_default(self):
        result = validate_params(_DEFINITION, {"CardCode": "C001"})
        self.assertEqual(result["Active"], True)

    def test_rejects_wrong_type_string_expected(self):
        with self.assertRaises(StoredProcedureParamError):
            validate_params(_DEFINITION, {"CardCode": 12345})

    def test_rejects_wrong_type_number_expected(self):
        with self.assertRaises(StoredProcedureParamError):
            validate_params(_DEFINITION, {"CardCode": "C001", "Limit": "not-a-number"})

    def test_enforces_max_length(self):
        with self.assertRaises(StoredProcedureParamError):
            validate_params(_DEFINITION, {"CardCode": "TOO-LONG-VALUE"})

    def test_boolean_true_is_not_mistaken_for_number(self):
        # bool is a subclass of int in Python — must not silently pass as "number"
        definition = {"params": [{"name": "Flag", "type": "number", "required": True}]}
        with self.assertRaises(StoredProcedureParamError):
            validate_params(definition, {"Flag": True})


if __name__ == "__main__":
    unittest.main()
