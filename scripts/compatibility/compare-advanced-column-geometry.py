#!/usr/bin/env python3
"""Diagnose frozen A7 columns independently of whole-page/text-fidelity claims.

All COLUMN_nn markers are checked, not only the manifest's first/last pair.
Wrong-page/column anchors are classified before local coordinate differences.
No frozen input or prior report is written. Requires pypdf and pdfplumber.
"""
import argparse
import importlib.util
import json
import re
import statistics
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("compatibility_report", HERE / "report.py")
report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(report)
BASE = report.FIXTURES
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
CASES = ("columns", "table-columns", "mixed")


def source_geometry(source):
    with ZipFile(source) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    sections = root.findall(".//" + W + "sectPr")
    if len(sections) != 1:
        raise ValueError("Focused diagnostic requires one source section")
    section = sections[0]
    size, margins, columns = (section.find(W + name) for name in ("pgSz", "pgMar", "cols"))
    count = int(columns.get(W + "num", "1"))
    if columns.get(W + "equalWidth", "1") == "0" or list(columns):
        raise ValueError("Focused diagnostic requires equal source columns")
    width = float(size.get(W + "w")) / 20
    left, right = (float(margins.get(W + key)) / 20 for key in ("left", "right"))
    gap = float(columns.get(W + "space", "720")) / 20
    column_width = (width - left - right - gap * (count - 1)) / count
    text = "".join(element.text or "" for element in root.iter(W + "t"))
    return {"count": count, "left_pt": left, "width_pt": column_width, "gap_pt": gap}, sorted(set(re.findall(r"COLUMN_\d{2}", text)))


def region(position, geometry):
    # Mid-gap boundaries avoid labeling small glyph/cell insets as column moves.
    centers = [geometry["left_pt"] + index * (geometry["width_pt"] + geometry["gap_pt"]) + geometry["width_pt"] / 2 for index in range(geometry["count"])]
    return [position["page"], min(range(len(centers)), key=lambda index: abs(position["x_pt"] - centers[index]))]


def one(positions, marker):
    values = positions.get(marker, [])
    return values[0] if len(values) == 1 else None


def local_pair(positions, first, second, geometry):
    a, b = one(positions, first), one(positions, second)
    if not a or not b or region(a, geometry) != region(b, geometry):
        return None
    return {"x_css_px": round((b["x_pt"] - a["x_pt"]) * 4 / 3, 3), "y_css_px": round((b["y_pt"] - a["y_pt"]) * 4 / 3, 3)}


def compare_positions(before, after, markers, geometry):
    rows, wrong_regions = {}, []
    for marker in markers:
        a, b = one(before, marker), one(after, marker)
        item = {"word": before[marker], "app": after[marker]}
        if a and b:
            item.update(word_region=region(a, geometry), app_region=region(b, geometry))
            item["same_page"] = a["page"] == b["page"]
            item["same_region"] = item["word_region"] == item["app_region"]
            if item["same_region"]:
                item["local_delta_css_px"] = {"x": round((b["x_pt"] - a["x_pt"]) * 4 / 3, 3), "y": round((b["y_pt"] - a["y_pt"]) * 4 / 3, 3)}
            else:
                wrong_regions.append(marker)
        rows[marker] = item
    return rows, wrong_regions


