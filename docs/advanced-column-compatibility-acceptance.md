# A7.2 column and mixed geometry evidence

This increment diagnoses the frozen A0 sources and Word Online reference PDFs against A7.1, then measures the A7.2 corrections. It keeps independent checks for page/column placement, local text geometry, paragraph pitch, table geometry, rendered appearance, content and editing. It does not close A7 or establish general Word fidelity.

The authoritative inputs remain `fixtures/compatibility/manifest.json`, the original DOCX files, reference PDFs and provenance. A0 `app-pdfs`/`baseline-report.json` and A7.1 `a7-app-pdfs`/`a7-report.json` are historical captures and must remain unchanged. New output goes in a separate directory such as `a7-2-app-pdfs`.

## Exact starting evidence

The measurements below use PDF text coordinates converted with 1 pt = 4/3 CSS px. Physical columns are indexed from the left. A negative local vertical delta means the app anchor appears earlier on the same page and column. Anchors on different pages or columns are classified as placement mismatches before any local delta is calculated.

| Frozen case | Word/app pages | First marker in right column, Word/app | Markers in wrong page/column | Mean repeated paragraph pitch, Word/app CSS px |
|---|---:|---|---|---:|
| columns | 1/1 | `COLUMN_14` / `COLUMN_16` | `COLUMN_14`, `COLUMN_15` | 52.134 / 47.059 |
| table-columns | 1/1 | `COLUMN_14` / `COLUMN_16` | `COLUMN_14`, `COLUMN_15` | 52.134 / 47.059 |
| mixed | 2/2 | `COLUMN_12` / `COLUMN_13` | `COLUMN_12`, `NOTE_ANCHOR`, `FOOTNOTE_BODY` | 52.148 / 47.059 |

Pitch averages include adjacent `COLUMN_nn` markers that share a page/column within each PDF. All 26 markers are measured in each case. The original manifest anchors only the first/last column markers and cannot reveal the intermediate wrong-column placements. The approximately 5.08 CSS px shortfall per paragraph accumulates even though the left and right column starts differ by only -0.067 and -0.173 CSS px. This is evidence of paragraph/flow drift, not a horizontal column-width failure.

| Same-region anchor | columns local dy CSS px | table-columns local dy CSS px | mixed local dy CSS px |
|---|---:|---:|---:|
| `COLUMN_00` | -10.972 | -10.972 | -24.144 |
| `COLUMN_25` | -150.601 | -150.601 | -113.803 |
| `TABLE_A`, `TABLE_B` | n/a | -147.539 | -110.740 |
| `TABLE_C`, `TABLE_D` | n/a | -134.017 | -96.885 |

Table A/C and B/D have app x offsets of +8.015 and +7.628 CSS px. Separating the table from the last paragraph shows an additional 8.188 CSS px left text inset relative to `COLUMN_25`; this cannot be explained by the paragraph pitch error. The first-row A-to-B text distance is 115.387 CSS px in Word and 115.000 in the app, only -0.387 apart. First-column row pitch is 17.667 CSS px in Word's `table-columns` and 17.333 in Word's `mixed`, versus 31.188 in both app PDFs. The app table therefore introduces its own excess row height in addition to inheriting the preceding flow error.

In `mixed`, `NOTE_ANCHOR` is at Word page 2/left column, x=90.050 pt, y=73.590 pt. The app places it on page 1/right column, x=324.000 pt, y=634.986 pt. `FOOTNOTE_BODY` also moves from Word page 2 to app page 1. The original report's 748.528 CSS px maximum subtracts page-local coordinates across different pages; it must not be presented as a same-page vertical spacing error. `CROSSREF_START`, `CROSSREF_END` and `ENDNOTE_BODY` remain on page 2 in both, with local dy -21.876, -24.351 and -31.856 CSS px respectively. Matching two-page totals do not establish matching pagination.

Content remains a separate result: columns and table-columns have equal extracted token multisets. Mixed has extra extracted `2` and `i` tokens and unequal links/destinations in A7.1. Geometry work does not silently remove those differences or declare note/reference compatibility.

## Rendered starting assessment

