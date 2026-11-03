# A7 advanced compatibility acceptance

Latest increment: A7.3 note appearance and measured font profiles passed local production acceptance on 2026-11-03; release/live status is recorded in [A7.3 evidence](advanced-note-font-compatibility-acceptance.md). The current eight-file report still has five MEASURED and three MISMATCH cases, while notes now has equal text/link counts and all its text anchors within 0.184 CSS px. [A7.2 evidence](advanced-column-compatibility-acceptance.md) remains the historical column-placement record. The sections below retain the historical A7.1 capture; its eight mismatches are not the current count.

Status: A7.1 released and live acceptance passed on 2026-11-03 at `fd6dfb1`. A7 overall remains open. The frozen A0 corpus is refreshed against the A1–A6 implementation; this document does not declare general Word visual equivalence. Original DOCX, Word PDF, provenance, A0 application PDFs and baseline report remain unchanged.

Compatibility has independent evidence axes: content/model retention; interactive/native editability; page/object geometry; visible rendering. PDF text tokens, PDF destinations and extracted text anchors answer different questions. None establishes editing support or whole-page visual fidelity.

## Support matrix after A1–A6

| Structure | Supported editing/model scope | DOCX/Word boundary | Geometry evidence and limits |
|---|---|---|---|
| Sections (A1) | Stable section IDs, next-page/continuous, paper/orientation/margins, section headers/footers and numbering | Native section identity/geometry roundtrip; section boundary commands restricted to body paragraph/heading ends; list/table placement rejects | Dedicated real Word mixed-paper checks; frozen corpus results below remain separate |
| Tabs (A2) | Real tab atoms, paragraph/style/ruler stops, decimal policy, leaders | Native stops and app metadata retained; custom decimal metadata is not Word regional configuration | Dedicated LTR/RTL and narrow-cell anchor checks; no universal font/line-wrap equality |
| Columns (A3) | Equal 1/2/3 columns, gap/rule/direction, column break, one editable document | Native equal-column roundtrip; unequal/arbitrary column layouts outside initial scope | Four Word samples matched page/column placement for 515 markers; no full-page visual claim |
| Bookmarks, captions, references, TOC (A4) | Stable targets; supported text/number/page references; live TOC, output update barrier | Supported native field subset; unrepresentable TOC/mixed-prefix structures reject without replacing source; foreign bookmarks and unsupported fields preserved where documented | Dedicated GoTo checks; frozen corpus destination comparison resolves actual page/fit/coordinates, not link counts alone |
| Endnotes/footnotes (A5) | Canonical note bodies/owners; numbering/restart/placement; conversion; rich text and supported list/tab/link bodies | Native notes and actual Word-normalized fixtures roundtrip; malformed graph, unsupported numbering/body/layout reject with source retained | Dedicated multipage/columns/continuation and 600-word Word fixture checks; complex object/table/continuous-paper limits remain |
| Bibliography/citations (A6) | Canonical books/articles/web sources; APA 7/IEEE via pinned CSL; clusters/locator/language; atomic history/clipboard | Formatted-copy DOCX with bookmarks/customXml roundtrips directly in app. A7 v3 accepts proven neutral serialization normalization while preserving effective formatting and inherited declarations; v1/v2 stay strict. Actual Word-resaved fixture changes direction and still rejects source restoration. Native Word Source Manager field profile remains closed | Visible formatted outputs verified; no native Word bibliography editing equivalence |
| Unknown/future models and unsupported graphs | Source-preserving rejection/read-only path as documented per feature; explicit replacement retains recovery source | Preservation is not functional editability. Unsupported foreign objects must not be silently promoted to supported objects | No visual claim from preserved XML |
| Macros, ActiveX, OLE, tracked changes, equation engine | Outside initial advanced-document scope | No execution or functional editing support claimed | Not covered by these eight fixtures |

Evidence owners: [section plan](advanced-document-plan.md), [tabs](tab-stops-support.md), [columns](columns-acceptance.md), [references](references-acceptance.md), [notes](notes-acceptance.md), [bibliography](bibliography-acceptance.md). These record prior accepted feature-specific tests; the A7 frozen-corpus refresh is not a substitute for them.

