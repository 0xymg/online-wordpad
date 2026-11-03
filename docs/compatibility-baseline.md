# Word Online compatibility baseline

This baseline compares eight synthetic DOCX fixtures exported from Microsoft Word Online with PDFs exported from the live EDTRDocs editor. References were captured on 3 November 2026 UTC using native Word PDF export and each source document's page geometry. Fixtures explicitly specify Arial in document defaults and used styles. The exact Word Online build and Codex in-app browser engine version were not exposed and are unknown. Source, Word PDF and application PDF hashes are recorded alongside the files. See `fixtures/compatibility/baseline-report.json` for the machine-readable measurements and `scripts/compatibility/README.md` for reproduction.

All eight cases have at least one measured mismatch against the provisional 1 CSS pixel text-anchor target. The table reports page counts and the main observed differences; it does not imply an overall visual or editing pass.

| Fixture | Word / app pages | Observed comparison |
| --- | --- | --- |
| Basic | 1 / 1 | Text and page box match. Body text anchor positions are 12.6 and 15.1 CSS px higher in the app. |
| Mixed sections | 3 / 3 | Extracted text and page boxes match. The first section shares the basic vertical difference; the first anchors of sections 2 and 3 are within 0.7 CSS px. |
| Tabs and leaders | 1 / 1 | Extracted tokens match. The ending marker is 248.7 CSS px left of its Word position, consistent with unsupported tab positioning. |
| Columns | 1 / 1 | Extracted tokens match. The last marker is in Word's second column but appears in the app's first column. |
| Table in columns | 1 / 2 | All four table markers are extracted once in each output. Word places the table on page 1; the app places it on page 2. |
| Notes | 1 / 1 | Both note body markers are extracted once. The Word footnote is at the foot of the page; its app text-layer position is in body flow. Link counts differ: 2 in Word and 4 in the app. |
| Cross-references and TOC | 1 / 1 | Extracted token counts match. Word has one PDF link annotation and the app has none; marker positions differ. |
| Mixed | 2 / 2 | All expected markers are extracted once, but several occupy different pages or positions. Link counts differ: 3 in Word and 4 in the app. |

For the basic case, the imported DOM retains the source's Title spacing (15 pt after, automatic single line) and Normal spacing (10 pt after, 1.15 automatic line spacing). The editor maps those multiples to CSS `line-height: 1` and `1.15`; Word and the browser may use different font line metrics. The successive text-position differences and the near-matching section-start anchors suggest line-box behavior as a cause, but this remains a diagnosis to test, not a proven fix.

PDF text extraction can join or split adjacent text and note marks differently. Consequently token differences in the notes and mixed cases are evidence for inspection, not proof by themselves that characters were lost. PDF text-layer coordinates may differ from visible glyphs; no visual comparison has been scored. Link counts do not validate destinations. Source-to-editor model preservation, note/reference identity, field behavior, editability and Word round-trip functionality have not yet been established by this report. The browser version and actual fallback fonts cannot be fully verified from the available capture interface.
