#!/usr/bin/env python3
"""Compare source markers in app PDFs with frozen Word reference regions.

Text-layer coordinates are reported separately: differing embedded font metrics
mean they are not a pixel fidelity score for the raster artwork.
"""
import json
import math
import re
import sys
from pathlib import Path
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "fixtures/columns"
manifest = json.loads((BASE / "manifest.json").read_text())
references = json.loads((BASE / "references/report.json").read_text())["fixtures"]
output = Path(sys.argv[1])
results = []
for source in manifest["fixtures"]:
    artifact = output / (source["id"] + ".pdf")
    if not artifact.exists():
        continue
    reference = next(item for item in references if item["id"] == source["id"])
    expected = reference["marker_coordinates"]
    pattern = re.compile("|".join(re.escape(marker) for marker in sorted(expected, key=lambda value: (-len(value), value))))
    found = {marker: [] for marker in expected}
    fonts = set()
    with pdfplumber.open(artifact) as pdf:
        for number, page in enumerate(pdf.pages, 1):
            text, offsets = "", []
            for index, char in enumerate(page.chars):
                value = char.get("text", "")
                text += value
                offsets.extend([index] * len(value))
                fonts.add(char.get("fontname", ""))
            for match in pattern.finditer(text):
                chars = [page.chars[index] for index in sorted(set(offsets[match.start():match.end()]))]
                prior = expected[match.group()][0]
                facts = source["source_facts"]
                config = facts["sections"][prior["source_section_index"]]["columns"] or {"num": 1, "space": 0}
                left, right = facts["margins_twips"]["left"] / 20, facts["margins_twips"]["right"] / 20
                gap = config["space"] / 20
                width = (facts["page_twips"]["width"] / 20 - left - right - (config["num"] - 1) * gap) / config["num"]
                x = min(char["x0"] for char in chars)
                column = min(config["num"] - 1, max(0, math.floor((x - left + .5) / (width + gap))))
                found[match.group()].append({"page": number, "column": column, "x0_pt": x, "top_pt": min(char["top"] for char in chars)})
        pages = len(pdf.pages)
    missing = [marker for marker, values in found.items() if not values]
    duplicates = {marker: len(values) for marker, values in found.items() if len(values) > 1}
    wrong_regions, deltas = [], []
    for marker, values in found.items():
        if len(values) != 1:
            continue
        actual, prior = values[0], expected[marker][0]
        if (actual["page"], actual["column"]) != (prior["page"], prior["physical_column_from_left"]):
            wrong_regions.append({"marker": marker, "actual": [actual["page"], actual["column"]], "word": [prior["page"], prior["physical_column_from_left"]]})
        deltas.append({"marker": marker, "x0_delta_pt": round(actual["x0_pt"] - prior["x0_pt"], 3), "top_delta_pt": round(actual["top_pt"] - prior["top_pt"], 3)})
    passed = pages == reference["page_count"] and not missing and not duplicates and not wrong_regions
    results.append({"id": source["id"], "status": "MARKER_REGIONS_PASS" if passed else "FAIL", "pages": pages,
                    "word_pages": reference["page_count"], "marker_count": len(expected), "missing": missing,
                    "duplicates": duplicates, "wrong_regions": wrong_regions, "app_text_layer_fonts": sorted(fonts),
                    "text_layer_deltas": deltas, "visual_fidelity": "NOT_SCORED"})
report = output / "word-comparison.json"
report.write_text(json.dumps(results, indent=2) + "\n")
print(json.dumps({"report": str(report), "results": [{key: value for key, value in item.items() if key != "text_layer_deltas"} for item in results]}, indent=2))
if not results or any(item["status"] == "FAIL" for item in results):
    sys.exit(1)
