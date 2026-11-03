# Word Online column spacing default probe

The exact source `column-space-defaults.docx` contains three successive next-page sections, each with `w:num="2"`, `w:equalWidth="1"`, no separator, and respectively omitted `w:space`, explicit `0`, and explicit `720` twips. Its SHA-256 is `3d5771c585ade25c4f859bfc432c98a7972cb5a3f134652ba3ce6ad880ad4627`. The archived three-page `column-space-defaults.word.pdf` is byte-identical to the download and has SHA-256 `3985cf76e6a0e2c0f8d3744962230a59fda15ef2afc1a4c56e2547761695da80`. Capture details are in the adjacent provenance file.

PDF text-layer word starts in points from the left edge, extracted with pdfplumber:

| Section | Page | LEFT x | RIGHT x |
| --- | ---: | ---: | ---: |
| omitted | 1 | 72.025 | 324.130 |
| explicit 0 | 2 | 72.025 | 306.130 |
| explicit 720 | 3 | 72.025 | 324.130 |

For this source and Word Online export, omitted spacing matches explicit 720 twips; the zero anchor is 18 pt to the left. This is consistent with Word using a 720-twip gap for this omitted attribute in this case. Coordinates are extracted text-layer anchors, not an independent visual comparison or proof of behavior in every document or Word version. This reference does not establish application rendering support. Machine-readable measurements are in `measurement.json`; the four-source corpus and its manifest are untouched.
