# A7.4 native note separator evidence

Latest: [A7.5 closes the measured 12 pt failure](advanced-note-separator-finish-acceptance.md) using the same threshold and two additional genuine Word controls. The values and limitations below preserve A7.4's original historical results.

The A7.4 native separator profile is bounded to a regular Arial Normal style at 11–20 pt. It uses Arial's measured strikeout metrics for the rule thickness and the browser's font-derived midline for its placement. The rule is a derived decoration; canonical note bodies, identities and read-only guards are unchanged. Other font families, bold or italic Normal styles, sizes outside this range, empty separators and continuation separators retain their existing behavior.

For native footnotes in the supported profile, a disposable separator and the actual first rendered line determine the rule's position. The planner reserves enough clearance for the measured rule, keeping bottom-anchored body text in place while avoiding overlap with main-story content. The column overlay carries the measured rule's physical position and thickness. Dark-mode ink follows the same semantic color as the separator widget.

The [probe manifest](../fixtures/compatibility/a7-4-note-probes/manifest.json) and [additional size controls](../fixtures/compatibility/a7-4-note-metric-probes/manifest.json) record source hashes and genuine Word Online PDF downloads, with per-file provenance. Word's embedded ArialMT font has 2,048 units per em, OS/2 strikeout size 102, strikeout position 530 and x-height 1,062. Word's rule rectangles measure 0.50, 0.50, 0.75 and 1.00 pt thick at 11, 12, 16 and 20 pt respectively, consistent with rounding the font-derived thickness to the nearest quarter point. The application paints the derived rule in its rasterized page, so raster coverage is not the same as the Word vector rectangle.

The 11 and 16 pt source variants were used to investigate the model; 12 and 20 pt are additional size controls, and the 11 pt two-column case checks physical placement. With PDFium at four pixels per point, the intensity-weighted rule centroid differences (application minus Word) were:

| Normal font size / flow | Endnote | Footnote |
|---|---:|---:|
| 11 pt, single column | −0.383 pt | −0.625 pt |
| 11 pt, two columns | −0.625 pt | −0.625 pt |
| 12 pt, single column | −0.883 pt | −0.875 pt |
| 16 pt, single column | −0.250 pt | −0.250 pt |
| 20 pt, single column | −0.252 pt | −0.125 pt |

The [measurement data](../fixtures/compatibility/a7-4-note-profile-measurements.json) includes source PDF hashes, Word vector bounds and raster coverage. These are focused development captures, not the final production corpus capture; their export provenance retains an unknown revision. In particular, the 12 pt result remains outside a 0.75 pt comparison threshold. The 11 pt Word source with inherited separator spacing and the explicit single-zero variant have identical measured rule and body positions; the same holds at 16 pt. The two-column explicit-zero Word reference remains uncollected.

Word ignored a text marker placed alongside the separator in the same run and in a separate run, so the separator's own Word text baseline was not directly observed. Those negative controls and their source hashes are retained separately in [metric probes](../fixtures/compatibility/a7-4-note-metric-probes/manifest.json) and [run probes](../fixtures/compatibility/a7-4-note-run-probes/manifest.json). The profile is an approximation based on the font data and observed geometry, not proof of universal Word separator placement or continuation behavior. Original corpus fixtures, references and earlier captures were not replaced.

TypeScript and scoped lint passed. The ten-case endnote separator browser check passed for single-column and column layouts, empty and authored separators, section scopes and nested lists. The actual Word footnote import, native DOCX export/reopen and PDF test passed with 600 words and the second note body exactly once, four GoTo links and real continuation pages (artifact `peoa7w`).
