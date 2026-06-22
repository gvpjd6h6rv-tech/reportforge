"""
test_coercion_traceability.py — CoercionLogger traceability & lifecycle contracts.

Principle #22 "Fallbacks honestos" requires that coercion fallbacks never
write silently — every mismatch must be fully traceable back to the exact
source location and the logger's own lifecycle must be honest about what it
records and when.

This file deliberately does NOT duplicate test_failure_localization.py
(module/function_name/field/expected_type/received_type) or
test_error_snapshot.py (value_repr/result_repr bounding) — both already
cover those fields. The gaps left uncovered by either sibling, and closed
here, are:

Coverage:
  1. CoercionEvent.file and .line are present, non-empty, and point to the
     real call site (not a generic/unknown placeholder).
  2. The ring buffer (MAX_EVENTS=200) evicts the oldest entry once full,
     keeping the most recent 200.
  3. A logger that is disabled (the honest default) does not record any
     event — record_mismatch() is a true no-op, not just a quiet one.
  4. CoercionLogger.get() returns the same singleton instance every time,
     and the module-level `coercion_logger` import is that same instance.
  5. count() reflects the number of buffered events exactly.
  6. clear() leaves count() == 0 and last() == None.
"""
from __future__ import annotations

import unittest

from reportforge.core.render.expressions.coercion_logger import (
    CoercionLogger,
    coercion_logger,
)
from reportforge.core.render.expressions.type_coercion import to_num


