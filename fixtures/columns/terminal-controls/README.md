# Terminal break controls

These three independent, synthetic single-section sources isolate what Word Online does after a break at the very end of a document. They use Letter portrait with one-inch margins, Arial 11 pt declared, and exact 14 pt line spacing. The final inline element of each source is the stated break; the only `sectPr` is the body-level final section. The generator checks source XML structure, break types and counts, markers, geometry and line spacing. SHA-256 hashes and pending reference status are in `manifest.json`.

- `terminal-one-column-break.docx`: text followed by a terminal column break in one column.
- `terminal-two-column-break.docx`: first marker, a column break, second marker, then a terminal column break in the last of two columns.
- `terminal-one-page-break.docx`: text followed by a terminal page break in one column.

Capture actual Word Online exports of these exact source bytes separately and retain PDF hashes and capture provenance. Once any PDF is present, the generator refuses to rewrite any source in this folder. Page count and blank-page observation are Word reference evidence only, not an application compatibility result. No assumptions about those outcomes are encoded in the sources.
