# A7.3 note appearance and font preservation

Implemented under the approved [A7 plan](advanced-compatibility-plan.md) with Sol/Terra delegation. Production build and the local acceptance below passed at final code revision `d91e327`. This increment preserves note presentation and paragraph fonts; broader Word visual equivalence remains open. Release/live acceptance is recorded below when complete.

## Canonical notes and native transport

Document model v7 adds versioned note presentation. Native imports retain an absent body reference as absent, or retain a leading reference's resolved run marks and literal source whitespace. Standard and explicitly empty separator stories are distinguished. Older documents keep their authored superscript/space appearance; migration must retain note bodies, identities, numbering/placement policies and v6 bibliography sources/configuration. Note clipboard v2 carries presentation while cloning identities. Unknown versions/data and unsupported custom or displaced native content are refused before replacing the source.

Export uses native note references and independent note parts, preserving body-reference appearance. A space required by an authored default is materialized only in the export copy; repeated native reopening must retain exactly one space without modifying the original canonical body. This is visual/content retention, not byte-identical OOXML.

The existing genuine `word-online-normalized-v3.docx` fixture remains supported. Its validated eight-hex editing identifiers are neutral; its explicit separator paragraph spacing (`after=0`, `line=240`, `lineRule=auto`) is retained as a bounded `single-zero` profile and recreated on export. Other separator formatting is not normalized away. The actual public import/export/reopen regression passed with both original note identities, rich bodies, decimal policy and explicit separator spacing intact.

Native owner references also retain their actual run marks. The atom's historical inner superscript no longer reduces or raises source baseline references, or applies a second reduction to a real source superscript. Live, inactive/readonly and disposable column-measure views share derived decorations; standalone HTML neutralizes the same synthetic inner element from canonical v7 records. Authored/legacy defaults remain superscript. Native DOCX carries source owner run formatting through the transport marker and retains it on reopening.

## Physical note appearance

Native footnotes retain explicit final-paragraph after-spacing when reserving the bottom band. Previously the main-story final-block CSS reset suppressed that space, moving the note body roughly 10 pt too low. Source-aware prefix rendering removes numbers and horizontal insets that were absent from the frozen Word bodies. A standard native footnote separator uses Word's two-inch, half-point rule, bounded by the available width. Authored historical appearance remains separate; continuation geometry still requires its own Word evidence.

The endnote separator is derived layout, without adding canonical text or reallocating identities. Its occupied space participates in single-column flow and column measurement; column artwork uses the measured physical fragment. Normal style typography/alignment/ink is isolated from a colored, centered or indented first note body. List-first/nested content and section-end scopes are covered. Alignment is flushed synchronously after fonts/tabs before column measurement and before the print clone; output does not depend on a pending animation frame.

Historical authored endnotes retain their prior editor appearance. Their native DOCX output has historically emitted Word's standard separator; reopening that native output now displays the separator actually present in the file. The complete authored-to-native visual boundary is therefore not claimed equivalent. Empty and missing separator stories both suppress the rule; their potentially different blank-paragraph spacing still needs genuine Word evidence. Continuation rule geometry remains outside this increment's measured profile.

## Fonts and line spacing

See [font evidence](advanced-font-compatibility-acceptance.md) for genuine Word references, the bounded authored spacing profile and remaining limits. Explicit paragraph family/size survives HTML persistence, Enter, DOCX export and reopening, with run overrides preserved. Native automatic/minimum/exact spacing rules remain distinct. The new Calibri/Carlito, Times New Roman/Liberation Serif, Courier New/Liberation Mono and Roboto automatic profiles are restricted to uniform ASCII Latin runs; unknown, mixed-family and unsupported-script runs retain fallback behavior. Arial retains its existing documented profile. The guarded authored exact conversion remains Arial/Liberation Sans only.

The new [multi-font DOCX probe](../fixtures/compatibility/a7-3-fonts/metrics-probe.docx) has a frozen source hash and separate marker manifest. It opened in genuine Word Online, which displayed five pages. The user-assisted Download produced the [genuine Word PDF](../fixtures/compatibility/a7-3-fonts/metrics-probe.word.pdf); subsequent UI downloads also supplied the authored CSS Word PDF and both Word-downloaded DOCX copies. Hashes and actual embedded faces are recorded in the font provenance. No substitute renderer is recorded as a Word reference. All 15 native auto mean line pitches agree with the application within 0.077 pt in the focused capture; that is pitch evidence, not whole-page glyph equivalence.

## Integration acceptance

## Frozen-corpus production capture

