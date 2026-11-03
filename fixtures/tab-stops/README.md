# Tab-stop reference fixtures

These synthetic fixtures use real Word Online PDF exports or, for the metadata probe, a Word-edited DOCX download. Their matching `.provenance.json` files identify each source and reference by hash. Measurements cover selected anchors and line groupings, not full-page visual fidelity. The browser engine version used for the Word captures was not exposed; the sources specify Arial, but font fallback is not independently established.

- `tabs-rtl-probe`: selected left, right, center, and decimal anchors in LTR and RTL paragraphs, including indentation, consecutive tabs, and a table cell. The checked number anchors differ by less than one CSS pixel at the sampled zoom levels.
- `narrow-wrap-probe`: line grouping in a narrow table cell, including the decimal field's continuation lines.
- `decimal-wrap-variants`: controls for decimal stops in cells and outside tables, used to identify the implicit alignment of an initial cell field.
- `decimal-cell-no-tab`: cells with and without decimal stops, including initial text without an explicit tab; checked against Word's relative text positions.
- `decimal-metadata-probe`: Word-edited DOCX verifies preservation of the app's decimal-separator custom property and an unrelated custom property. Its saved Word-edited copy has only identifying core metadata anonymized; provenance records both hashes.

The earlier `../compatibility/tabs-leaders.docx` and `../compatibility/references/tabs-leaders.pdf` supply additional leader and alignment comparisons. App decimal-separator metadata does not set Word's regional decimal behavior. Unsupported native tab kinds and leaders are retained in source properties but are not necessarily rendered by the editor.