The frozen eight files contain basic text, sections, tabs/leaders, columns, table/columns, notes, crossrefs/TOC and a mixed case. They contain no A6 bibliography source registry or native Word Source Manager fields. A6 claims therefore rely on its dedicated acceptance corpus; the eight-file PDF refresh cannot establish bibliography editability or unknown-object safety. Source-preserving rejection is assessed through dedicated import/model tests, not PDF output.

## Reproducible frozen-corpus refresh

Use the existing eight manifest entries without regenerating sources. Start the application separately, then:

```sh
BASE_URL=http://localhost:3120 APP_PDF_DIR=fixtures/compatibility/a7-app-pdfs node scripts/compatibility/export-app.cjs
python3 scripts/compatibility/report.py --app fixtures/compatibility/a7-app-pdfs --output fixtures/compatibility/a7-report.json
python3 scripts/compatibility/test-report.py
```

Set `PLAYWRIGHT_MODULE`, `CHROMIUM_PATH` and use a Python with pypdf/pdfplumber as needed. Optional `CASES=basic,notes` exports a selected subset; selected runs merge unselected export records and checkpoint each case. Use a separate directory when retaining an earlier complete capture.

The report validates source/reference/application hashes. It separates page count/media boxes, token multiset, marker occurrence, destination geometry and text-layer anchors. GoTo checks resolve named/direct destinations and compare page, fit and coordinates within 0.75 pt; external URIs compare exactly. Annotation order is retained. Unknown actions remain unknown; equal link counts do not establish destination equivalence. Coordinate agreement does not establish semantic target identity or source click-rectangle equivalence. Text anchors remain `EXTRACTED_TEXT_ONLY`; visual status remains `NOT_ASSESSED` unless a separate rendered assessment supplies evidence.

## A7.1 frozen-corpus results (historical)

Fresh local capture: all eight application PDFs exported from `http://localhost:3120` into `fixtures/compatibility/a7-app-pdfs`; each source/PDF hash passed provenance validation. Current machine-readable evidence: [a7-report.json](../fixtures/compatibility/a7-report.json) and [exports.json](../fixtures/compatibility/a7-app-pdfs/exports.json). Historical `baseline-report.json` remains an A0 snapshot.

| Frozen case | Pages Word/app | Text multiset | Links Word/app; destination geometry | Max absolute text-anchor delta, CSS px | Overall measured status |
|---|---:|---|---|---:|---|
| basic | 1/1 | equal | 0/0; no links to assess | 8.784 | MISMATCH |
| mixed-sections | 3/3 | equal | 0/0; no links to assess | 6.305 | MISMATCH |
| tabs-leaders | 1/1 | equal | 0/0; no links to assess | 6.305 | MISMATCH |
| columns | 1/1 | equal | 0/0; no links to assess | 150.601 | MISMATCH |
| table-columns | 1/1 | equal | 0/0; no links to assess | 147.539 | MISMATCH |
| notes | 1/1 | extra `1`, `i`; none missing | 2/4; unequal | 25.451 | MISMATCH |
| crossrefs-toc | 1/1 | equal | 1/3; unequal | 27.164 | MISMATCH |
| mixed | 2/2 | extra `2`, `i`; none missing | 3/7; unequal | 748.528 | MISMATCH |

All eight preserve each expected marker exactly once and match page count and media boxes within 0.75 pt. Six match the full extracted token multiset. Notes/mixed contain additional extracted numbering tokens; these are reported as differences, not silently removed. Every case fails the provisional 1 CSS px text-anchor threshold. These are text-layer measurements, not raster glyph/object measurements; the large column/mixed offsets require separate geometry diagnosis. All three link-bearing cases differ in link count/destinations; additional reverse navigation can change counts, so this does not by itself prove a lost target. Raw resolved GoTo destinations remain in the report for diagnosis. Zero-link cases supply no link compatibility evidence.

