#!/usr/bin/env python3
"""Separate PDF baseline placement from font-dependent search bounds.

Read-only diagnostic; does not adjust application layout or acceptance gates.
Uses the expanded comparator's frozen source/reference/export validation.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import statistics
import sys

import pdfplumber

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location(
    "column_geometry", Path(__file__).with_name("compare-advanced-column-geometry.py"))
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


def baselines(path, markers):
    result = {marker: [] for marker in markers}
    with pdfplumber.open(path) as pdf:
        for page_number, page in enumerate(pdf.pages, 1):
            for marker in markers:
                for match in page.search(marker, regex=False, return_chars=True):
                    chars = match["chars"]
                    if not chars or any(tuple(char["matrix"][:4]) != (1, 0, 0, 1) for char in chars):
                        raise ValueError("Unsupported PDF text transform: " + marker)
                    ys = [page.height - char["matrix"][5] for char in chars]
                    if max(ys) - min(ys) > 0.01:
                        raise ValueError("Marker spans baselines: " + marker)
                    result[marker].append({"page": page_number, "x_pt": match["x0"],
                                           "baseline_top_pt": statistics.mean(ys),
                                           "search_top_pt": match["top"],
                                           "font_names": sorted({char["fontname"] for char in chars})})
    if any(len(values) != 1 for values in result.values()):
        raise ValueError("Missing or duplicate marker in " + str(path))
    return {marker: values[0] for marker, values in result.items()}


def diagnose(fixture, app, references):
    measured = geometry.measure(fixture, app, references)
    markers = list(measured["anchors"])
    word = baselines(references / (fixture["id"] + ".pdf"), markers)
    current = baselines(app / (fixture["id"] + ".pdf"), markers)
    rows, regions = {}, {}
    for marker, original in measured["anchors"].items():
        a, b = word[marker], current[marker]
        row = {"word": a, "app": b, "same_region": original["same_region"]}
        if original["same_region"]:
            delta = (b["baseline_top_pt"] - a["baseline_top_pt"]) * 4 / 3
            search_delta = original["local_delta_css_px"]["y"]
            row.update(baseline_delta_css_px=round(delta, 6),
                       search_top_delta_css_px=search_delta,
                       search_bounds_contribution_css_px=round(search_delta - delta, 6))
            if marker.startswith("COLUMN_"):
                region = ":".join(map(str, original["word_region"]))
                regions.setdefault(region, []).append((marker, row))
        rows[marker] = row
    summaries = {}
    for region, entries in regions.items():
        first, last = entries[0], entries[-1]
        summaries[region] = {
            "first_marker": first[0], "last_marker": last[0], "marker_count": len(entries),
            "first_baseline_delta_css_px": first[1]["baseline_delta_css_px"],
            "last_baseline_delta_css_px": last[1]["baseline_delta_css_px"],
            "first_to_last_baseline_drift_css_px": round(last[1]["baseline_delta_css_px"] - first[1]["baseline_delta_css_px"], 6),
        }
    return {key: measured[key] for key in (
        "id", "reference_pdf", "app_pdf", "source_sha256", "reference_sha256", "app_sha256",
        "checks", "content_checks", "same_region_max_absolute_delta_css_px", "paragraph_pitch",
        "relative_table_geometry")} | {"region_baseline_summary": summaries, "anchors": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, required=True)
    parser.add_argument("--references", type=Path, default=geometry.BASE / "references")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads((geometry.BASE / "manifest.json").read_text())
    result = {"schema_version": 1, "method": "Unrotated PDF text-matrix baseline from page top, independent of font search bounds; 1 pt = 4/3 CSS px.",
              "cases": [diagnose(fixture, args.app, args.references) for fixture in manifest["fixtures"] if fixture["id"] in geometry.CASES],
              "limits": ["Diagnostic of supplied captures, not a new application capture or a visible glyph metric.",
                         "All expanded comparator gates and content/link differences remain unchanged.",
                         "Baseline agreement alone does not establish glyph, line-box, border, or editing equivalence.",
                         "Measured residuals do not authorize per-fixture offsets or inferred font-profile changes."]}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