All relevant reference and A7.1 pages were rendered locally through PDFium and visually inspected. The denser repeated paragraphs, later column transitions and premature page-1 note are visible. Word tables have compact black rows; A7.1 tables have taller light-gray rows. A7.1 paragraph bottom borders in columns span the page and cross the gutter, while the corresponding Word borders end at the containing column. These are rendered observations, separate from text extraction; no whole-page similarity score or visible acceptance is claimed.

## Reproduction and gates

Use the bundled Python runtime or another Python with pypdf and pdfplumber:

```sh
python3 scripts/compatibility/test-advanced-column-geometry.py
python3 scripts/compatibility/compare-advanced-column-geometry.py --app fixtures/compatibility/a7-app-pdfs --output /tmp/a7-1-column-geometry.json
python3 scripts/compatibility/compare-advanced-column-geometry.py --app fixtures/compatibility/a7-2-app-pdfs --output /tmp/a7-2-column-geometry.json --require-regions
python3 scripts/compatibility/report.py --app fixtures/compatibility/a7-2-app-pdfs --output fixtures/compatibility/a7-2-report.json
```

The focused comparator validates frozen source/reference/application hashes through the existing report implementation. Missing, duplicate or failed evidence cannot produce a measured result. It expands the marker set, records physical page/column placement and computes local deltas only for matching regions. Its regression checks cover wrong-page and wrong-column classification, duplicate anchors, table-cell insets and paragraph pitch across column transitions.

Acceptance requires evidence for each changed behavior:

- Preserve source/reference hashes, marker uniqueness, text content and page sizes. Run the complete eight-case report to expose changes outside the three focused cases.
- Match physical page/column placement for all 26 repeated paragraph markers per case and all manifest anchors. `--require-regions` is the placement gate. Equal page counts alone do not pass it.
- Report paragraph pitch, first/last same-region vertical deltas, table-relative inset/row pitch and remaining line-box error separately. Passing the placement gate does not pass the provisional 1 CSS px geometry gate.
- Verify rendered column rules, paragraph borders, table boundaries/row heights and note placement from the final capture, using consistent raster scale and full pages plus relevant crops. Retain residuals instead of substituting a text-anchor result for visible acceptance.
- Run regressions for supported direct/inherited spacing, table styles/margins/heights, hard breaks, keep constraints, notes and one editable document flow. Confirm the final production build and actual import/export interaction before release.

## Final A7.2 local production acceptance

Local production acceptance passed. Live release acceptance remains pending. The final eight-case capture finished at `2026-11-03T19:11:55.204Z`, using Chromium `156.0.8078.4` against the local production server `http://localhost:3119`. The export manifest records revision `dfe361b9e6023be5280890fc5f0c4b5beababf68`. The capture includes the native adjacent-paragraph spacing and short-page separator corrections, plus the menu focus and stale-measurement retry corrections. All recorded geometry, paragraph pitches, marker regions, separator endpoints and eight-case statuses are unchanged from the preceding `8552ab9` capture. This is local production-build evidence; live deployment acceptance is still pending.

Artifacts: [application export provenance](../fixtures/compatibility/a7-2-app-pdfs/exports.json), [complete eight-case report](../fixtures/compatibility/a7-2-report.json), [expanded column report](../fixtures/compatibility/a7-2-column-geometry.json). The reports validate the frozen source/reference hashes and final application PDF hashes. No source, reference PDF/provenance, A0 application artifact or A7.1 artifact was replaced.

| Frozen case | Word/app pages | Text multiset | Links Word/app; destinations | Maximum absolute manifest-anchor delta, CSS px | Listed report checks |
|---|---:|---|---|---:|---|
| basic | 1/1 | equal | 0/0; not applicable | 0.117 | MEASURED |
| mixed-sections | 3/3 | equal | 0/0; not applicable | 0.372 | MEASURED |
| tabs-leaders | 1/1 | equal | 0/0; not applicable | 0.311 | MEASURED |
| columns | 1/1 | equal | 0/0; not applicable | 0.925 | MEASURED |
| table-columns | 1/1 | equal | 0/0; not applicable | 0.711 | MEASURED |
| notes | 1/1 | extra `1`, `i`; none missing | 2/4; mismatch | 16.732 | MISMATCH |
| crossrefs-toc | 1/1 | equal | 1/3; mismatch | 2.923 | MISMATCH |
| mixed | 2/2 | extra `2`, `i`; none missing | 3/7; mismatch | 13.404 | MISMATCH |

