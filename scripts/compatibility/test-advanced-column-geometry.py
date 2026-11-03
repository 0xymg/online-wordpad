#!/usr/bin/env python3
"""Regression checks for separating region mistakes from local PDF deltas."""
import importlib.util
from pathlib import Path
import sys
import unittest

sys.dont_write_bytecode = True
path = Path(__file__).with_name("compare-advanced-column-geometry.py")
spec = importlib.util.spec_from_file_location("advanced_geometry", path)
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)
CONFIG = {"count": 2, "left_pt": 90, "width_pt": 198, "gap_pt": 36}


def position(page=1, x=90, y=72):
    return {"page": page, "x_pt": x, "y_pt": y}


class GeometryEvidenceTests(unittest.TestCase):
    def compare(self, before, after):
        return geometry.compare_positions({"MARKER": before}, {"MARKER": after}, ["MARKER"], CONFIG)

    def test_matching_page_count_cannot_hide_marker_on_wrong_page(self):
        rows, wrong = self.compare([position(page=2)], [position(page=1, x=324, y=635)])
        self.assertEqual(wrong, ["MARKER"])
        self.assertFalse(rows["MARKER"]["same_page"])
        self.assertNotIn("local_delta_css_px", rows["MARKER"])

    def test_wrong_column_is_not_local_horizontal_drift(self):
        rows, wrong = self.compare([position(x=324)], [position(x=90)])
        self.assertEqual(wrong, ["MARKER"])
        self.assertTrue(rows["MARKER"]["same_page"])
        self.assertNotIn("local_delta_css_px", rows["MARKER"])

    def test_cell_inset_does_not_change_physical_column(self):
        rows, wrong = self.compare([position(x=324.13)], [position(x=330.141)])
        self.assertEqual(wrong, [])
        self.assertEqual(rows["MARKER"]["word_region"], [1, 1])
        self.assertEqual(rows["MARKER"]["local_delta_css_px"]["x"], 8.015)

    def test_duplicate_marker_cannot_be_measured_as_one(self):
        rows, _ = self.compare([position()], [position(), position(y=100)])
        self.assertNotIn("same_region", rows["MARKER"])
        self.assertNotIn("local_delta_css_px", rows["MARKER"])

    def test_paragraph_pitch_does_not_span_column_transition(self):
        positions = {"A": [position(y=688)], "B": [position(x=324, y=72)]}
        self.assertIsNone(geometry.local_pair(positions, "A", "B", CONFIG))
        positions["B"] = [position(y=727)]
        self.assertEqual(geometry.local_pair(positions, "A", "B", CONFIG)["y_css_px"], 52)


if __name__ == "__main__":
    unittest.main()
