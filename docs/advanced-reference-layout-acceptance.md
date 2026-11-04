# A7.4 references and residual document geometry

Implemented with the approved Sol/Terra workflow. The requested reference/TOC presentation and measured column/note corrections pass local production acceptance at `e2a2c57e9bffdfea53a2af8e5b003bb2af432d81`. Live release acceptance is recorded below when completed. This increment does not assert arbitrary Word layout or font equivalence.

## Reference presentation and navigation

Native TOC regeneration retains implicit or explicit source tabs, direct/inherited indentation and independent label/page-result marks. The source indent snapshot survives HTML persistence. Native plain links stay plain; explicit source blue/underline stays styled, and authored TOCs keep their existing link appearance. DOCX retains actual hyperlinks without imposing the Hyperlink character style on a native source row; standalone HTML carries the same presentation rule. Uniform native reference-result formatting follows a unique, formatted temporary run through import. Mixed or non-text results are refused instead of flattened.

The standard zero-size ProseMirror caret helper no longer adds a screen-only line after trailing fields/bookmarks. Explicit user navigation synchronizes browser selection with the selected target; background field updates still preserve menu/dialog focus.

PDF targets are measured in the final printed sheets after editor-only chrome is removed, rather than copied from live caret boxes. The resolver handles headings, inline/empty/end bookmarks, note owners, physical footnotes and projected endnotes, rejects off-page duplicate clones and admits only canonical unique target identities. Valid reference/note targets missing from the artwork fail export instead of silently losing their links. PDF navigation preserves zoom with the standard zero value.

## Native spacing and column geometry

Native Word kerning uses its inherited half-point activation threshold, including explicit zero and absence-as-disabled. The new mark/style value survives font edits, undo, splitting, notes/clipboard, running content, HTML and native DOCX. Browser-authored content keeps its previous default. This follows [the OpenXML kerning contract](https://learn.microsoft.com/en-us/dotnet/api/documentformat.openxml.wordprocessing.kern?view=openxml-3.0.1) and [Word's zero/range convention](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-doc/7022285b-9621-42e9-ad4d-4e02c115ef18).

Column relocation retains the naturally measured distance between each font box and its CSS line box, including negative leading. Occupied heights are unchanged. Separator artwork follows the same physical displacement as its source line. Tab probes copy font longhands when Chromium's computed shorthand is empty; kerning decorations leave geometry-owning tab/image node views intact. An aligned tab gap can retreat to keep a complete fitting field inside the text edge, without compressing glyphs or suppressing real long-field wrapping.

The bounded regular Arial 11–20 pt separator profile uses measured font metrics and disposable separator/first-body-line geometry. Footnote reservations include the measured clearance; bottom-anchored body text stays in place. Source/raster proof, negative controls and the remaining 12 pt centroid difference are explicit in [separator acceptance](advanced-note-separator-acceptance.md).

## Frozen corpus acceptance

The final release capture completed at `2026-11-04T00:12:46.109Z` (3 November in Toronto), Chromium `156.0.8078.4`, local production `http://localhost:3119`, runtime `e2a2c57`: [export provenance](../fixtures/compatibility/a7-4-release-app-pdfs/exports.json), [raw report](../fixtures/compatibility/a7-4-release-report.json), [expanded geometry](../fixtures/compatibility/a7-4-release-column-geometry.json), [semantic navigation](../fixtures/compatibility/a7-4-release-navigation.json), [visible note comparison](../fixtures/compatibility/a7-4-release-note-visible-comparison.png).

| Case | Word/app pages | Largest manifest anchor delta, CSS px | Raw comparison |
|---|---:|---:|---|
| basic | 1/1 | 0.184 | MEASURED |
| mixed-sections | 3/3 | 0.305 | MEASURED |
| tabs-leaders | 1/1 | 0.184 | MEASURED |
| columns | 1/1 | 0.173 | MEASURED |
| table-columns | 1/1 | 0.777 | MEASURED |
| notes | 1/1 | 0.184 | MISMATCH: viewport coordinates |
| crossrefs-toc | 1/1 | 0.107 | MISMATCH: source cached-link count/viewport |
| mixed | 2/2 | 0.916 | MISMATCH: stale page cache/link count/viewport |

All eight cases pass the provisional 1 CSS px manifest text-anchor gate. All 78 repeated column markers retain their exact Word physical page/column. Expanded maxima (x/y) are columns `0.173/0.436`, table-columns `0.483/0.777`, mixed `0.483/0.916` CSS px; all three expanded gates pass. Every expected marker occurs exactly once, and all page counts/media boxes match. Complete note-bearing pages and crops were rendered and inspected independently of the search layer.

The unchanged raw report remains five MEASURED / three MISMATCH. Word's old mixed TOC cache says page one; the actual current target and application result are page two. The TOC instruction requests hyperlinks, so current generated title/page links legitimately exceed the old cached PDF's link count. Word uses its own viewport margin/vertical context; the app targets the actual printed line. These differences are retained, not filtered or reclassified. The separate semantic gate verifies all ten links reveal the correct target on its physical page and retain the current TOC result. This is navigation correctness, not identical viewport policy.

## Regression and public-flow checks

Production build and TypeScript pass. Focused lint passes; pre-existing broad Editor lint and local Better Auth/Edge warnings are unchanged. Core checks passed: sections69, note-model41, canonical notes16, references27, bibliography14. Measured column leading, image/table/border flow and ten separator/layout variants pass.

Native kerning/presentation55 verifies threshold inheritance, resize/exact undo, notes/clipboard, marked tabs, running fragments, unlinked paragraph bases, DOCX result-format reopening, native plain/explicit styled TOC links and authored defaults. Native TOC public import → rename → reload → idle → DOCX export/reopen passes with current page two and source identities/tabs, including the mixed near-edge single-line regression. Standalone HTML retains native TOC ink. Full LTR/RTL/right/center/decimal/leader tab workflows, zoom, persistence and five exports pass. The historical six-cycle reference update/menu/dialog focus regression also passes.

[Production proof](../fixtures/compatibility/a7-4-production-proof.json) and [saved screenshot](../fixtures/compatibility/a7-4-production-references.png) cover actual mixed DOCX import, clicking the TOC into the real heading/browser selection, current page two, real PDF download, stable note/field IDs and zero note/reference/column errors.

The final runtime also passes real Word footnote import → native DOCX → reopen → PDF, with all 600 words and the second body once, four GoTo links and continuation pages (`Nx7M6F`); native import/PDF/Escape/reload emits zero note errors and all sixteen font-edit/undo/protected-cache checks pass (`GD5rlD`). The [full column-page comparison](../fixtures/compatibility/a7-4-release-columns-visible-comparison.png) was rendered and inspected alongside the complete note pages.

The first `f45f544` eight-file capture exposed tab width/probe regressions and is retained under `a7-4-app-pdfs` with its failing report. `517016d` repaired geometry; its separate `a7-4-final-app-pdfs` capture remains intact. The release capture adds native link presentation and user-navigation corrections. No original fixture, Word reference or prior A0/A7.1/A7.2/A7.3 artifact was overwritten.

## Release

Local acceptance is complete. Deployment and live acceptance are pending at this record revision. The broader arbitrary-font/script/object, continuation-separator and exact Word viewport policies remain outside this increment's proven profile.