All eight retain each manifest marker exactly once, match page counts and match media boxes within 0.75 pt. The complete report improves from eight A7.1 `MISMATCH` cases to five `MEASURED` and three `MISMATCH`. `MEASURED` covers only its listed checks. It does not establish visible rendering or editing equivalence. Notes/mixed preserve the previously reported extra numbering/page-result tokens; no text differences were silently filtered out. Link count and resolved destination differences remain open.

All 26 `COLUMN_nn` markers per focused case now occupy the exact Word page and physical column. The right column begins at `COLUMN_14` in columns/table-columns and `COLUMN_12` in mixed. Mixed `NOTE_ANCHOR` and `FOOTNOTE_BODY` now occupy Word's page 2/left column. The expanded placement gate passes all three cases, closing the demonstrated wrong-column/wrong-page placement failures in this frozen corpus.

| Focused geometry | Word CSS px | A7.1 CSS px | A7.2 CSS px |
|---|---:|---:|---:|
| Mean paragraph pitch, columns/table-columns | 52.142 | 47.059 | 52.118 |
| Mean paragraph pitch, mixed | 52.143 | 47.059 | 52.119 |
| Table row pitch, table-columns | 17.667 | 31.188 | 17.860 |
| Table row pitch, mixed | 17.333 | 31.188 | 17.860 |
| Table text inset relative to `COLUMN_25` | 0.000 | 8.188 | 0.656 |

The paragraph means use eligible adjacent pairs; the exact reference mean differs slightly from the starting table because corrected placement makes additional pairs eligible. Neither reference coordinates nor source styles changed. The table's A-to-B text distance remains -0.387 CSS px from Word. Its relative top gap after `COLUMN_25` now differs by +0.124 CSS px in table-columns and +0.109 in mixed, versus +3.063 before.

Expanded markers reveal residuals outside the first/last manifest pair: maximum absolute dy is 1.369 CSS px in columns and table-columns, and 1.732 among mixed's repeated paragraphs. Thus all three focused cases still fail the expanded provisional 1 CSS px anchor gate, even though columns/table-columns pass the narrower manifest-anchor checks. Mixed table anchors are within 0.849 CSS px vertically, and `NOTE_ANCHOR` is -0.612. These are small residual line/glyph placement errors; the previous cumulative 100–150 CSS px column drift is absent.

## Remaining mixed reference and note geometry

The native empty TOC marker no longer consumes a line, and generated entries retain the imported 11 pt paragraph format. Native adjacent paragraph after/before spacing uses the larger value instead of summing both: the source TOC's 10 pt after and Heading1's 24 pt before form a 24 pt gap. In final mixed page 2, the TOC text is y=191.748 pt versus Word's 192.640 pt (-1.189 CSS px); the preceding title's two lines differ by approximately -1.5/-1.6 CSS px. The next heading is y=231.089 pt versus 231.770 pt (-0.908 CSS px). Its TOC-to-heading top interval is 39.341 pt versus Word's 39.130 pt, only +0.211 pt (+0.281 CSS px). `CROSSREF_START`/`CROSSREF_END` differ by -1.095/-1.039 CSS px. The previous large spacing offset is absent; remaining reference text/glyph geometry and updated field appearance stay separate from column placement.

`ENDNOTE_BODY` differs by -6.012 CSS px vertically and +6.464 horizontally. `FOOTNOTE_BODY` differs by +13.404 vertically and +10.136 horizontally. The app adds displayed note numbers/backlinks absent from the frozen Word body text; its footnote prefix accounts for the horizontal body inset. The endnote number, note separators, link appearance and refreshed TOC result remain visibly different. The data does not establish an exact cause for each residual vertical note offset.

## Final rendered assessment and supported metric scope