The refreshed overall count is again eight `MISMATCH`, now with current evidence and separate reasons. Visible rendering, model retention and editability remain `NOT_ASSESSED` in this PDF report. Feature-specific prior acceptance and safe rejection boundaries in the matrix above remain the evidence for interactive/native behavior. There is no general Word appearance acceptance or A7 deployment acceptance from this capture.


## First A7 increment: measured corrections and safety boundaries

Paragraph import now restores supported direct/inherited single bottom borders, including width, spacing, explicit nil removal and supported theme color resolution. This fixes the visibly absent Title border in the frozen `basic` case. It also changes line-box placement; no fixture-specific offset was added.

At 144 dpi, the two black body-line raster bands are Word `248–267` / `297–316`, original A0 app `230–250` / `275–295`, final app `239–259` / `284–304` pixels. The corresponding PDF text-layer vertical deltas improve from about `−12.6 / −15.1` to `−6.3 / −8.8` CSS px. The border is now visible; residual text/glyph offsets remain. This is a measured improvement, not visual acceptance. Separate rendered evidence: [Word / original app / final app crop](../fixtures/compatibility/a7-basic-visible-comparison.png).

The formatted bibliography carrier profile advances to v3. Correspondence can accept neutral run splitting/merging, XML/attribute ordering and relationship-ID renaming when effective rich formatting and target identity remain equivalent. The signature includes relevant inherited style/default declarations and retains unknown properties, direction, language, font and content. Missing/ambiguous/cyclic styles, changed rich formatting/content/targets and unsupported native CITATION/BIBLIOGRAPHY fields still reject. Older carrier versions keep their strict signatures. Citation exports state run direction explicitly; this does not authorize ignoring later direction changes.

The real saved Word bibliography fixture keeps source IDs/configuration and visible citation text but splits one run into seven and introduces three newly explicit `rtl=true` punctuation runs. It is therefore not demonstrated semantically equivalent and remains rejected. The audit is repeatable with `scripts/check-bibliography-word-normalization.py`; equal text alone is insufficient to restore editable sources.

The source-free legacy DOCX path lacking `_rels/.rels` returns the original buffer unchanged to ordinary import only when `word/document.xml` exists and there are no owned bibliography bookmarks/tags, bibliography metadata namespace or native citation/bibliography instructions. Bibliography-owned/native files do not bypass graph validation through this fallback.

On rejected source restoration, the root file-open UI now reports “Source data cannot be restored from this Word file. The open document was kept.” in English and the supported Turkish, French, Chinese and Arabic UI locales. The existing document remains available; localization does not imply additional import support.

The final frozen-corpus capture was regenerated after the theme-color correction, using Chromium for Testing against local `3120`; the report above validates the final hashes. Targeted border, bibliography normalization/negative graph and actual DOCX/UI checks are the first-increment verification gates. The root agent owns final production build/smoke acceptance and release recording. The eight frozen cases still fail the provisional anchor tolerance, so the first correction does not close A7.


## Production acceptance

The final production build passed TypeScript and compilation. Actual production UI checks passed inherited/direct/theme border width/color/spacing/nil rules and bibliography DOCX v3 export/reopen, HTML/PDF/TXT/Markdown/RTF plus safe Word-edited refusal. The shared DOCX import regression and five neutral semantic normalization positives/fifteen corruption or meaningful-change negatives passed. Three destination-report tests and the actual Word directional audit passed. Existing local Better Auth/Edge warnings are unchanged.

Code commit [`fd6dfb1`](https://github.com/0xymg/online-wordpad/commit/fd6dfb1f8928486b21325bf073ce6dbb9c89d47a) was published without coauthor trailers. [Vercel deployment](https://vercel.com/312sh/online-wordpad/CEn5rb1Mpw2kPVYDfpmDywjZvMAK) succeeded. Both targeted scripts passed against `https://wordpad.info`: `check-paragraph-border.cjs` and `check-bibliography-ui.cjs`. The live bibliography check covered source/cluster creation, DOCX graph and stable-ID reopening, six export formats, and preserving the open document when edited or actual Word-resaved bibliography files cannot safely restore source data. This closes A7.1, not the remaining corpus geometry gates.