class TestCoercionEventFileLine(unittest.TestCase):
    """CoercionEvent.file/.line must locate the real call site.

    record_mismatch()'s default _depth=1 is designed to be called through
    exactly one wrapper (to_num/parse_date/coerce — never directly by
    application code), so it walks one frame past its immediate caller to
    surface where THAT wrapper was invoked from. Calling record_mismatch()
    directly here would resolve to unittest's own internals, not this file
    — so these tests go through to_num(), the same one-level indirection
    test_failure_localization.py already relies on for module/function_name.
    """

    def setUp(self):
        self.gl = coercion_logger
        self.gl.enable()
        self.gl.clear()

    def tearDown(self):
        self.gl.disable()
        self.gl.clear()

    def test_event_has_file_field(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertTrue(hasattr(evt, "file"), "CoercionEvent must have a 'file' field")

    def test_file_is_non_empty_and_not_unknown(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertIsInstance(evt.file, str)
        self.assertGreater(len(evt.file), 0, "file must not be empty")
        self.assertNotEqual(evt.file, "<unknown>")

    def test_file_points_to_this_test_file(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertIn("test_coercion_traceability.py", evt.file,
                      "file must locate the actual caller of to_num(), not the logger module")

    def test_event_has_line_field(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertTrue(hasattr(evt, "line"), "CoercionEvent must have a 'line' field")

    def test_line_is_a_positive_integer(self):
        to_num("BAD")
        evt = self.gl.last()
        self.assertIsInstance(evt.line, int)
        self.assertGreater(evt.line, 0)

    def test_line_is_stable_for_repeated_calls_at_the_same_call_site(self):
        """Same source line called twice must report the same line number."""
        def trigger():
            to_num("BAD")

        trigger()
        line1 = self.gl.last().line
        self.gl.clear()
        trigger()
        line2 = self.gl.last().line
        self.assertEqual(line1, line2,
                          "the same call site must always report the same line")

    def test_different_call_sites_report_different_lines(self):
        """Sanity check: file/line is not a hardcoded constant."""
        to_num("BAD_A")
        line1 = self.gl.last().line
        to_num("BAD_B")  # next line — distinct call site
        line2 = self.gl.last().line
        self.assertNotEqual(line1, line2,
                             "two distinct call sites must report distinct line numbers")


class TestRingBufferEviction(unittest.TestCase):
    """MAX_EVENTS=200 ring buffer must evict the oldest entry once full."""

    def setUp(self):
        self.logger = CoercionLogger()
        self.logger.enable()

    def tearDown(self):
        self.logger.disable()
        self.logger.clear()

    def _fill(self, n):
        for i in range(n):
            self.logger.record_mismatch(value=i, expected_type="number", field=f"item-{i}")

    def test_buffer_capped_at_max_events(self):
        self._fill(250)
        self.assertEqual(self.logger.count(), 200,
                          "buffer must never exceed MAX_EVENTS=200")

    def test_oldest_entries_are_evicted_once_full(self):
        self._fill(250)
        fields = [e.field for e in self.logger.events()]
        self.assertNotIn("item-0", fields, "oldest entry (#0) must have been evicted")
        self.assertNotIn("item-49", fields, "entries before the eviction boundary must be gone")

    def test_newest_and_boundary_entries_survive(self):
        self._fill(250)
        fields = [e.field for e in self.logger.events()]
        self.assertIn("item-249", fields, "most recent entry must survive")
        self.assertIn("item-50", fields, "the oldest surviving entry must be exactly at the boundary")

    def test_no_eviction_below_max_events(self):
        self._fill(200)
        self.assertEqual(self.logger.count(), 200)
        fields = [e.field for e in self.logger.events()]
        self.assertIn("item-0", fields, "no eviction should occur until the buffer is over capacity")


class TestDisabledLoggerIsHonest(unittest.TestCase):
    """A disabled logger (the honest default) must not record anything."""

    def test_fresh_logger_is_disabled_by_default(self):
        logger = CoercionLogger()
        self.assertFalse(logger.is_enabled, "CoercionLogger must default to disabled")

    def test_record_mismatch_is_a_true_noop_when_disabled(self):
        logger = CoercionLogger()
        logger.record_mismatch(value="bad", expected_type="number")
        self.assertEqual(logger.count(), 0, "disabled logger must not buffer any event")
        self.assertIsNone(logger.last())

    def test_disabling_after_enabling_stops_further_recording(self):
        logger = CoercionLogger()
        logger.enable()
        logger.record_mismatch(value="a", expected_type="number")
        self.assertEqual(logger.count(), 1)
        logger.disable()
        logger.record_mismatch(value="b", expected_type="number")
        self.assertEqual(logger.count(), 1,
                          "disabling must stop new events without discarding old ones")


class TestSingletonStability(unittest.TestCase):
    """CoercionLogger.get() must always return the same instance."""

    def test_get_returns_the_same_instance_every_call(self):
        a = CoercionLogger.get()
        b = CoercionLogger.get()
        self.assertIs(a, b)

    def test_module_level_coercion_logger_is_the_singleton(self):
        self.assertIs(coercion_logger, CoercionLogger.get(),
                       "the importable `coercion_logger` must be the same singleton")

    def test_state_set_through_one_reference_is_visible_through_another(self):
        a = CoercionLogger.get()
        was_enabled = a.is_enabled
        try:
            a.enable()
            b = CoercionLogger.get()
            self.assertTrue(b.is_enabled,
                             "enabling via one reference must be visible via any other get()")
        finally:
            if not was_enabled:
                a.disable()
            a.clear()


class TestCountMethod(unittest.TestCase):
    """count() must exactly reflect the number of buffered events."""

    def setUp(self):
        self.logger = CoercionLogger()
        self.logger.enable()

    def tearDown(self):
        self.logger.disable()
        self.logger.clear()

    def test_count_is_zero_when_empty(self):
        self.assertEqual(self.logger.count(), 0)

    def test_count_increments_per_recorded_event(self):
        self.logger.record_mismatch(value="a", expected_type="number")
        self.assertEqual(self.logger.count(), 1)
        self.logger.record_mismatch(value="b", expected_type="number")
        self.assertEqual(self.logger.count(), 2)

    def test_count_matches_length_of_events(self):
        for i in range(5):
            self.logger.record_mismatch(value=i, expected_type="number")
        self.assertEqual(self.logger.count(), len(self.logger.events()))


class TestClearMethod(unittest.TestCase):
    """clear() must leave count() == 0 and last() == None."""

    def setUp(self):
        self.logger = CoercionLogger()
        self.logger.enable()

    def tearDown(self):
        self.logger.disable()
        self.logger.clear()

    def test_clear_resets_count_to_zero(self):
        self.logger.record_mismatch(value="a", expected_type="number")
        self.logger.record_mismatch(value="b", expected_type="number")
        self.assertEqual(self.logger.count(), 2)
        self.logger.clear()
        self.assertEqual(self.logger.count(), 0)

    def test_clear_makes_last_return_none(self):
        self.logger.record_mismatch(value="a", expected_type="number")
        self.logger.clear()
        self.assertIsNone(self.logger.last())

    def test_clear_on_an_already_empty_buffer_is_safe(self):
        self.logger.clear()
        self.assertEqual(self.logger.count(), 0)
        self.logger.clear()
        self.assertEqual(self.logger.count(), 0)


if __name__ == "__main__":
    unittest.main()