All four relevant final pages (columns page 1, table-columns page 1, mixed pages 1–2) were rendered with PDFium and inspected. [Word / A7.1 / A7.2 table-columns comparison](../fixtures/compatibility/a7-2-column-visible-comparison.png) shows the corrected paragraph pitch, column transition, compact black table grid and paragraph border confined to its column. [Word / A7.1 / A7.2 mixed comparison](../fixtures/compatibility/a7-2-mixed-visible-comparison.png) includes both pages and shows the corrected page-2 note placement while retaining the reference/note appearance differences.

The short-final-page separator now uses the occupied column band's height. At 144 dpi, dark gutter rows cover Word 144–1398 and A7.2 144–1397 in columns/table-columns. Mixed's gutter rows cover Word 144–1440 and A7.2 144–1439. Each endpoint differs by only one raster pixel, approximately 0.667 CSS px, and the prior 41-raster-pixel excess is absent. This is independent object-geometry evidence. No full-page raster similarity or universal appearance acceptance is claimed.

Automatic line spacing now uses the measured Arial/Liberation Sans single-line metric `(1854 + 434 + 67) / 2048` for supported uniform-family paragraphs. The original Word automatic multiple remains in the model and DOCX; for example, native 1.15 becomes approximately 1.32239 em only in CSS rendering. Unknown families and paragraphs containing different font families retain their fallback. Authored HTML/CSS em-based multiples retain their own semantics. The frozen Arial corpus does not establish Word-compatible metrics for Calibri, arbitrary fonts or mixed-family paragraphs.

The five focused evidence-regression tests and three existing destination-report regression tests pass. The release owner also verified the production native TOC import/export/reopen with idle-stability assertions; the broader production reference UI suite with bundled PDF Python (result `E0kY7f`); native paragraph spacing (`ItzTAD`); bibliography UI (`an5IJq`); and all six native nil-table variants. A direct focus trace established the earlier development UI typing failure: delayed close autofocus from the Update references menu action focused the Insert trigger and stole typed characters. The menu correction passed four broader development UI runs (including final `ADlSjR`), six focused rapid-input/newer File focus/Escape/dialog scenarios, and the focused production run (`55048`). The final production reference UI rerun passed (`5jaGCR`). After the coordinator correction, the full native TOC DOCX import/edit/reload/export/reopen workflow passed twice in production (`dgXe03`, `A6LvYV`), including stable identity, live page 2 and idle stability. Automatic/manual refresh concurrency and user-edit snapshot rejection also passed.

The immutable-file audit compared the manifest, all eight source DOCX files, all reference PDFs/provenance, A0 app PDFs/baseline and A7.1 app PDFs/report against `HEAD`; no differences were found. Reports were regenerated from the final revision. All eleven pages in the eight final PDFs rendered pixel-identically at 144 dpi to the reviewed capture; both comparison PNGs therefore retain the reviewed final pixels. All four focused pages were inspected after the geometry corrections. Live smoke verification remains owned by the release workflow and is pending. A7 remains open for the documented expanded-anchor, note, reference and other unsupported geometry boundaries.

Authored HTML's unitless Arial line height uses the CSS em basis. Export to DOCX stores the multiple as Word automatic spacing; reopening uses Word's Arial font-metric basis, so the rendered line height changes. This conversion boundary is a known limitation, not a measured preservation of authored CSS spacing.

## Reference refresh race correction

A DOCX reopen could update its TOC while an earlier column measurement awaited fonts/tabs. The document then stayed stable, but the older measurement error marked the new document failed and kept its page field pending. The coordinator now checks both captured document identity and generation, retries stale attempts within a bound, and distinguishes exhausted cancellation from a malformed current document. Cancellation schedules a later frame and reference refresh; current-document diagnostics, oscillation and nonconvergence remain hard failures. Explicit output revision guards still reject real user edits during export. Coordinator regressions cover delayed invalidation, stale exhaustion/latest-document recovery, composition and unchanged hard errors.

The final TypeScript/production build passed. Focused changed-module lint passed; existing MenuBar `any`/navigation lint findings remain outside these changes. The proven automatic-spacing profile covers the frozen Latin Arial corpus; arbitrary glyph fallback and mixed-script line metrics are not established.
