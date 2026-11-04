# A7.5 — closing the measured 12 pt separator residual

The user requested this remaining correction with Sol/Terra. Runtime `ca4dfc40ef7e71244dc23f02cdf708476e3e6352` passes local production acceptance. The existing regular Arial 11–20 pt native separator profile receives one shared half-point downward paint calibration. There is no 12 pt, fixture-name or page-position branch. This is an empirical native-character paint calibration against genuine Word outputs, not a claimed derivation of Word's unobserved separator baseline.

The shared factory supplies endnotes, measured footnote clearance/painting and physical column overlays. Saved content, note identities and policies are unchanged. Unsupported fonts/sizes/styles, authored appearance, empty separators and continuation rules retain their previous behavior.

## Independent evidence

The five existing Word controls cover 11/12/16/20 pt and two-column 11 pt. Two new sources were generated after the calibration was selected: a two-column 12 pt case and a 12 pt case with independently changed preceding main-story content. Both exact sources were uploaded to Word Online and exported using its native PDF download. Their [manifest](../fixtures/compatibility/a7-5-note-probes/manifest.json) and per-file provenance retain source/PDF hashes and actual Microsoft Word metadata. The earlier Word references and all A7.4 artifacts remain untouched.

The [fresh before capture](../fixtures/compatibility/a7-5-note-probes/baseline-measurements.json) comes from the previous live `33165d5` implementation, rather than relying on A7.4's experimental captures. The [production comparison](../fixtures/compatibility/a7-5-note-probes/production-measurements.json) validates source, Word PDF and application export hashes/revisions. It keeps the original intensity-weighted PDFium 4 px/pt method and unchanged **0.75 pt** centroid threshold.

| Source | Endnote delta after, pt | Footnote delta after, pt |
|---|---:|---:|
| 11 pt | +0.117 | +0.125 |
| 11 pt, two columns | +0.125 | +0.125 |
| 12 pt | −0.383 | −0.125 |
| 16 pt | +0.250 | +0.500 |
| 20 pt | +0.248 | −0.125 |
| New 12 pt, two columns | −0.125 | −0.125 |
| New 12 pt, changed preceding content | −0.133 | −0.125 |

All fourteen comparisons pass, with maximum absolute error 0.50 pt. The original 12 pt endnote/footnote errors were −0.883/−0.875 pt; both now meet the existing limit. A separate 4/8/16 px-per-point control had confirmed that the earlier failure was not merely low-resolution measurement noise.

All seven before/after PDFs have identical page geometry and **zero changed pixels outside the tightly bounded separator rectangles** (Word x0..x1 ±1 pt and y top..bottom ±3 pt). This also protects other-column content, unlike a full-width excluded band. [The actual-PDF Word/Önce/Sonra comparison](../fixtures/compatibility/a7-5-note-probes/production-12pt-comparison.png) uses the same page coordinates without resizing the source ink; its companion provenance records the input hashes. The figure was visually inspected.

These are bounded rendering tolerances, not zero-error raster equivalence for every font or Word document. The previous 12 pt gate failure is closed without changing that gate.

## Local acceptance

Production compilation/TypeScript and focused lint pass. The ten-case endnote regression covers single/column, default/empty/authored, section scopes and nested lists. The production real Word footnote import → native DOCX → reopen → PDF check retains IDs, 600 words plus the second note exactly once, four GoTo links and continuation (`llnEmH`). Native import/PDF/Escape/reload has zero note errors; sixteen metric/font-edit/undo/content/identity/cache protections pass (`V6Ih13`).

The complete eight-file [production export](../fixtures/compatibility/a7-5-app-pdfs/exports.json), [raw comparison](../fixtures/compatibility/a7-5-report.json), [expanded column report](../fixtures/compatibility/a7-5-column-geometry.json) and [navigation report](../fixtures/compatibility/a7-5-navigation.json) preserve all earlier gates: every manifest anchor and expanded column case meets 1 CSS px, all 78 column markers retain physical page/column, and all ten links reveal the correct target. The raw five MEASURED/three MISMATCH count still records stale Word cache/link-count/viewport differences independently.

## Release

Local production acceptance is complete. Deployment and live acceptance are recorded here once finished.
