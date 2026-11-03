# A3 synthetic column reference sources

These four DOCX files are **source probes** with frozen actual Word references (`REFERENCE_REPORT.md`, `references/report.json`). The production application now matches physical page/column regions for all 515 source markers; see `app-pdfs/word-comparison.json`, its provenance, and [the acceptance report](../../docs/columns-acceptance.md). This does not establish pixel-equivalent Word rendering. The source corpus is frozen. Before capture, it was generated with:

```sh
node scripts/compatibility/generate-column-probes.cjs
```

The script uses the repository's installed `docx`/`jszip` packages, normalizes source XML, validates its own assertions, and writes canonical ZIP entries plus `manifest.json` in this directory only. Core and ZIP dates are fixed. Byte-identical regeneration was verified before capture. It now refuses to regenerate when captured `.word.pdf` references exist, protecting both source hashes and actual manifest status. New source variants need a new corpus/version. It does not modify the A0 corpus. Source identifiers and markers are synthetic; none are persistent editor identities.

All sources explicitly specify Letter portrait, 12240×15840 twips; four 1440-twip margins; Arial 11 pt for all font script slots; zero paragraph before/after spacing; and exact 280-twip (14 pt) Normal line height. Mixed RTL fields use exact 320-twip line height. Header/footer distances are 720 twips; these probes contain no header/footer content. A declared font does not prove which font a renderer actually used.

## Four packed probes and their questions

| Source | Explicit source controls | Questions for actual Word export |
| --- | --- | --- |
| `column-widths-balance.docx` | Four next-page sections: no `w:cols`; explicit one column; two equal columns with gap 720 and separator; three equal columns with gap 360 and separator. The two-column section contains **one** long paragraph with 420 unique `WIDTH2_0000…WIDTH2_0419` markers. The short final three-column section contains 12 `BALANCE3_…` rows. | Compare absent vs explicit-one defaults; measure actual column edges/gaps/separator; locate the long paragraph's column and physical-page transitions; observe balancing of both the long section's final page and the short final section. Do not infer page count from the generator. |
| `continuous-column-changes.docx` | Five same-paper sections with counts **1→2→1→2→3**. Only the first section uses `nextPage`; the remaining four explicitly use `continuous`. Each region has unique BEGIN/END and numbered row markers. | Determine the closing/balancing band and next baseline for 1→2→1 and 2→3; find whether a transition stays on the same sheet; measure available remaining height. The additional 1→2 transition is deliberate and labeled, not a hidden separator. |
| `column-page-break-controls.docx` | A one-column section with a column break and a separate page break **inside paragraphs**. A two-column next-page section repeats these controls and ends with a column break as the final run after `TRAILING_COLUMN_TEXT`. Exactly three column and two page breaks; no generated page-count field. | Compare column vs page break in one/two columns; determine continuation column/page; observe the final trailing-column effect and any empty terminal page/column. A next-page section boundary exists between the two control groups and must be distinguished from the explicit run breaks. |
| `rtl-column-order.docx` | Three next-page sections. Two-column negative control: RTL paragraph only, section `bidi` absent. Positive controls: section `bidi=1` with two and three equal columns. RTL mixed Arabic/Latin paragraphs contain explicit column breaks and unique FIRST/SECOND/THIRD labels. | Separate paragraph direction from section column order. Record which physical column contains each logical label; check extraction/read order and the effect of explicit breaks on the short final region. Do not assume RTL column order from paragraph bidi alone. |

Widths derived from the **explicit source inputs**, before observing Word: text area 9360 twips; two equal columns with gap 720 give 4320 twips each; three columns with gap 360 give 2880 twips each; three columns with gap 720 give 2640 twips each. These arithmetic values are geometry inputs, not measured Word glyph bounds.

## Source assertions and determinism

Generation checks every section's page/margins/start/column attributes and optional section bidi; no equal-width source contains child `w:col` records. The default control genuinely omits `w:cols`. Every listed marker appears once; numbered families have exact count and no duplicates. Break counts and the final trailing column-break run are asserted. The generator moves the library's empty section-terminal paragraph properties onto the preceding real paragraph, so an accidental extra empty source line does not confound the continuous/balancing probes.

`manifest.json` records `source_sha256`, source facts and open questions. Its reference status began as `PENDING`; the archiver now records `CAPTURED`, hashes and actual page counts. Source XML assertions are not predictions of Word behavior. The generator performs structural checks, not a complete OOXML XSD certification.

The deterministic regeneration check used before reference capture was:

```sh
cp fixtures/columns/manifest.json /tmp/columns-manifest-before.json
node scripts/compatibility/generate-column-probes.cjs
cmp /tmp/columns-manifest-before.json fixtures/columns/manifest.json
```

## Reference capture handoff

The root agent opened each exact source in the selected **Word Online** session and used Word's own **File → Export → Download as PDF**. References are stored as `references/<probe-id>.word.pdf` with separate provenance containing source/PDF SHA-256, download mtime in UTC, application, browser/version when exposed, paper settings and font observations. Unknown values remain unknown. Keep native Word-edited downloads separately if an editing/preservation probe is added; do not replace the source DOCX silently.

`scripts/compatibility/analyze-column-probes.py` archives a successful download with `--archive PROBE_ID DOWNLOADED_PDF`, verifies hashes, and rebuilds `references/report.json` plus captured manifest entries. It requires Python with `pdfplumber` and `pypdf` (available in the bundled runtime). Running it without archive arguments reanalyzes the frozen references and never regenerates DOCX sources. A missing reference remains pending; hash mismatch is an error. Reference measurement is not an application pass.

Record at least marker physical page, column index/physical X, first/last baseline of each region, any empty terminal sheets, and visible separator location. For the long paragraph, record the last marker before and first marker after each column/page transition. For continuous regions, record both the previous region's lowest used baseline and the next region's first baseline. Token preservation alone does not establish caret correctness or visual fidelity.

LibreOffice rendering may be used to inspect source readability and catch corruption, but its pages are **QA only** and must not be placed under Word reference names. The corpus adds no A3 editor/model/UI behavior; it is input for the gated native caret/geometry prototype.

Native element meanings are grounded in Microsoft's [section properties reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.sectionproperties?view=openxml-3.0.1), [equal-column spacing reference](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.columns.space?view=openxml-3.0.1), and [Word-specific column defaults notes](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oi29500/ef7027d4-e05d-473b-8777-dcc2aee91935). The measured answers below are scoped to these exact sources and capture profile.