def measure(fixture, app_dir, references):
    case = fixture["id"]
    source, reference, app = BASE / fixture["source"], references / (case + ".pdf"), app_dir / (case + ".pdf")
    if report.digest(source) != fixture["sha256"]:
        raise ValueError("Source hash differs from frozen manifest: " + case)
    profile = json.loads((references / "profile.json").read_text())
    provenance = json.loads((references / (case + ".provenance.json")).read_text())
    exports = json.loads((app_dir / "exports.json").read_text())
    export = next((item for item in exports["results"] if item["id"] == case), None)
    common = report.compare(fixture, reference, app, profile, export, provenance)
    if common["status"] in ("PENDING", "ERROR"):
        raise ValueError("Missing/invalid evidence: " + json.dumps(common))
    geometry, column_markers = source_geometry(source)
    markers = sorted(set(column_markers + fixture["expected"]["tokens_once"]))
    before, after = report.anchor_positions(reference, markers), report.anchor_positions(app, markers)
    rows, wrong_regions = compare_positions(before, after, markers, geometry)
    pitches = []
    for first, second in zip(column_markers, column_markers[1:]):
        a, b = local_pair(before, first, second, geometry), local_pair(after, first, second, geometry)
        if a and b:
            pitches.append({"from": first, "to": second, "word_css_px": a["y_css_px"], "app_css_px": b["y_css_px"], "delta_css_px": round(b["y_css_px"] - a["y_css_px"], 3)})
    relative = {}
    for name, first, second in (("table_first_row_width", "TABLE_A", "TABLE_B"), ("table_first_column_row_pitch", "TABLE_A", "TABLE_C"), ("table_inset_from_last_paragraph", "COLUMN_25", "TABLE_A")):
        if first not in markers or second not in markers:
            continue
        a, b = local_pair(before, first, second, geometry), local_pair(after, first, second, geometry)
        relative[name] = {"word": a, "app": b, "delta_css_px": {axis: round(b[axis] - a[axis], 3) for axis in a} if a and b else None}
    missing = [name for name, row in rows.items() if len(row["word"]) != 1 or len(row["app"]) != 1]
    local = [row["local_delta_css_px"] for row in rows.values() if "local_delta_css_px" in row]
    checks = {"provenance_valid": True, "page_count_equal": common["checks"]["page_count_equal"], "media_boxes_within_0_75pt": common["checks"]["media_boxes_within_0_75pt"], "all_expanded_markers_once": not missing, "expanded_marker_regions_equal": not wrong_regions and not missing, "all_expanded_anchors_within_1_css_px": not missing and not wrong_regions and all(abs(v[axis]) <= 1 for v in local for axis in ("x", "y"))}
    return {"id": case, "status": "MEASURED" if all(checks.values()) else "MISMATCH", "reference_pdf": report.display_path(reference), "app_pdf": report.display_path(app), "reference_sha256": common["reference"]["sha256"], "app_sha256": common["app"]["sha256"], "source_sha256": fixture["sha256"], "checks": checks, "page_counts": {"word": common["reference"]["page_count"], "app": common["app"]["page_count"]}, "content_checks": {key: common["checks"][key] for key in ("token_multisets_equal", "expected_markers_once", "link_count_equal", "link_destination_geometry_equal")}, "source_equal_columns": geometry, "expanded_marker_count": len(markers), "missing_or_duplicate_markers": missing, "wrong_region_markers": wrong_regions, "same_region_max_absolute_delta_css_px": {axis: max((abs(v[axis]) for v in local), default=None) for axis in ("x", "y")}, "paragraph_pitch": {"comparable_pairs": len(pitches), "mean_word_css_px": round(statistics.mean(row["word_css_px"] for row in pitches), 3) if pitches else None, "mean_app_css_px": round(statistics.mean(row["app_css_px"] for row in pitches), 3) if pitches else None, "pairs": pitches}, "relative_table_geometry": relative, "anchors": rows}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app", type=Path, default=BASE / "a7-app-pdfs")
    parser.add_argument("--references", type=Path, default=BASE / "references")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--require-regions", action="store_true", help="Exit 1 if expanded markers differ in page/column")
    args = parser.parse_args()
    manifest = json.loads((BASE / "manifest.json").read_text())
    cases = [measure(fixture, args.app, args.references) for fixture in manifest["fixtures"] if fixture["id"] in CASES]
    result = {"schema_version": 1, "comparison": "Frozen Word versus app: expanded A7 column anchors", "cases": cases, "limits": ["EXTRACTED_TEXT_ONLY: no visible glyph, border or whole-page fidelity score.", "Columns are physical zero-based indices from left; this focused corpus has one equal-column source section.", "Local deltas are omitted for wrong-page/column anchors; a coordinate subtraction across pages is not vertical drift.", "Paragraph pitch uses only adjacent markers sharing a region within each PDF. Region accuracy and local spacing are independent.", "MEASURED covers geometry checks listed here. Content/link differences remain separately reported; editability/model retention are not assessed."]}
    text = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text)
    else:
        print(text, end="")
    return int(args.require_regions and any(not case["checks"]["expanded_marker_regions_equal"] for case in cases))


if __name__ == "__main__":
    raise SystemExit(main())