The complete eight-file capture finished at `2026-11-03T20:19:02.654Z`, using Chromium `156.0.8078.4` against local production `http://localhost:3119` at `d91e3278af918b1306c6a8b712565c554eac425d`. [Export provenance](../fixtures/compatibility/a7-3-app-pdfs/exports.json), [full report](../fixtures/compatibility/a7-3-report.json), [expanded column report](../fixtures/compatibility/a7-3-column-geometry.json) and [rendered note comparison](../fixtures/compatibility/a7-3-note-visible-comparison.png) are separate A7.3 artifacts. The original manifest, sources, genuine references and A0/A7.1/A7.2 evidence remain unchanged.

| Case | Word/app pages | Links Word/app | Maximum absolute manifest anchor delta, CSS px | Report status |
|---|---:|---:|---:|---|
| basic | 1/1 | 0/0 | 0.184 | MEASURED |
| mixed-sections | 3/3 | 0/0 | 0.305 | MEASURED |
| tabs-leaders | 1/1 | 0/0 | 0.311 | MEASURED |
| columns | 1/1 | 0/0 | 0.992 | MEASURED |
| table-columns | 1/1 | 0/0 | 0.777 | MEASURED |
| notes | 1/1 | 2/2 | 0.184 | MISMATCH: destination geometry |
| crossrefs-toc | 1/1 | 1/3 | 2.923 | MISMATCH |
| mixed | 2/2 | 3/5 | 1.571 | MISMATCH |

All manifest markers remain unique, page counts and media boxes match, and all 78 repeated column markers retain the exact Word page/physical column. Expanded maximum absolute dy remains 1.436 CSS px in columns/table-columns and 1.797 in mixed; the broader 1 CSS px gate remains open. The overall count stays five MEASURED and three MISMATCH; these statuses cover listed checks only.

The notes text multiset now matches Word exactly. In mixed, the sole token substitution is current TOC page `2` versus Word's stale cached `1`; neither side is filtered out. Its former extra endnote-body number is gone. Link counts improve from 2/4 to 2/2 in notes and 3/7 to 3/5 in mixed. Notes still fails destination comparison: Word uses x=87 pt with zoom=0, versus app x=90 pt with retained zoom; the y differences are under 0.54 pt. Equal counts do not establish matching navigation geometry.

| Note text anchor | A7.2 dx/dy, CSS px | A7.3 dx/dy, CSS px |
|---|---:|---:|
| notes footnote | +10.136 / +13.388 | −0.067 / −0.007 |
| notes endnote | +6.464 / −16.732 | −0.067 / +0.060 |
| mixed footnote | +10.136 / +13.404 | −0.067 / −0.007 |
| mixed endnote | +6.464 / −6.012 | −0.067 / −1.220 |

These are search-text bounds, independently of visible glyphs. Both complete note-bearing pages and all four crops were rendered with PDFium and inspected. The comparison shows correct baseline owner labels, absent body numbers, restored footnote bottom spacing, two-inch rules and the new endnote separator. Visible endnote glyph residuals remain approximately +0.22 pt in notes and −0.74 pt in mixed; the separator rules remain approximately +1.2/+0.65 pt lower than Word. No fixed pixel adjustment was introduced. The separator's empty-story/continuation and non-Normal native default-style boundaries remain open.

## Local checks and release gate

Production TypeScript/compilation passed. Focused changed-module lint has no errors (the existing unused `state` warning in document-bibliography remains). Core checks passed: reference27, section69, note41, bibliography14, pagination18, report3 and expanded-geometry5. Startup/library refusal preserves exact unsupported sources; v6 notes/sources/policies/identities migrate to v7. Native note codecs, clipboard v2 and repeated authored-prefix roundtrips pass.

Actual production browser checks passed source baseline/sup14 owner presentation across all views/HTML/DOCX (artifact `0OuDv3`), ten separator/layout combinations including lists/sections (artifact `IXnpXQ`), real Word footnote native import/export/reopen and PDF with all 600 words once/four GoTo links (artifact `7LGGTA`), and the real Word-normalized separator/body/policy roundtrip (artifact `kCR5uv`). The final guarded build additionally passed the complete font-profile/Word-downloaded DOCX and inline-atom negative cases, authored HTML/Enter/DOCX roundtrip (artifact `v5BSmp`), and real Word footnote UI roundtrip (artifact `pB8fHt`). All eleven frozen-corpus pages render pixel-identically at 144 dpi to the inspected pre-guard capture. Bibliography source/citation/native reopen/six exports and reference-menu focus passed on the preceding production build with the same v7/owner implementation. Live release checks are recorded below. A7 overall remains open.
