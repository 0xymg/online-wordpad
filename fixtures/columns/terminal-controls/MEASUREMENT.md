# Word Online terminal-break references

The references are actual Word Online exports of the exact hashed sources listed in `manifest.json`. Capture metadata, source and PDF SHA-256, and text-layer page measurements are in the per-source provenance and measurement files. They are evidence about these Word exports, not application support.

| Source | PDF pages | Observation |
| --- | ---: | --- |
| One column, terminal column break | 2 | Page 1 contains `ONE_COLUMN_TEXT`; page 2 has no extracted words and was visually inspected at 72 dpi as white. |
| Two columns, terminal break in second column | 2 | Both markers are on page 1, in the first and second columns; page 2 has no extracted words and was visually inspected at 72 dpi as white. |
| One column, terminal page break | 1 | Page 1 contains `ONE_PAGE_TEXT`; no additional physical page appears in the PDF. |

The existing first-of-two-column terminal-break reference ended without an additional physical page. This new one-column result shows that observation does not generalize to a terminal break with no remaining column.
